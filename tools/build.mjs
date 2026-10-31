#!/usr/bin/env node
// Erzeugt aus config/event.json die verschlüsselten Spieldaten (docs/data.js)
// und die Code-Übersicht für die Eventleitung (CODES.md).
//
//   node tools/build.mjs          -> fehlende Codes ergänzen, Website-Daten bauen
//   node tools/build.mjs --neu    -> ALLE Codes neu würfeln (Achtung: alte DMs ungültig!)

import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG_PATH = path.join(ROOT, 'config', 'event.json');
const OUT_DATA = path.join(ROOT, 'docs', 'data.js');
const OUT_CODES = path.join(ROOT, 'CODES.md');
const ITERATIONS = 120000;
const REGENERATE = process.argv.includes('--neu');

if (!fs.existsSync(CFG_PATH)) {
  console.error('✘ config/event.json fehlt. Kopiere config/event.example.json nach config/event.json und trage die Morland-Zahlen ein.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
if (!cfg.morland.riddles.every((r) => /^[0-9]$/.test(r.digit))) {
  console.error('✘ Bitte in config/event.json bei morland.riddles[].digit die echten Zahlen (0–9) eintragen.');
  process.exit(1);
}
const stations = cfg.stations;
const LAST = stations.length - 1;

// ---------- Hilfsfunktionen ----------
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O/1/I – leichter abzutippen
const randInt = (n) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
};
const randChars = (n) => Array.from({ length: n }, () => ALPH[randInt(ALPH.length)]).join('');
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const norm = (s) =>
  String(s)
    .toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .replace(/[^A-Z0-9]/g, '');
const enc = (s) => new TextEncoder().encode(s);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const hex = (u8) => Buffer.from(u8).toString('hex');

async function derive(secret, salt) {
  const base = await crypto.subtle.importKey('raw', enc(norm(secret)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc(salt), iterations: ITERATIONS }, base, 512)
  );
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt']);
  return { key, id: hex(bits.slice(32, 48)) };
}
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc(JSON.stringify(obj))));
  return { iv: b64(iv), ct: b64(ct) };
}

// ---------- Codes vergeben ----------
const POOL6 = ['SCHNEE', 'FOHLEN', 'GLOCKE', 'KERZEN', 'WINTER', 'ZUCKER', 'GALOPP', 'TRENSE', 'ADVENT', 'NORDEN',
  'MANTEL', 'MISTEL', 'FALKEN', 'FUNKEL', 'ZAUBER', 'STERNE', 'WOLKEN', 'SCHLAF', 'GEWEIH', 'KAMINE'];
const POOL5 = ['STERN', 'HAFER', 'STROH', 'KUFEN', 'FROST', 'APFEL', 'KEKSE', 'ZWEIG', 'PONYS', 'ENGEL', 'KRONE',
  'MAGIE', 'NEBEL', 'SCHAL', 'LICHT', 'KERZE', 'WOLKE', 'BEERE', 'GLANZ', 'MONDE'];

const usedCodes = new Set();
for (const t of cfg.teams) for (const c of Object.values(t.codes || {})) if (typeof c === 'string') usedCodes.add(norm(c));
const uniqueCode = (prefix) => {
  let c;
  do c = `${prefix}-${randChars(5)}`; while (usedCodes.has(norm(c)));
  usedCodes.add(norm(c));
  return c;
};

const p6 = shuffle(POOL6), p5 = shuffle(POOL5);
const nWordScramble = cfg.wordscramble.length;
cfg.teams.forEach((team, i) => {
  if (REGENERATE || !team.codes) team.codes = {};
  const c = team.codes;
  // Orts-/Zugangscodes: stationCodes[k] schaltet Station k frei (k = 0 ist der Startcode per DM)
  c.stationCodes = c.stationCodes || stations.map((s) => uniqueCode(s.codePrefix));
  c.zielcode = c.zielcode || uniqueCode('ZIEL');
  // Tresorcodes der Minispiele (je Team unterschiedlich)
  const memoryWord = p6[(2 * i) % p6.length];
  const scrambleBase = p6[(2 * i + 1) % p6.length];
  c.tresor = c.tresor || {
    'doyles-abby': memoryWord,
    'silverglade-village': p5[(2 * i) % p5.length],
    'nilmers-hochland': scrambleBase.slice(0, nWordScramble).padEnd(nWordScramble, 'X'),
    'silverglade-schloss': p5[(2 * i + 1) % p5.length],
  };
});

