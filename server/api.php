<?php
// Winterevent-Backend: prüft Codes, Spielzüge und Tresore serverseitig und misst die Zeiten.
// Aufruf über nginx: POST /api  (JSON-Body mit "a" = Aktion). Läuft mit PHP 8 + SQLite.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// ---------- Konfiguration ----------
$cfgPath = $_SERVER['WINTEREVENT_CONFIG'] ?? getenv('WINTEREVENT_CONFIG') ?: '/etc/winterevent/config.php';
if (!is_readable($cfgPath)) fail('Server ist noch nicht eingerichtet (Konfiguration fehlt).', 500);
$CFG = require $cfgPath; // admin_password_hash, secret, morland_digits, db, test_tools, site_url
$C = json_decode((string)file_get_contents(__DIR__ . '/content.json'), true);
$ST = $C['stations'];
$COUNT = count($ST);
$LAST = $COUNT - 1;

// ---------- Hilfsfunktionen ----------
function out(array $d): never { echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function fail(string $msg, int $code = 400, array $extra = []): never { http_response_code($code); out(['ok' => false, 'error' => $msg] + $extra); }
function now(): int { return (int) floor(microtime(true) * 1000); }
function norm(string $s): string {
  $s = mb_strtoupper($s, 'UTF-8');
  $s = strtr($s, ['Ä' => 'AE', 'Ö' => 'OE', 'Ü' => 'UE', 'ẞ' => 'SS', 'ß' => 'SS']);
  return preg_replace('/[^A-Z0-9]/', '', $s) ?? '';
}
function rnd(int $n): int { return random_int(0, $n - 1); }
function shuffled(array $a): array { for ($i = count($a) - 1; $i > 0; $i--) { $j = random_int(0, $i); [$a[$i], $a[$j]] = [$a[$j], $a[$i]]; } return $a; }
function randCode(int $n = 5): string { $A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $s = ''; for ($i = 0; $i < $n; $i++) $s .= $A[rnd(32)]; return $s; }
function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function ub64u(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/')); }
function sign(string $data): string { global $CFG; return b64u(hash_hmac('sha256', $data, $CFG['secret'], true)); }

// ---------- Datenbank ----------
$db = new PDO('sqlite:' . $CFG['db']);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
$db->exec('CREATE TABLE IF NOT EXISTS teams(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at INTEGER, created_by TEXT, finished_at INTEGER, zielcode TEXT);
CREATE TABLE IF NOT EXISTS codes(code TEXT PRIMARY KEY, team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE, stage INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS progress(team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE, stage INTEGER NOT NULL, answer TEXT, unlocked_at INTEGER, solved_at INTEGER, opened_at INTEGER, game TEXT, PRIMARY KEY(team_id, stage));
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, team_id INTEGER, at INTEGER, type TEXT, stage INTEGER, info TEXT);
CREATE TABLE IF NOT EXISTS hits(k TEXT, at INTEGER);
CREATE INDEX IF NOT EXISTS hits_k ON hits(k, at);');

function q(string $sql, array $p = []): PDOStatement { global $db; $s = $db->prepare($sql); $s->execute($p); return $s; }
function event(int $team, string $type, int $stage, string $info = ''): void { q('INSERT INTO events(team_id, at, type, stage, info) VALUES(?,?,?,?,?)', [$team, now(), $type, $stage, $info]); }
// Bremse gegen Durchprobieren
function limit(string $key, int $max, int $windowSec): void {
  $t = now(); q('DELETE FROM hits WHERE at < ?', [$t - 3600 * 1000]);
  $n = (int) q('SELECT COUNT(*) FROM hits WHERE k = ? AND at > ?', [$key, $t - $windowSec * 1000])->fetchColumn();
  if ($n >= $max) fail('Zu viele Versuche. Wartet kurz und versucht es dann erneut.', 429);
  q('INSERT INTO hits(k, at) VALUES(?,?)', [$key, $t]);
}

// ---------- Eingabe ----------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Nur POST erlaubt.', 405);
$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) fail('Ungültige Anfrage.');
$a = (string) ($in['a'] ?? '');
$ip = $_SERVER['REMOTE_ADDR'] ?? 'x';

// ---------- Tokens ----------
function teamToken(int $id): string { $d = 't.' . $id; return b64u($d) . '.' . sign($d); }
function teamFromToken(?string $tok): ?array {
  if (!$tok || !str_contains($tok, '.')) return null;
  [$d, $s] = explode('.', $tok, 2); $data = ub64u($d);
  if (!hash_equals(sign($data), $s) || !str_starts_with($data, 't.')) return null;
  return q('SELECT * FROM teams WHERE id = ?', [(int) substr($data, 2)])->fetch() ?: null;
}
function adminToken(string $name): string { $d = 'a.' . (time() + 14 * 3600) . '.' . b64u($name); return b64u($d) . '.' . sign($d); }
function adminFromToken(?string $tok): ?string {
  if (!$tok || !str_contains($tok, '.')) return null;
  [$d, $s] = explode('.', $tok, 2); $data = ub64u($d);
  if (!hash_equals(sign($data), $s)) return null;
  $p = explode('.', $data, 3);
  if (count($p) !== 3 || $p[0] !== 'a' || (int) $p[1] < time()) return null;
  return ub64u($p[2]);
}
function needTeam(): array { global $in; $t = teamFromToken($in['token'] ?? null); if (!$t) fail('Bitte neu anmelden.', 401); return $t; }
function needAdmin(): string { global $in; $n = adminFromToken($in['admin'] ?? null); if ($n === null) fail('Admin-Anmeldung abgelaufen. Bitte neu anmelden.', 401); return $n; }

// ---------- Spiel-Logik ----------
function stationInfo(int $k): array {
  global $ST, $C, $LAST;
  $s = $ST[$k];
  $o = array_intersect_key($s, array_flip(['id', 'name', 'game', 'title', 'intro', 'nextHint', 'map', 'labelPos', 'arrive']));
  if ($k === $LAST) $o['winterMap'] = $C['winterMap'];
  return $o;
}
function rows(int $team): array { $r = []; foreach (q('SELECT * FROM progress WHERE team_id = ? ORDER BY stage', [$team])->fetchAll() as $p) $r[(int) $p['stage']] = $p; return $r; }
function answerOf(array $row): string { global $CFG; return (int) $row['stage'] === 0 ? norm((string) $CFG['morland_digits']) : (string) $row['answer']; }

// Schiebepuzzle: kürzeste Lösung per Breitensuche
function slideNeighbors(int $c): array { $r = []; if ($c >= 3) $r[] = $c - 3; if ($c < 6) $r[] = $c + 3; if ($c % 3) $r[] = $c - 1; if (($c + 1) % 3) $r[] = $c + 1; return $r; }
function slideDistance(array $pos): int {
  $goal = '0,1,2,3,4,5,6,7,8'; $start = implode(',', $pos); if ($start === $goal) return 0;
  $seen = [$start => true]; $frontier = [$pos]; $d = 0;
  while ($frontier && $d < 30) {
    $d++; $next = [];
    foreach ($frontier as $p) foreach (slideNeighbors($p[8]) as $c) {
      $t = array_search($c, $p, true); $n = $p; $n[$t] = $p[8]; $n[8] = $c; $k = implode(',', $n);
      if ($k === $goal) return $d;
      if (!isset($seen[$k])) { $seen[$k] = true; $next[] = $n; }
    }
    $frontier = $next;
  }
  return 99;
}
function newGame(string $type): ?array {
  global $C;
  switch ($type) {
    case 'memory': return ['deck' => shuffled(array_merge($C['memory']['kinds'], $C['memory']['kinds'])), 'matched' => [], 'open' => null];
    case 'detective': return ['found' => []];
    case 'wordscramble':
      $mix = [];
      foreach ($C['wordscramble'] as $w) { $word = norm($w['word']); do { $m = implode('', shuffled(str_split($word))); } while ($m === $word && strlen($word) > 1); $mix[] = $m; }
      return ['mix' => $mix, 'solved' => []];
    case 'slidepuzzle':
      do {
        $pos = range(0, 8); $prev = -1;
        for ($i = 0; $i < 40; $i++) { $e = $pos[8]; $opts = array_values(array_filter(slideNeighbors($e), fn($c) => $c !== $prev)); $tg = $opts[rnd(count($opts))]; $t = array_search($tg, $pos, true); $pos[$t] = $e; $pos[8] = $tg; $prev = $e; }
        $d = slideDistance($pos);
      } while ($d < 10 || $d > 14);
      return ['pos' => $pos, 'start' => $pos];
  }
  return null;
}
function revealed(array $row, int $n): string { return substr(answerOf($row), 0, max(0, $n)); }
// Öffentliche Sicht auf ein Spiel (ohne Lösungen)
function gamePublic(array $row): array {
  global $C;
  $k = (int) $row['stage']; $g = json_decode((string) $row['game'], true) ?? [];
  $type = $GLOBALS['ST'][$k]['game']; $solved = !empty($row['solved_at']); $len = strlen(answerOf($row));
  switch ($type) {
    case 'riddles':
      return ['type' => $type, 'riddles' => array_map(fn($r) => $r['text'], $C['morland']['riddles']), 'mode' => $C['morland']['mode'], 'digits' => $g['digits'] ?? (object) []];
    case 'memory':
      $faces = []; foreach ($g['matched'] as $i) $faces[$i] = $g['deck'][$i];
      return ['type' => $type, 'cards' => count($g['deck']), 'faces' => (object) $faces, 'len' => $len, 'revealed' => revealed($row, intdiv(count($g['matched']), 2)), 'solved' => $solved];
    case 'detective':
      return ['type' => $type, 'labels' => array_map(fn($o) => ['id' => $o['id'], 'label' => $o['label']], $C['detective']['objects']), 'found' => $g['found'], 'len' => $len, 'revealed' => revealed($row, count($g['found'])), 'solved' => $solved,
        'marks' => array_values(array_map(fn($o) => ['x' => $o['x'], 'y' => $o['y']], array_filter($C['detective']['objects'], fn($o) => in_array($o['id'], $g['found'], true))))];
    case 'wordscramble':
      $words = []; foreach ($C['wordscramble'] as $i => $w) $words[] = ['mix' => $g['mix'][$i], 'hint' => $w['hint'], 'solved' => in_array($i, $g['solved'], true) ? norm($w['word']) : null];
      return ['type' => $type, 'words' => $words, 'len' => $len, 'revealed' => revealed($row, count($g['solved'])), 'solved' => $solved];
    case 'slidepuzzle':
      return ['type' => $type, 'pos' => $g['start'], 'len' => $len, 'solved' => $solved, 'revealed' => $solved ? answerOf($row) : ''];
  }
  return ['type' => $type];
}
function teamState(array $team): array {
  global $COUNT, $LAST;
  $rows = rows((int) $team['id']); $stations = []; $prog = []; $games = []; $max = -1;
  foreach ($rows as $k => $r) {
    if ($r['unlocked_at']) { $max = max($max, $k); $stations[$k] = stationInfo($k); if ($k < $LAST) $games[$k] = gamePublic($r); }
    $p = ['unlocked' => (bool) $r['unlocked_at'], 'solved' => (bool) $r['solved_at'], 'opened' => (bool) $r['opened_at']];
    if ($r['opened_at'] && $k < $LAST) { $p['nextCode'] = q('SELECT code FROM codes WHERE team_id = ? AND stage = ?', [$team['id'], $k + 1])->fetchColumn(); $stations[$k + 1] = stationInfo($k + 1); }
    $prog[$k] = $p;
  }
  $s = ['ok' => true, 'team' => $team['name'], 'count' => $COUNT, 'stage' => $max, 'stations' => (object) $stations, 'progress' => (object) $prog, 'games' => (object) $games];
  if ($team['finished_at']) { $s['finishedAt'] = (int) $team['finished_at']; $s['zielcode'] = $team['zielcode']; $s['rank'] = rankOf($team); }
  return $s;
}
function rankOf(array $team): int { return 1 + (int) q('SELECT COUNT(*) FROM teams WHERE finished_at IS NOT NULL AND finished_at < ?', [$team['finished_at']])->fetchColumn(); }
function markSolved(array $team, array $row): void {
  if ($row['solved_at']) return;
  q('UPDATE progress SET solved_at = ? WHERE team_id = ? AND stage = ?', [now(), $team['id'], $row['stage']]);
  event((int) $team['id'], 'solved', (int) $row['stage']);
}
function saveGame(array $team, int $k, array $g): void { q('UPDATE progress SET game = ? WHERE team_id = ? AND stage = ?', [json_encode($g), $team['id'], $k]); }
function unlock(array $team, int $k): void {
  global $LAST;
  $r = q('SELECT * FROM progress WHERE team_id = ? AND stage = ?', [$team['id'], $k])->fetch();
  if ($r['unlocked_at']) return;
  q('UPDATE progress SET unlocked_at = ? WHERE team_id = ? AND stage = ?', [now(), $team['id'], $k]);
  event((int) $team['id'], 'unlock', $k);
  if ($k === $LAST && !$team['finished_at']) {
    q('UPDATE teams SET finished_at = ? WHERE id = ?', [now(), $team['id']]);
    event((int) $team['id'], 'finish', $k);
  }
}

// ============ Aktionen für Teams ============
switch ($a) {
  case 'meta': // öffentliche Infos für die Startseite (keine Orte, keine Lösungen)
    out(['ok' => true, 'eventName' => $C['eventName'], 'clubName' => $C['clubName'], 'subtitle' => $C['subtitle'], 'count' => $COUNT,
      'mapImage' => $C['mapImage'], 'mapSize' => $C['mapSize'], 'mapView' => $C['mapView']]);

  case 'login': // Startcode oder Ortscode
    limit('login:' . $ip, 30, 60);
    $code = norm((string) ($in['code'] ?? ''));
    $row = $code ? q('SELECT c.*, t.name FROM codes c JOIN teams t ON t.id = c.team_id WHERE REPLACE(c.code, \'-\', \'\') = ?', [$code])->fetch() : null;
    if (!$row) fail('Diesen Code kennen wir nicht. Prüft die Schreibweise.', 404);
    $k = (int) $row['stage']; $tid = (int) $row['team_id'];
    $cur = teamFromToken($in['token'] ?? null);
    if ($cur && (int) $cur['id'] !== $tid && !empty($in['unlockOnly'])) fail('Dieser Code gehört zu einem anderen Team!', 403);
    if ($k > 0) { // Ortscode gilt erst, wenn der Tresor davor geöffnet wurde
      $prev = q('SELECT opened_at FROM progress WHERE team_id = ? AND stage = ?', [$tid, $k - 1])->fetchColumn();
      if (!$prev) fail('Diesen Ort habt ihr noch nicht erreicht.', 403);
    }
    $team = q('SELECT * FROM teams WHERE id = ?', [$tid])->fetch();
    unlock($team, $k);
    $team = q('SELECT * FROM teams WHERE id = ?', [$tid])->fetch();
    out(teamState($team) + ['token' => teamToken($tid), 'unlocked' => $k]);

  case 'state':
    out(teamState(needTeam()));

  case 'vault': {
    $team = needTeam(); $k = (int) ($in['stage'] ?? -1);
    limit('vault:' . $team['id'], 12, 60);
    $r = q('SELECT * FROM progress WHERE team_id = ? AND stage = ?', [$team['id'], $k])->fetch();
    if (!$r || !$r['unlocked_at'] || $k >= $LAST) fail('Dieser Tresor ist noch nicht erreichbar.', 403);
    if (!$r['opened_at']) {
      if (!hash_equals(answerOf($r), norm((string) ($in['answer'] ?? '')))) { event((int) $team['id'], 'vault_fail', $k); fail('Klack. Der Tresor bleibt zu. Versucht es nochmal!', 422); }
      markSolved($team, $r);
      q('UPDATE progress SET opened_at = ? WHERE team_id = ? AND stage = ?', [now(), $team['id'], $k]);
      event((int) $team['id'], 'opened', $k);
    }
    $next = q('SELECT code FROM codes WHERE team_id = ? AND stage = ?', [$team['id'], $k + 1])->fetchColumn();
    out(['ok' => true, 'nextCode' => $next, 'next' => stationInfo($k + 1)] + ['state' => teamState($team)]);
  }

  case 'game': {
    $team = needTeam(); $k = (int) ($in['stage'] ?? -1); $op = (string) ($in['op'] ?? '');
    limit('game:' . $team['id'], 240, 60);
    $r = q('SELECT * FROM progress WHERE team_id = ? AND stage = ?', [$team['id'], $k])->fetch();
    if (!$r || !$r['unlocked_at'] || $k >= $LAST) fail('Diese Station ist noch verschlossen.', 403);
    $g = json_decode((string) $r['game'], true) ?? []; $type = $ST[$k]['game'];
    if ($type === 'riddles' && $op === 'place') { // Web-Modus: Ort erraten -> Zahl
      limit('place:' . $team['id'], 20, 60);
      $i = (int) ($in['i'] ?? -1); $rid = $C['morland']['riddles'][$i] ?? null;
      if (!$rid || $C['morland']['mode'] !== 'web') fail('Nicht möglich.');
      $ok = in_array(norm((string) ($in['place'] ?? '')), array_map('norm', $rid['accept']), true);
      if ($ok) { $g['digits'][$i] = substr(answerOf($r), $i, 1); saveGame($team, $k, $g); }
      out(['ok' => true, 'correct' => $ok, 'game' => gamePublic(q('SELECT * FROM progress WHERE team_id = ? AND stage = ?', [$team['id'], $k])->fetch())]);
    }
    if ($type === 'memory' && $op === 'flip') {
      $i = (int) ($in['i'] ?? -1);
      if (!isset($g['deck'][$i]) || in_array($i, $g['matched'], true)) fail('Diese Karte geht nicht.');
      $res = ['ok' => true, 'i' => $i, 'kind' => $g['deck'][$i]];
      if ($g['open'] === null || $g['open'] === $i) { $g['open'] = $i; }
      else {
        $j = $g['open']; $g['open'] = null; $res['other'] = $j; $res['otherKind'] = $g['deck'][$j];
        $res['match'] = $g['deck'][$i] === $g['deck'][$j];
        if ($res['match']) { $g['matched'][] = $j; $g['matched'][] = $i; }
      }
      saveGame($team, $k, $g);
      $r['game'] = json_encode($g);
      if (count($g['matched']) === count($g['deck'])) { markSolved($team, $r); $r['solved_at'] = 1; }
      out($res + ['game' => gamePublic($r)]);
    }
    if ($type === 'detective' && $op === 'click') {
      limit('click:' . $team['id'], 40, 20); // gegen wildes Durchklicken
      $x = (float) ($in['x'] ?? -1); $y = (float) ($in['y'] ?? -1); $scale = min(3.0, max(1.0, (float) ($in['scale'] ?? 1)));
      $hit = null;
      foreach ($C['detective']['objects'] as $o) {
        if (in_array($o['id'], $g['found'], true)) continue;
        $rad = max($o['r'] ?? 26, (isset($o['r']) ? 11 : 18) * $scale);
        if (hypot($o['x'] - $x, $o['y'] - $y) < $rad) { $hit = $o; break; }
      }
      if ($hit) { $g['found'][] = $hit['id']; saveGame($team, $k, $g); $r['game'] = json_encode($g); if (count($g['found']) === count($C['detective']['objects'])) { markSolved($team, $r); $r['solved_at'] = 1; } }
      out(['ok' => true, 'hit' => $hit ? $hit['id'] : null, 'game' => gamePublic($r)]);
    }
    if ($type === 'wordscramble' && $op === 'guess') {
      $i = (int) ($in['i'] ?? -1); $w = $C['wordscramble'][$i] ?? null;
      if (!$w) fail('Unbekanntes Wort.');
      $ok = norm((string) ($in['word'] ?? '')) === norm($w['word']);
      if ($ok && !in_array($i, $g['solved'], true)) { $g['solved'][] = $i; saveGame($team, $k, $g); $r['game'] = json_encode($g); if (count($g['solved']) === count($C['wordscramble'])) { markSolved($team, $r); $r['solved_at'] = 1; } }
      out(['ok' => true, 'correct' => $ok, 'game' => gamePublic($r)]);
    }
    if ($type === 'slidepuzzle' && $op === 'solve') { // Züge nachspielen und prüfen
      $pos = $g['start']; $moves = array_slice((array) ($in['moves'] ?? []), 0, 2000);
      foreach ($moves as $t) { $t = (int) $t; if ($t < 0 || $t > 7 || !in_array($pos[$t], slideNeighbors($pos[8]), true)) fail('Ungültiger Zug.'); [$pos[$t], $pos[8]] = [$pos[8], $pos[$t]]; }
      if ($pos !== range(0, 8)) fail('Das Bild ist noch nicht fertig.', 422);
      markSolved($team, $r); $r['solved_at'] = 1;
      out(['ok' => true, 'game' => gamePublic($r)]);
    }
    fail('Unbekannte Spielaktion.');
  }

  case 'test_solve': { // NUR ZUM TESTEN – später entfernen (config: test_tools => false)
    if (empty($CFG['test_tools'])) fail('Testwerkzeuge sind ausgeschaltet.', 403);
    needAdmin(); $team = needTeam(); $k = (int) ($in['stage'] ?? -1);
    $r = q('SELECT * FROM progress WHERE team_id = ? AND stage = ?', [$team['id'], $k])->fetch();
    if (!$r || !$r['unlocked_at'] || $k >= $LAST) fail('Station nicht erreichbar.', 403);
    markSolved($team, $r);
    out(['ok' => true, 'answer' => answerOf($r)]);
  }
}

// ============ Admin ============
switch ($a) {
  case 'admin_login':
    limit('admin:' . $ip, 6, 60);
    $name = trim(mb_substr((string) ($in['name'] ?? ''), 0, 40));
    if ($name === '') fail('Bitte gib deinen Namen ein.');
    if (!password_verify((string) ($in['password'] ?? ''), (string) $CFG['admin_password_hash'])) fail('Falsches Passwort.', 401);
    out(['ok' => true, 'admin' => adminToken($name), 'name' => $name, 'testTools' => !empty($CFG['test_tools'])]);

  case 'admin_overview': {
    needAdmin();
    $teams = q('SELECT * FROM teams ORDER BY created_at')->fetchAll(); $list = [];
    foreach ($teams as $t) {
      $rows = rows((int) $t['id']); $stage = -1; $last = (int) $t['created_at']; $times = [];
      foreach ($rows as $k => $r) {
        if ($r['unlocked_at']) $stage = $k;
        foreach (['unlocked_at', 'solved_at', 'opened_at'] as $f) if ($r[$f]) $last = max($last, (int) $r[$f]);
        $times[$k] = ['unlocked' => $r['unlocked_at'] ? (int) $r['unlocked_at'] : null, 'opened' => $r['opened_at'] ? (int) $r['opened_at'] : null];
      }
      $list[] = ['id' => (int) $t['id'], 'name' => $t['name'], 'startCode' => q('SELECT code FROM codes WHERE team_id = ? AND stage = 0', [$t['id']])->fetchColumn(),
        'createdBy' => $t['created_by'], 'createdAt' => (int) $t['created_at'], 'stage' => $stage, 'stageName' => $stage >= 0 ? $ST[$stage]['name'] : null,
        'waiting' => $stage >= 0 && $stage < $LAST && !empty($rows[$stage]['opened_at']), 'finishedAt' => $t['finished_at'] ? (int) $t['finished_at'] : null,
        'rank' => $t['finished_at'] ? rankOf($t) : null, 'lastActivity' => $last, 'times' => $times];
    }
    $ev = q('SELECT e.*, t.name FROM events e LEFT JOIN teams t ON t.id = e.team_id WHERE e.type != \'vault_fail\' ORDER BY e.id DESC LIMIT 40')->fetchAll();
    out(['ok' => true, 'now' => now(), 'count' => $COUNT, 'stations' => array_map(fn($s) => $s['name'], $ST), 'teams' => $list,
      'events' => array_map(fn($e) => ['at' => (int) $e['at'], 'team' => $e['name'], 'type' => $e['type'], 'stage' => (int) $e['stage'], 'station' => $ST[(int) $e['stage']]['name'] ?? ''], $ev),
      'siteUrl' => $CFG['site_url'] ?? '', 'testTools' => !empty($CFG['test_tools'])]);
  }

  case 'admin_create': {
    $by = needAdmin();
    $name = trim(preg_replace('/\s+/', ' ', mb_substr((string) ($in['name'] ?? ''), 0, 60)));
    if ($name === '') fail('Bitte einen Clubnamen eingeben.');
    if (q('SELECT 1 FROM teams WHERE name = ?', [$name])->fetchColumn()) fail("„{$name}“ gibt es schon.", 409);
    $db->beginTransaction();
    q('INSERT INTO teams(name, created_at, created_by, zielcode) VALUES(?,?,?,?)', [$name, now(), $by, 'ZIEL-' . randCode()]);
    $tid = (int) $db->lastInsertId();
    // Tresorwörter: möglichst je Club verschieden
    $used = array_column(q('SELECT answer FROM progress WHERE answer IS NOT NULL')->fetchAll(), 'answer');
    $pick = function (array $pool, int $len = 0) use (&$used) { $c = array_values(array_filter($pool, fn($w) => !in_array($len ? str_pad(substr($w, 0, $len), $len, 'X') : $w, $used, true))); $w = ($c ?: $pool)[rnd(count($c ?: $pool))]; $w = $len ? str_pad(substr($w, 0, $len), $len, 'X') : $w; $used[] = $w; return $w; };
    foreach ($ST as $k => $s) {
      do { $code = $s['codePrefix'] . '-' . randCode(); } while (q('SELECT 1 FROM codes WHERE code = ?', [$code])->fetchColumn());
      q('INSERT INTO codes(code, team_id, stage) VALUES(?,?,?)', [$code, $tid, $k]);
      $answer = match ($s['game']) { 'memory' => $pick($C['words6']), 'detective', 'slidepuzzle' => $pick($C['words5']), 'wordscramble' => $pick($C['words6'], count($C['wordscramble'])), default => null };
      $game = newGame($s['game']);
      q('INSERT INTO progress(team_id, stage, answer, game) VALUES(?,?,?,?)', [$tid, $k, $answer, $game ? json_encode($game) : null]);
    }
    event($tid, 'created', 0, $by);
    $db->commit();
    out(['ok' => true, 'id' => $tid, 'name' => $name, 'startCode' => q('SELECT code FROM codes WHERE team_id = ? AND stage = 0', [$tid])->fetchColumn()]);
  }

  case 'admin_delete':
    needAdmin(); q('DELETE FROM teams WHERE id = ?', [(int) ($in['id'] ?? 0)]); out(['ok' => true]);

  case 'admin_reset': { // Fortschritt zurücksetzen, Codes bleiben
    needAdmin(); $tid = (int) ($in['id'] ?? 0);
    q('UPDATE teams SET finished_at = NULL WHERE id = ?', [$tid]);
    foreach (rows($tid) as $k => $r) { $g = newGame($ST[$k]['game']); q('UPDATE progress SET unlocked_at = NULL, solved_at = NULL, opened_at = NULL, game = ? WHERE team_id = ? AND stage = ?', [$g ? json_encode($g) : null, $tid, $k]); }
    event($tid, 'reset', 0); out(['ok' => true]);
  }

  case 'admin_codes': { // alle Codes eines Clubs (für Hilfe vor Ort)
    needAdmin(); $tid = (int) ($in['id'] ?? 0); $res = [];
    foreach (rows($tid) as $k => $r) $res[] = ['station' => $ST[$k]['name'], 'code' => q('SELECT code FROM codes WHERE team_id = ? AND stage = ?', [$tid, $k])->fetchColumn(), 'tresor' => $k < $LAST ? answerOf($r) : null];
    $z = q('SELECT zielcode FROM teams WHERE id = ?', [$tid])->fetchColumn();
    out(['ok' => true, 'codes' => $res, 'zielcode' => $z]);
  }
}

fail('Unbekannte Aktion.', 404);
