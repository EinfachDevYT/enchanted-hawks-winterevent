// Eventleitung: Clubs anlegen und das Event live verfolgen. Alle Daten kommen vom Server (/api).
(function () {
  const STORE = 'ehw-admin';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let auth = null; try { auth = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (_) {}
  let data = null, timer = null, failing = 0;

  async function api(a, body = {}) {
    let r; try { r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, admin: auth?.admin, ...body }) }); }
    catch (_) { throw new Error('Keine Verbindung zum Server.'); }
    let j = null; try { j = await r.json(); } catch (_) {}
    if (!j || !j.ok) { const e = new Error(j?.error || 'Serverfehler.'); e.status = r.status; throw e; }
    return j;
  }
  let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Kopiert'); }
    catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand('copy'); toast('Kopiert'); } catch (_) { toast('Bitte manuell kopieren'); } ta.remove(); }
  }
  const time = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.round(s / 60)} min` : time(ms); };
  const dmText = (t) => `❄️ Schnitzeljagd durch Jorvik · Winterevent der Enchanted Hawks\n\nHallo ${t.name}! Euer persönlicher Startcode:\n${t.startCode}\n\nHier geht's los: ${data?.siteUrl || location.origin}\nGebt den Code nicht an andere Clubs weiter. Viel Erfolg! 🐎`;

  // ---------- Anmeldung ----------
  function showView() {
    const on = !!auth;
    $('#loginView').hidden = on; $('#dash').hidden = !on; $('#who').hidden = !on;
    if (on) { $('#whoName').textContent = auth.name; $('#testInfo').hidden = !auth.testTools; poll(); }
    else { clearTimeout(timer); }
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#loginMsg'), btn = e.target.querySelector('button');
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Anmelden …';
    try {
      const r = await api('admin_login', { name: $('#name').value, password: $('#password').value });
      auth = { admin: r.admin, name: r.name, testTools: r.testTools }; localStorage.setItem(STORE, JSON.stringify(auth));
      $('#password').value = ''; msg.textContent = ''; showView();
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
    btn.disabled = false;
  });
  $('#logoutBtn').addEventListener('click', () => { auth = null; localStorage.removeItem(STORE); showView(); });

  // ---------- Club anlegen ----------
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
  function logoutExpired() { auth = null; localStorage.removeItem(STORE); showView(); $('#loginMsg').className = 'msg err'; $('#loginMsg').textContent = 'Anmeldung abgelaufen. Bitte neu anmelden.'; }

  // ---------- Live-Daten ----------
  async function load() {
    try { data = await api('admin_overview'); failing = 0; $('#liveDot').classList.remove('off'); render(); }
    catch (err) { if (err.status === 401) return logoutExpired(); failing++; $('#liveDot').classList.add('off'); $('#updated').textContent = 'Verbindung unterbrochen …'; }
  }
  async function poll() { clearTimeout(timer); await load(); if (auth) timer = setTimeout(poll, document.hidden ? 15000 : 4000); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && auth) poll(); });

  const evText = { created: 'wurde angelegt', unlock: 'hat freigeschaltet:', solved: 'hat das Spiel gelöst:', opened: 'hat den Tresor geöffnet:', finish: '🏁 ist im Ziel!', reset: 'wurde zurückgesetzt' };
  function render() {
    const T = data.teams, n = data.count;
    const fin = T.filter((t) => t.finishedAt).length, started = T.filter((t) => t.stage >= 0 && !t.finishedAt).length;
    $('#stats').innerHTML = [[T.length, 'Clubs angelegt'], [started, 'unterwegs'], [T.length - fin - started, 'noch nicht gestartet'], [fin, 'im Ziel']]
      .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
    const sorted = [...T].sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || b.stage - a.stage || (b.waiting - a.waiting) || a.lastActivity - b.lastActivity);
    $('#teams').innerHTML = sorted.length ? sorted.map((t) => {
      const dots = Array.from({ length: n }, (_, k) => `<i class="${t.finishedAt || k < t.stage || (k === t.stage && t.waiting) ? 'done' : k === t.stage ? 'cur' : ''}" title="${esc(data.stations[k])}"></i>`).join('');
      const now = t.finishedAt ? `<span class="pill fin">im Ziel ${time(t.finishedAt)}</span>` : t.stage < 0 ? '<span class="muted">noch nicht gestartet</span>'
        : t.waiting ? `<span class="pill wait">unterwegs nach ${esc(data.stations[t.stage + 1])}</span>` : esc(t.stageName);
      return `<tr><td class="rank">${t.rank ? t.rank + '.' : '–'}</td><td><b>${esc(t.name)}</b><br><span class="muted small">angelegt von ${esc(t.createdBy || '?')}</span></td>
        <td><span class="dots">${dots}</span></td><td>${now}</td><td class="muted">${t.stage >= 0 ? ago(t.lastActivity) : '–'}</td><td class="code">${esc(t.startCode)}</td>
        <td class="right"><span class="actions">
          <button class="ghost sm" data-act="dm" data-id="${t.id}">DM-Text</button>
          <button class="ghost sm" data-act="codes" data-id="${t.id}">Codes</button>
          <button class="ghost sm" data-act="reset" data-id="${t.id}">Zurücksetzen</button>
          <button class="ghost sm danger" data-act="del" data-id="${t.id}">Löschen</button></span></td></tr>`;
    }).join('') : `<tr><td colspan="7" class="empty">Noch keine Clubs. Leg oben den ersten an.</td></tr>`;
    $('#feed').innerHTML = data.events.length ? data.events.map((e) =>
      `<li><time>${time(e.at)}</time><span><b>${esc(e.team || 'gelöschter Club')}</b> ${evText[e.type] || e.type} ${['unlock', 'solved', 'opened'].includes(e.type) ? esc(e.station) : ''}</span></li>`).join('')
      : '<li class="empty">Noch nichts passiert.</li>';
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
        $('#codesBody').innerHTML = r.codes.map((c) => `<tr><td>${esc(c.station)}</td><td class="code">${esc(c.code)}</td><td class="code">${esc(c.tresor || '–')}</td></tr>`).join('');
        $('#codesZiel').textContent = `Zielcode: ${r.zielcode}`;
        return $('#codesDlg').showModal();
      }
      if (b.dataset.act === 'reset') { if (!confirm(`Fortschritt von ${t.name} zurücksetzen? Die Codes bleiben gleich.`)) return; await api('admin_reset', { id: t.id }); toast('Zurückgesetzt'); }
      if (b.dataset.act === 'del') { if (!confirm(`${t.name} wirklich löschen? Der Startcode funktioniert danach nicht mehr.`)) return; await api('admin_delete', { id: t.id }); toast('Gelöscht'); }
      load();
    } catch (err) { if (err.status === 401) return logoutExpired(); toast(err.message); }
  });

  showView();
})();