// ---------- verschlüsseln ----------
const salt = REGENERATE || !cfg._salt ? randChars(16) : cfg._salt;
cfg._salt = salt;
const morlandAnswer = cfg.morland.riddles.map((r) => r.digit).join('');
// Infos zu einem Ort – landen NUR verschlüsselt in den Daten (erst sichtbar, wenn der Ort freigeschaltet bzw. verraten ist)
const info = (k) => {
  const { id, name, game, title, intro, nextHint, map, labelPos, arrive } = stations[k];
  const o = { id, name, game, title, intro, nextHint, map, labelPos, arrive };
  if (k === LAST && cfg.winterMap) o.winterMap = cfg.winterMap;
  return o;
};
const entries = [];

for (const [ti, team] of cfg.teams.entries()) {
  const codes = team.codes;
  for (let k = 0; k <= LAST; k++) {
    const st = stations[k];
    const payload = { team: team.name, teamIndex: ti, stage: k, station: info(k), trail: stations.slice(0, k).map((_, j) => info(j)) };
    if (k === LAST) {
      payload.zielcode = codes.zielcode;
    } else {
      const answer = k === 0 ? morlandAnswer : codes.tresor[st.id];
      if (k > 0) payload.answer = answer;
      if (st.game === 'wordscramble') payload.words = cfg.wordscramble.map((w) => ({ word: norm(w.word), hint: w.hint }));
      if (k === 0) payload.riddleTexts = cfg.morland.riddles.map((r) => r.text);
        if (k === 0 && cfg.morland.mode === 'web') {
        payload.riddles = cfg.morland.riddles.map((r) => ({ accept: r.accept.map(norm), digit: r.digit, place: r.place }));
      }
      const vaultSalt = `${salt}|tresor|${randChars(10)}`;
      const vk = await derive(answer, vaultSalt);
      payload.vault = { salt: vaultSalt, ...(await seal(vk.key, { nextCode: codes.stationCodes[k + 1], next: info(k + 1) })) };
    }
    const { key, id } = await derive(codes.stationCodes[k], salt);
    entries.push([id, await seal(key, payload)]);
  }
}

const publicData = {
  v: 2,
  eventName: cfg.eventName,
  clubName: cfg.clubName,
  subtitle: cfg.subtitle,
  iterations: ITERATIONS,
  salt,
  morlandMode: cfg.morland.mode,
  mapImage: cfg.mapImage,
  mapSize: cfg.mapSize,
  mapView: cfg.mapView,
  count: stations.length, // nur die Anzahl ist öffentlich – keine Namen, keine Positionen
  entries: Object.fromEntries(shuffle(entries)),
};

fs.writeFileSync(
  OUT_DATA,
  `// Automatisch erzeugt von tools/build.mjs – nicht von Hand bearbeiten.\nwindow.EVENT_DATA = ${JSON.stringify(publicData)};\n`
);
fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2) + '\n');

// ---------- Übersicht für die Eventleitung ----------
let md = `# 🔐 Code-Übersicht – ${cfg.clubName} ${cfg.subtitle}\n\n`;
md += `> **Nur für die Eventleitung!** Diese Datei ist geheim und darf **nicht** ins (öffentliche) Repo hochgeladen werden!\n\n`;
md += `## Startcodes (per DM an die Teams)\n\n| Team | Startcode |\n|---|---|\n`;
for (const t of cfg.teams) md += `| ${t.name} | \`${t.codes.stationCodes[0]}\` |\n`;
md += `\n## Ablauf & Lösungen je Team\n\n`;
md += `Der Tresor in **${stations[0].name}** wird bei allen Teams mit **${morlandAnswer}** geöffnet `;
md += `(${cfg.morland.riddles.map((r, i) => `${i + 1}. ${r.place} = ${r.digit}`).join(', ')}).\n\n`;
for (const t of cfg.teams) {
  md += `### ${t.name}\n\n| Station | Ortscode (schaltet Station frei) | Tresorcode |\n|---|---|---|\n`;
  stations.forEach((s, k) => {
    const tresor = k === 0 ? morlandAnswer : k === LAST ? '–' : t.codes.tresor[s.id];
    md += `| ${k + 1}. ${s.name} – ${s.title} | \`${t.codes.stationCodes[k]}\` | \`${tresor}\` |\n`;
  });
  md += `| 🏁 Zielcode (zum Nachweis per DM) | \`${t.codes.zielcode}\` | |\n\n`;
}
fs.writeFileSync(OUT_CODES, md);

console.log(`✔ ${cfg.teams.length} Teams, ${entries.length} verschlüsselte Einträge -> docs/data.js`);
console.log('✔ Code-Übersicht -> CODES.md');
