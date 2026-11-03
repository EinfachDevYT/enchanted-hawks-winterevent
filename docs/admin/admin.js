// Eventleitung & Helfer: Ankünfte bestätigen, Clubs anlegen, Event live verfolgen. Alle Daten kommen vom Server (/api).
(function () {
  const STORE = 'ehw-admin', STATION_STORE = 'ehw-admin-station';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let auth = null; try { auth = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (_) {}
  let data = null, timer = null;
  const isAdmin = () => auth?.role !== 'h';
  const myStation = () => { try { return localStorage.getItem(STATION_STORE) || 'all'; } catch (_) { return 'all'; } };

  async function api(a, body = {}) {
    let r; try { r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, admin: auth?.admin, ...body }) }); }
    catch (_) { throw new Error('Keine Verbindung zum Server.'); }
    let j = null; try { j = await r.json(); } catch (_) {}
    if (!j || !j.ok) { const e = new Error(j?.error || 'Serverfehler.'); e.status = r.status; throw e; }
    return j;
  }
  let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Kopiert'); }
    catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand('copy'); toast('Kopiert'); } catch (_) { toast('Bitte manuell kopieren'); } ta.remove(); }
  }
  const time = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.round(s / 60)} min` : time(ms); };
  const site = () => data?.siteUrl || location.origin;
  const dmText = (t) => `❄️ Schnitzeljagd durch Jorvik · Winterevent der Enchanted Hawks\n\nHallo ${t.name}! Euer persönlicher Startcode:\n${t.startCode}\n\nHier geht's los: ${site()}\nGebt den Code nicht an andere Clubs weiter. Viel Erfolg! 🐎`;
  const helperText = (h) => `❄️ Danke, dass du beim Winterevent hilfst, ${h.name}!\n\nSo bestätigst du die Ankunft der Clubs:\n1. Öffne ${site()}/admin/\n2. Melde dich mit deinem Helfer-Code an: ${h.code}\n3. Wähle oben „Ich stehe an: …“ deinen Ort.\n4. Kommt ein Club im Spiel bei dir an, drück bei ihm auf „Angekommen ✓“.\n\nDen Code bitte nicht weitergeben.`;

  // ---------- Anmeldung ----------
  function saveAuth(r) { auth = { admin: r.admin, name: r.name, role: r.role, testTools: r.testTools }; localStorage.setItem(STORE, JSON.stringify(auth)); }
  function showView() {
    const on = !!auth;
    $('#loginView').hidden = on; $('#dash').hidden = !on; $('#who').hidden = !on;
    document.body.classList.toggle('helper', on && !isAdmin());
    if (on) { $('#whoName').textContent = `${auth.name} · ${isAdmin() ? 'Eventleitung' : 'Helfer'}`; renderTest(); poll(); }
    else clearTimeout(timer);
  }
  async function login(form, msgSel, action, body) {
    const msg = $(msgSel), btn = form.querySelector('button');
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Anmelden …';
    try { saveAuth(await api(action, body)); msg.textContent = ''; showView(); }
    catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
    btn.disabled = false;
  }
  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); login(e.target, '#loginMsg', 'admin_login', { name: $('#name').value, password: $('#password').value }).then(() => { $('#password').value = ''; }); });
  $('#helperForm').addEventListener('submit', (e) => { e.preventDefault(); login(e.target, '#helperMsg', 'helper_login', { code: $('#helperCode').value }); });
  $('#logoutBtn').addEventListener('click', () => { auth = null; localStorage.removeItem(STORE); showView(); });
  function logoutExpired(msg = 'Anmeldung abgelaufen. Bitte neu anmelden.') { auth = null; localStorage.removeItem(STORE); showView(); $('#helperMsg').className = 'msg err'; $('#helperMsg').textContent = msg; }
  const handle = (err) => { if (err.status === 401) return logoutExpired(); toast(err.message); };

  // ---------- Club anlegen (Eventleitung) ----------
  $('#createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#createMsg'), btn = e.target.querySelector('button'), name = $('#clubName').value.trim();
    if (!name) { msg.className = 'msg err'; msg.textContent = 'Bitte einen Clubnamen eingeben.'; return; }
    btn.disabled = true; msg.className = 'msg'; msg.textContent = '';
    try {
      const r = await api('admin_create', { name });
      const box = $('#created'); box.hidden = false;
      box.innerHTML = `<span>✔ <b>${esc(r.name)}</b> ist angelegt. Startcode:</span><span class="code">${esc(r.startCode)}</span>
        <button class="ghost sm" data-copy="code">Code kopieren</button><button class="primary sm" data-copy="dm">DM-Text kopieren</button>`;
      box.querySelector('[data-copy="code"]').onclick = () => copy(r.startCode);
      box.querySelector('[data-copy="dm"]').onclick = () => copy(dmText(r));
      $('#clubName').value = ''; $('#clubName').focus();
      await load();
    } catch (err) { if (err.status === 401) return logoutExpired(); msg.className = 'msg err'; msg.textContent = err.message; }
    btn.disabled = false;
  });

  // ---------- Helfer (Eventleitung) ----------
  $('#helperCreate').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#helperCreateMsg'), btn = e.target.querySelector('button'), name = $('#helperName').value.trim();
    if (!name) { msg.className = 'msg err'; msg.textContent = 'Bitte einen Namen eingeben.'; return; }
    btn.disabled = true;
    try {
      const r = await api('admin_helper_create', { name });
      msg.className = 'msg ok'; msg.textContent = `✔ ${r.name} ist Helfer. Code: ${r.code} – Einladung ist kopiert.`;
      copy(helperText(r)); $('#helperName').value = ''; await load();
    } catch (err) { if (err.status === 401) return logoutExpired(); msg.className = 'msg err'; msg.textContent = err.message; }
    btn.disabled = false;
  });
  $('#helpers').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-h]'); if (!b) return;
    const h = data.helpers.find((x) => x.id === +b.dataset.id); if (!h) return;
    if (b.dataset.h === 'invite') return copy(helperText(h));
    if (!confirm(`${h.name} als Helfer entfernen? Der Helfer-Code funktioniert danach sofort nicht mehr.`)) return;
    try { await api('admin_helper_delete', { id: h.id }); toast('Helfer entfernt'); load(); } catch (err) { handle(err); }
  });

  // ---------- Ankünfte bestätigen ----------
  async function arrive(id, stage, btn) {
    const t = data.teams.find((x) => x.id === id);
    if (btn) btn.disabled = true;
    try { await api('admin_arrive', { id, stage }); toast(`✓ ${t ? t.name : 'Club'} ist in ${data.stations[stage]} angekommen`); await load(); }
    catch (err) { handle(err); if (btn) btn.disabled = false; }
  }
  $('#myStation').addEventListener('change', (e) => { try { localStorage.setItem(STATION_STORE, e.target.value); } catch (_) {} render(); });
  $('#arrivals').addEventListener('click', (e) => { const b = e.target.closest('button[data-arrive]'); if (b) arrive(+b.dataset.id, +b.dataset.stage, b); });

  // ---------- Live-Daten ----------
  async function load() {
    try { data = await api('admin_overview'); $('#liveDot').classList.remove('off'); if (auth.role !== data.role) { auth.role = data.role; } setTest(isAdmin() && data.testTools); render(); }
    catch (err) { if (err.status === 401) return logoutExpired(); $('#liveDot').classList.add('off'); $('#updated').textContent = 'Verbindung unterbrochen …'; }
  }
  async function poll() { clearTimeout(timer); await load(); if (auth) timer = setTimeout(poll, document.hidden ? 15000 : 4000); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && auth) poll(); });

  const evText = { test_on: '🧪 Testmodus eingeschaltet', test_off: '🧪 Testmodus ausgeschaltet', created: 'wurde angelegt', start: 'ist gestartet in', arrive: 'ist angekommen in',
    solved: 'hat das Spiel gelöst:', opened: 'hat den Tresor geöffnet:', finish: '🏁 ist im Ziel!', reset: 'wurde zurückgesetzt', unlock: 'hat freigeschaltet:' };
  function feedLine(e) {
    const t = `<time>${time(e.at)}</time>`;
    if (e.type.startsWith('test_')) return `<li>${t}<span>${evText[e.type]} von <b>${esc(e.info)}</b></span></li>`;
    if (e.type === 'helper_add' || e.type === 'helper_del') { const [by, who] = String(e.info).split('|'); return `<li>${t}<span>👤 <b>${esc(who)}</b> ${e.type === 'helper_add' ? 'ist jetzt Helfer' : 'ist kein Helfer mehr'} (von ${esc(by)})</span></li>`; }
    const where = ['start', 'arrive', 'unlock', 'solved', 'opened'].includes(e.type) ? esc(e.station) : '';
    const by = e.type === 'arrive' && e.info ? ` <span class="muted">· bestätigt von ${esc(e.info)}</span>` : '';
    return `<li>${t}<span><b>${esc(e.team || 'gelöschter Club')}</b> ${evText[e.type] || e.type} ${where}${by}</span></li>`;
  }
  function render() {
    if (!data) return;
    const T = data.teams, n = data.count, admin = isAdmin();
    // Ort-Auswahl
    const sel = $('#myStation'), cur = myStation();
    if (sel.options.length !== n) sel.innerHTML = `<option value="all">alle Orte</option>` + data.stations.map((s, k) => k ? `<option value="${k}">${esc(s)}</option>` : '').join('');
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'all';
    // Unterwegs zu dir
    const coming = T.filter((t) => t.waiting && (sel.value === 'all' || +sel.value === t.stage + 1)).sort((a, b) => (a.times[a.stage]?.opened || 0) - (b.times[b.stage]?.opened || 0));
    $('#arrivals').innerHTML = coming.length ? `<div class="arrive-list">${coming.map((t) => {
      const to = t.stage + 1, since = t.times[t.stage]?.opened;
      return `<div class="arrive-item"><span><b>${esc(t.name)}</b> ist unterwegs nach <b>${esc(data.stations[to])}</b><br><span class="muted small">Tresor geöffnet ${since ? ago(since) : ''}</span></span>
        <button class="arrive" data-arrive data-id="${t.id}" data-stage="${to}">✓ Angekommen in ${esc(data.stations[to])}</button></div>`;
    }).join('')}</div>` : `<p class="muted">Gerade ist kein Club ${sel.value === 'all' ? '' : `nach ${esc(data.stations[+sel.value])} `}unterwegs. Kommt einer, erscheint er hier automatisch.</p>`;
    // Kennzahlen
    const fin = T.filter((t) => t.finishedAt).length, started = T.filter((t) => t.stage >= 0 && !t.finishedAt).length;
    $('#stats').innerHTML = [[T.length, 'Clubs angelegt'], [started, 'unterwegs'], [T.length - fin - started, 'noch nicht gestartet'], [fin, 'im Ziel']]
      .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
    // Tabelle
    const sorted = [...T].sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || b.stage - a.stage || (b.waiting - a.waiting) || a.lastActivity - b.lastActivity);
    $('#teams').innerHTML = sorted.length ? sorted.map((t) => {
      const dots = Array.from({ length: n }, (_, k) => `<i class="${t.finishedAt || k < t.stage || (k === t.stage && t.waiting) ? 'done' : k === t.stage ? 'cur' : ''}" title="${esc(data.stations[k])}"></i>`).join('');
      const now = t.finishedAt ? `<span class="pill fin">im Ziel ${time(t.finishedAt)}</span>` : t.stage < 0 ? '<span class="muted">noch nicht gestartet</span>'
        : t.waiting ? `<span class="pill wait">unterwegs nach ${esc(data.stations[t.stage + 1])}</span>` : esc(t.stageName);
      return `<tr><td class="rank">${t.rank ? t.rank + '.' : '–'}</td><td><b>${esc(t.name)}</b><br><span class="muted small">angelegt von ${esc(t.createdBy || '?')}</span></td>
        <td><span class="dots">${dots}</span></td><td>${now}</td><td class="muted">${t.stage >= 0 ? ago(t.lastActivity) : '–'}</td>
        ${admin ? `<td class="code">${esc(t.startCode)}</td>
        <td class="right"><span class="actions">
          <button class="ghost sm" data-act="dm" data-id="${t.id}">DM-Text</button>
          <button class="ghost sm" data-act="codes" data-id="${t.id}">Codes</button>
          <button class="ghost sm" data-act="reset" data-id="${t.id}">Zurücksetzen</button>
          <button class="ghost sm danger" data-act="del" data-id="${t.id}">Löschen</button></span></td>` : ''}</tr>`;
    }).join('') : `<tr><td colspan="7" class="empty">Noch keine Clubs.${admin ? ' Leg oben den ersten an.' : ''}</td></tr>`;
    // Helfer-Liste
    if (admin && data.helpers) $('#helpers').innerHTML = data.helpers.length ? data.helpers.map((h) =>
      `<tr><td><b>${esc(h.name)}</b></td><td class="code">${esc(h.code)}</td><td class="muted">${esc(h.createdBy || '')}</td>
        <td class="right"><span class="actions"><button class="ghost sm" data-h="invite" data-id="${h.id}">Einladung kopieren</button><button class="ghost sm danger" data-h="del" data-id="${h.id}">Entfernen</button></span></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">Noch keine Helfer. Trag oben den ersten Namen ein.</td></tr>`;
    $('#feed').innerHTML = data.events.length ? data.events.map(feedLine).join('') : '<li class="empty">Noch nichts passiert.</li>';
    $('#updated').textContent = `aktualisiert ${time(data.now)} · alle 4 s`;
  }

  $('#teams').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const t = data.teams.find((x) => x.id === +b.dataset.id); if (!t) return;
    try {
      if (b.dataset.act === 'dm') return copy(dmText(t));
      if (b.dataset.act === 'codes') {
        const r = await api('admin_codes', { id: t.id });
        $('#codesTitle').textContent = `Codes · ${t.name}`;
        $('#codesBody').innerHTML = r.codes.filter((c) => c.tresor).map((c) => `<tr><td>${esc(c.station)}</td><td class="code">${esc(c.tresor)}</td></tr>`).join('');
        $('#codesZiel').textContent = `Startcode: ${r.startCode} · Zielcode: ${r.zielcode}`;
        return $('#codesDlg').showModal();
      }
      if (b.dataset.act === 'reset') { if (!confirm(`Fortschritt von ${t.name} zurücksetzen? Der Startcode bleibt gleich.`)) return; await api('admin_reset', { id: t.id }); toast('Zurückgesetzt'); }
      if (b.dataset.act === 'del') { if (!confirm(`${t.name} wirklich löschen? Der Startcode funktioniert danach nicht mehr.`)) return; await api('admin_delete', { id: t.id }); toast('Gelöscht'); }
      load();
    } catch (err) { handle(err); }
  });

  // ---------- Testmodus (Eventleitung) ----------
  function setTest(on) { if (!auth) return; if (auth.testTools !== on) { auth.testTools = on; localStorage.setItem(STORE, JSON.stringify(auth)); } renderTest(); }
  function renderTest() {
    const on = !!auth?.testTools;
    $('#testToggle').setAttribute('aria-checked', String(on));
    $('#testCard').classList.toggle('on', on);
    $('#testText').innerHTML = on
      ? '<b>An.</b> Angemeldete Eventleiter sehen auf der Spielseite an jeder Station den Knopf „Test: Lösung“. Spieler und Helfer sehen ihn nie. <b>Vor dem Event ausschalten.</b>'
      : '<b>Aus.</b> Niemand kann Stationen per Knopf lösen. So soll es während des Events sein.';
  }
  $('#testToggle').addEventListener('click', async () => {
    const btn = $('#testToggle'); btn.disabled = true;
    try { const r = await api('admin_set_test', { on: !auth.testTools }); setTest(r.testTools); toast(r.testTools ? 'Testmodus an' : 'Testmodus aus'); load(); }
    catch (err) { handle(err); }
    btn.disabled = false;
  });

  showView();
})();
