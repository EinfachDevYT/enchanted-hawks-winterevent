// Schnitzeljagd durch Jorvik – Hauptlogik (Vollbild-Screens, Karte, Tresor-Sequenz)
const gsap = window.gsap;
const D = window.EVENT_DATA;
const S = D.stations;
const LAST = S.length - 1;
const STORE = 'ehw-winterevent-v2';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ============ Krypto ============
const te = new TextEncoder();
const norm = (s) => String(s).toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS').replace(/[^A-Z0-9]/g, '');
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
async function derive(secret, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(norm(secret)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(salt), iterations: D.iterations }, base, 512));
  return { key: await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['decrypt']), id: toHex(bits.slice(32, 48)) };
}
async function unseal(key, box) {
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct))));
}
async function lookup(code) {
  if (!norm(code)) return null;
  const { key, id } = await derive(code, D.salt);
  const box = D.entries[id];
  if (!box) return null;
  try { return await unseal(key, box); } catch (_) { return null; }
}
async function openVault(vault, answer) {
  if (!norm(answer)) return null;
  try { const { key } = await derive(answer, vault.salt); return await unseal(key, vault); } catch (_) { return null; }
}

// ============ Zustand ============
const fresh = () => ({ team: null, codes: {}, opened: {}, solved: {}, riddleDigits: {}, finishedAt: null, view: 0 });
let state = (() => { try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && s.codes) return { ...fresh(), ...s }; } catch (_) {} return fresh(); })();
const payloads = {};
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {} };
const maxStage = () => Math.max(-1, ...Object.keys(state.codes).map(Number));
function status(k) {
  const m = maxStage();
  if (state.codes[k] != null) return state.opened[k] || k === LAST ? 'done' : 'current';
  if (k < m) return 'done';
  if (k === m + 1 && state.opened[m]) return 'ready';
  return 'locked';
}
const focusStage = () => { const m = maxStage(); return m >= 0 && state.opened[m] && m < LAST ? m + 1 : Math.max(0, m); };
function adopt(p, code) {
  if (state.team && state.team !== p.team) state = fresh();
  state.team = p.team;
  state.codes[p.stage] = code;
  for (let k = 0; k < p.stage; k++) if (!state.opened[k]) state.opened[k] = '✓';
  payloads[p.stage] = p;
  state.view = p.stage;
  save();
}

// ============ 3D-Bühne ============
let stage = null;
try { const mod = await import('./vault3d.js'); stage = mod.createStage($('#gl')); } catch (e) { console.warn('WebGL nicht verfügbar', e); }

// ============ UI-Helfer ============
const screens = { intro: $('#sIntro'), map: $('#sMap'), station: $('#sStation'), vault: $('#sVault'), final: $('#sFinal') };
let currentScreen = null;
async function show(name, { mapVisible = false, introBg = false } = {}) {
  const next = screens[name], prev = currentScreen && screens[currentScreen];
  if (prev && prev !== next) {
    await gsap.to(prev, { autoAlpha: 0, duration: reduce ? 0 : 0.35, ease: 'power2.in' });
    prev.classList.remove('active');
  }
  gsap.to('#bgIntro', { autoAlpha: introBg ? 1 : 0, duration: 0.8 });
  gsap.to(['#mapStage', '#mapNodes'], { autoAlpha: mapVisible ? 1 : 0, duration: 0.6 });
  $('#mapNodes').classList.toggle('on', name === 'map');
  if (name === 'station') stage?.setMode('paused'); // Schnee ist hinter der Station kaum sichtbar – Grafikkarte entlasten
  next.classList.add('active');
  next.scrollTop = 0;
  currentScreen = name;
  updateHud();
  await gsap.fromTo(next, { autoAlpha: 0 }, { autoAlpha: 1, duration: reduce ? 0 : 0.5, ease: 'power2.out' });
}
function rise(root) {
  if (reduce) return;
  gsap.from(root.querySelectorAll('[data-rise]'), { y: 34, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07 });
}
function toast(text) {
  const t = $('#toast'); t.textContent = text;
  gsap.timeline().to(t, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power3.out' }).to(t, { autoAlpha: 0, y: -20, duration: 0.3, delay: 2.2 });
}
function flash(intensity = 1) {
  return gsap.timeline().to('#flash', { opacity: intensity, duration: 0.18, ease: 'power2.out' }).to('#flash', { opacity: 0, duration: 1.1, ease: 'power2.inOut' });
}
function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function updateHud() {
  $('#team').hidden = !state.team; $('#teamName').textContent = state.team || '';
  $('#logoutBtn').hidden = !state.team;
  const p = $('#progress');
  p.hidden = !state.team || currentScreen === 'intro';
  p.innerHTML = S.map((s, k) => { const st = status(k); return `<span class="${st === 'done' ? 'done' : st === 'current' || st === 'ready' ? 'current' : ''}" title="${esc(s.name)}"></span>`; }).join('');
}
function codeBox({ id, placeholder, button, numeric }) {
  return `<form class="codebox" id="${id}" autocomplete="off">
    <input name="code" spellcheck="false" autocapitalize="characters" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" ${numeric ? 'inputmode="numeric" maxlength="4"' : ''}>
    <button class="btn">${esc(button)} <span class="arrow">→</span></button></form>`;
}

$('#fsBtn').addEventListener('click', () => {
  const el = document.documentElement;
  try {
    const r = !document.fullscreenElement ? (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el) : (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    r?.catch?.(() => toast('Vollbild wird hier nicht unterstützt.'));
  } catch (_) { toast('Vollbild wird hier nicht unterstützt.'); }
});
let logoutArmed = null;
$('#logoutBtn').addEventListener('click', () => {
  if (!logoutArmed) {
    toast('Nochmal tippen zum Abmelden. Euer Fortschritt auf diesem Gerät wird gelöscht.');
    $('#logoutBtn').style.borderColor = 'var(--danger)';
    logoutArmed = setTimeout(() => { logoutArmed = null; $('#logoutBtn').style.borderColor = ''; }, 3500);
    return;
  }
  clearTimeout(logoutArmed); logoutArmed = null; $('#logoutBtn').style.borderColor = '';
  try { localStorage.removeItem(STORE); } catch (_) {}
  state = fresh(); for (const k in payloads) delete payloads[k];
  stage?.setMode('ambient'); renderIntro();
});

// ============ Intro ============
function renderIntro() {
  const el = screens.intro;
  const chars = (t) => [...t].map((c) => `<span class="split-char">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
  el.innerHTML = `<div class="intro">
    <div class="eyebrow" data-rise>${esc(D.clubName)} · ${esc(D.subtitle)}</div>
    <h1 class="display" id="introTitle"><span class="line">${chars('Schnitzeljagd')}</span><span class="line"><em>${chars('durch Jorvik')}</em></span></h1>
    <p class="lead" data-rise>Sechs Orte. Fünf Tresore. Ein Weihnachtsbaum am Ende der Reise. Gebt euren Teamcode ein, den ihr von der Eventleitung per DM bekommen habt.</p>
    <div data-rise style="width:min(560px,100%)">${codeBox({ id: 'loginForm', placeholder: 'Teamcode', button: 'Losreiten' })}<div class="msg" id="loginMsg"></div></div>
    <div class="intro-steps" data-rise>
      <div><b>01</b>Teamcode eingeben</div><div><b>02</b>Rätsel und Minispiele lösen</div>
      <div><b>03</b>Tresor knacken und den nächsten Ortscode finden</div><div><b>04</b>Als Erste am Weihnachtsbaum sein</div>
    </div></div>`;
  show('intro', { introBg: true });
  const title = $('#introTitle');
  if (!reduce) gsap.from(title.querySelectorAll('.split-char'), { yPercent: 110, rotate: 6, autoAlpha: 0, duration: 1.1, ease: 'power4.out', stagger: 0.025, delay: 0.15 });
  rise(el);
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, btn = f.querySelector('button'), msg = $('#loginMsg'), code = f.code.value;
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Code wird geprüft …';
    const p = await lookup(code);
    btn.disabled = false;
    if (!p) { msg.className = 'msg err'; msg.textContent = 'Diesen Code kennen wir nicht. Prüft die Schreibweise.'; f.classList.add('err'); shake(f); return; }
    adopt(p, code);
    msg.className = 'msg ok'; msg.textContent = `Willkommen, ${p.team}!`;
    if (!reduce) await gsap.to(title.querySelectorAll('.split-char'), { yPercent: -110, autoAlpha: 0, duration: 0.6, ease: 'power3.in', stagger: 0.01 });
    goMap({ intro: true });
  });
}

// ============ Karte ============
let mapRect = { left: 0, top: 0, s: 1 };
function layoutMap() {
  const [W, H] = D.mapSize, vb = D.mapView || [0, 0, W, H];
  const vw = innerWidth, vh = innerHeight, mobile = vw < 760;
  const card = $('#mapCard');
  const availH = mobile ? vh - 70 - ((card?.offsetHeight || 250) + 70) : vh - 60;
  const s = Math.min((mobile ? vw * 1.05 : vw * 0.62) / vb[2], availH / vb[3]);
  const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
  const left = (mobile ? vw / 2 : vw * 0.62) - cx * s, top = (mobile ? 70 + availH / 2 : vh / 2 + 10) - cy * s;
  mapRect = { left, top, s };
  for (const el of [$('#mapStage'), $('#mapNodes')]) Object.assign(el.style, { left: left + 'px', top: top + 'px', width: W * s + 'px', height: H * s + 'px' });
}
function routeD(a, b, i) {
  if (i === LAST - 1) {
    const m = S[0].map;
    return `M${a.x} ${a.y} Q${(a.x + m.x) / 2 - 30} ${(a.y + m.y) / 2} ${m.x} ${m.y} C ${m.x - 380} ${m.y - 200}, ${b.x - 330} ${b.y + 260}, ${b.x - 70} ${b.y + 80}`;
  }
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return `M${a.x} ${a.y} Q${mx - dy * 0.25} ${my + dx * 0.25} ${b.x} ${b.y}`;
}
function renderNodes(animateRoute) {
  const [W, H] = D.mapSize, wm = D.winterMap, s = mapRect.s;
  const wp = S[LAST].map, insetD = Math.max(110, 240 * s);
  const routes = S.slice(0, LAST).map((_, i) => {
    const d = routeD(S[i].map, S[i + 1].map, i), on = status(i + 1) !== 'locked';
    return `<path class="r-bg" d="${d}" vector-effect="non-scaling-stroke"/>${on ? `<path class="r-done" data-i="${i}" d="${d}"/>` : ''}`;
  }).join('');
  $('#mapNodes').innerHTML = `
    <svg class="routes" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${routes}</svg>
    <div class="winter-inset" style="left:${(wp.x / W) * 100}%;top:${(wp.y / H) * 100}%;width:${insetD}px;height:${insetD}px"><img src="${wm.image}" alt=""></div>
    ${S.map((st, k) => {
      const stt = status(k), p = st.map;
      const y = k === LAST ? p.y + insetD / 2 / s : p.y;
      const icon = stt === 'done' ? '<svg><use href="#check"/></svg>' : stt === 'locked' ? '<svg><use href="#lock"/></svg>' : `<span class="num">${k + 1}</span>`;
      return `<button class="node ${stt} ${st.labelPos === 'right' ? 'right' : ''}" data-k="${k}" style="left:${(p.x / W) * 100}%;top:${(y / H) * 100}%" aria-label="${esc(st.name)}">
        <span class="dot">${icon}</span><span class="label">${esc(st.name)}</span></button>`;
    }).join('')}`;
  $('#mapNodes').querySelectorAll('.node').forEach((n) => n.addEventListener('click', () => {
    const k = +n.dataset.k; if (status(k) === 'locked') return toast('Dieser Ort ist noch verschlossen.');
    state.view = k; save(); renderMapCard(true);
  }));
  $('#mapNodes').querySelectorAll('.r-done').forEach((p) => {
    const len = p.getTotalLength();
    p.style.strokeWidth = 4 / s;
    p.style.strokeDasharray = len; p.style.strokeDashoffset = 0;
    if (animateRoute === +p.dataset.i && !reduce) gsap.fromTo(p, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 2, ease: 'power2.inOut', delay: 0.6 });
  });
}
function renderMapCard(animate) {
  const k = state.view ?? focusStage(), st = S[k], stt = status(k);
  const heads = { done: 'Geschafft', current: 'Aktuelle Station', ready: 'Nächstes Ziel' };
  const texts = {
    done: k === LAST ? 'Ihr habt das Ziel erreicht!' : 'Diesen Ort habt ihr bereits gemeistert.',
    current: st.intro,
    ready: k === LAST ? 'Nehmt den Moorland-Schlitten ins Winterdorf und reitet zum Weihnachtsbaum. Dort schaltet ihr das Ziel mit eurem Ortscode frei.' : `Reitet im Spiel nach ${st.name} und schaltet den Ort mit eurem Ortscode aus dem Tresor frei.`,
  };
  const btn = { done: 'Ansehen', current: 'Station betreten', ready: 'Ort freischalten' }[stt];
  $('#sMap').innerHTML = `<div class="map-card" id="mapCard">
    <div class="eyebrow">${heads[stt]} · ${k + 1} / ${S.length}</div>
    <h2 class="display">${esc(st.name)}</h2>
    <p class="lead">${esc(texts[stt])}</p>
    <button class="btn" id="enterBtn">${btn} <span class="arrow">→</span></button></div>`;
  $('#enterBtn').addEventListener('click', () => enterStation(k));
  if (animate && !reduce) gsap.from('#mapCard > *', { y: 18, autoAlpha: 0, duration: 0.6, ease: 'power3.out', stagger: 0.05 });
}
async function goMap({ intro = false, drawRoute } = {}) {
  stage?.setMode('ambient');
  if (!$('#mapImg').getAttribute('src')) $('#mapImg').src = D.mapImage;
  if (state.view == null || status(state.view) === 'locked') state.view = focusStage();
  renderMapCard(false);
  screens.map.classList.add('active');
  layoutMap();
  gsap.set(['#mapStage', '#mapNodes'], { x: 0, y: 0, scale: 1 });
  renderNodes(drawRoute);
  const p = show('map', { mapVisible: true });
  if (!reduce) {
    gsap.from(['#mapStage', '#mapNodes'], { scale: intro ? 1.3 : 1.06, transformOrigin: '50% 50%', duration: intro ? 2.2 : 1.2, ease: 'power3.out' });
    gsap.from('#mapNodes .node', { scale: 0, autoAlpha: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.08, delay: intro ? 0.8 : 0.3 });
    gsap.from('#mapCard', { y: 40, autoAlpha: 0, duration: 0.9, ease: 'power3.out', delay: intro ? 1 : 0.3 });
  }
  await p;
}
addEventListener('resize', () => { if (currentScreen === 'map') { layoutMap(); renderNodes(); } });

async function zoomTo(k) {
  if (reduce) return;
  const p = S[k].map, s = mapRect.s, z = 2.4;
  const x = innerWidth / 2 - mapRect.left - p.x * s * z, y = innerHeight / 2 - mapRect.top - p.y * s * z;
  gsap.to(['#sMap', '#progress'], { autoAlpha: 0, duration: 0.3 });
  await gsap.to(['#mapStage', '#mapNodes'], { x: x - 0, y, scale: z, transformOrigin: '0 0', duration: 1.1, ease: 'power3.inOut' });
  gsap.set('#progress', { autoAlpha: 1 });
}

// ============ Station ============
async function enterStation(k) {
  state.view = k; save();
  if (currentScreen === 'map') await zoomTo(k);
  const stt = status(k);
  if (stt === 'ready') return renderArrive(k);
  if (k === LAST && payloads[k]) return renderFinal(payloads[k]);
  renderStation(k);
}
const backToMap = () => goMap();

function renderArrive(k) {
  const st = S[k], isW = k === LAST, wm = D.winterMap;
  const el = screens.station;
  el.innerHTML = `<button class="btn ghost sm back" id="backBtn">← Karte</button>
    <div class="arrive">
      <div class="eyebrow" data-rise>Nächstes Ziel · Station ${k + 1}</div>
      <h2 class="display" data-rise>${esc(st.name)}</h2>
      ${isW ? `<div class="arrive-map" data-rise><img src="${wm.image}" alt="Karte vom Winterdorf"><span class="pin" style="left:${(wm.tree[0] / wm.size[0]) * 100}%;top:${(wm.tree[1] / wm.size[1]) * 100}%"></span></div>` : ''}
      <p class="lead" data-rise>${isW ? 'Nehmt den <b>Moorland-Schlitten</b> ins Winterdorf und reitet zum leuchtenden <b>Weihnachtsbaum</b>.' : `Reitet im Spiel nach <b>${esc(st.name)}</b>.`} Angekommen? Dann gebt euren Ortscode aus dem Tresor ein.</p>
      <div data-rise style="width:min(560px,100%)">${codeBox({ id: 'unlockForm', placeholder: 'Ortscode', button: 'Freischalten' })}<div class="msg" id="unlockMsg"></div></div>
    </div>`;
  show('station', { mapVisible: true }); rise(el);
  $('#backBtn').onclick = backToMap;
  $('#unlockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, btn = f.querySelector('button'), msg = $('#unlockMsg'), code = f.code.value;
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Ortscode wird geprüft …';
    const res = await lookup(code);
    btn.disabled = false;
    if (!res || res.team !== state.team) {
      msg.className = 'msg err'; msg.textContent = res ? 'Dieser Code gehört zu einem anderen Team!' : 'Das ist nicht der richtige Ortscode.';
      shake(f); return;
    }
    adopt(res, code);
    flash(0.9);
    if (res.stage === LAST) renderFinal(res); else renderStation(res.stage);
  });
}

function renderRiddles(el, p) {
  const web = D.morlandMode === 'web';
  el.innerHTML = `<div class="riddles">${D.riddles.map((r, i) => `
    <div class="riddle"><div class="nr"><b>${i + 1}</b>ZAHL</div><p>„${esc(r)}“</p>
    ${web ? (state.riddleDigits[i] != null ? `<div class="digit-badge">✓ ${esc(p.riddles[i].place)}: ${esc(state.riddleDigits[i])}</div>`
      : `<form class="place-row" data-i="${i}"><input placeholder="Welcher Ort?" aria-label="Ort für Rätsel ${i + 1}"><button class="btn sm ice">Prüfen</button></form>`) : ''}
    </div>`).join('')}</div>
    ${web ? '' : '<p class="game-meta">Findet die vier Orte in Moorland. Dort bekommt ihr eure Zahlen.</p>'}`;
  el.querySelectorAll('form.place-row').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const i = +f.dataset.i;
    if (p.riddles[i].accept.includes(norm(f.querySelector('input').value))) { state.riddleDigits[i] = p.riddles[i].digit; save(); renderRiddles(el, p); }
    else shake(f);
  }));
}

function renderStation(k) {
  const st = S[k], p = payloads[k], el = screens.station, stt = status(k);
  if (!p) {
    el.innerHTML = `<button class="btn ghost sm back" id="backBtn">← Karte</button><div class="arrive"><div class="eyebrow">Station ${k + 1}</div><h2 class="display">${esc(st.name)}</h2><p class="lead">Diese Station habt ihr bereits geschafft.</p></div>`;
    $('#backBtn').onclick = backToMap; return show('station', { mapVisible: true });
  }
  const opened = state.opened[k] && state.opened[k] !== '✓';
  el.innerHTML = `<button class="btn ghost sm back" id="backBtn">← Karte</button>
    <div class="station">
      <aside class="station-side">
        <div class="eyebrow" data-rise>Station ${k + 1} / ${S.length}</div>
        <h2 class="display" data-rise>${esc(st.name)}</h2>
        <p class="lead" data-rise>${esc(st.intro)}</p>
        <div class="tag" data-rise>${stt === 'done' ? '✓ geschafft' : '◆ ' + esc(st.title)}</div>
      </aside>
      <div class="station-main" data-rise>
        <div class="stage-card"><div id="game"></div></div>
        <div class="cta-row" id="ctaRow"></div>
      </div>
    </div>`;
  $('#backBtn').onclick = backToMap;
  const cta = () => {
    const solved = k === 0 || state.solved[k];
    $('#ctaRow').innerHTML = opened
      ? `<button class="btn" id="vaultBtn">Tresor ansehen <span class="arrow">→</span></button>`
      : solved
        ? `<button class="btn" id="vaultBtn">Zum Tresor <span class="arrow">→</span></button>${k > 0 ? '<span class="cta-note">Code komplett! Merkt ihn euch.</span>' : ''}`
        : `<button class="btn ghost" disabled>Tresor noch verschlossen</button><span class="lead" style="font-size:.88rem">Löst das Spiel, um den Tresorcode zu erhalten.</span>`;
    $('#vaultBtn')?.addEventListener('click', () => enterVault(k));
  };
  const game = $('#game');
  if (k === 0) renderRiddles(game, p);
  else window.GAMES[st.game](game, { answer: p.answer, solved: state.solved[k], words: p.words, seed: state.team + k,
    onDone: () => { state.solved[k] = true; save(); cta(); setTimeout(() => $('#ctaRow').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }), 500); if (!reduce) gsap.from('#ctaRow > *', { y: 20, autoAlpha: 0, duration: 0.7, ease: 'back.out(2)', stagger: 0.08 }); } });
  cta();
  show('station', { mapVisible: true }); rise(el);
}

// ============ Tresor ============
async function enterVault(k) {
  const st = S[k], p = payloads[k], el = screens.vault;
  const opened = state.opened[k] && state.opened[k] !== '✓' ? state.opened[k] : null;
  stage?.setMode('vault', { open: !!opened });
  el.innerHTML = `<button class="btn ghost sm back" id="backBtn">← ${esc(st.name)}</button>
    ${stage ? '' : '<div class="fallback-vault"></div>'}
    <div class="vault-ui" id="vaultUi" ${opened ? 'style="display:none"' : ''}>
      <div class="eyebrow">Tresor · ${esc(st.name)}</div>
      <h2 class="vault-title">${k === 0 ? 'Vier Zahlen öffnen das Schloss' : 'Gebt den Tresorcode ein'}</h2>
      ${codeBox({ id: 'vaultForm', placeholder: k === 0 ? '• • • •' : 'Tresorcode', button: 'Öffnen', numeric: k === 0 })}
      <div class="msg" id="vaultMsg"></div>
    </div>
    <div class="reveal" id="reveal"></div>`;
  $('#backBtn').onclick = () => { stage?.setMode('ambient'); renderStation(k); };
  const shown = show('vault');
  if (opened) { await shown; return showReveal(k, opened, false); }
  const f = $('#vaultForm'), input = f.code;
  if (k === 0 && D.riddles.every((_, i) => state.riddleDigits[i] != null)) input.value = D.riddles.map((_, i) => state.riddleDigits[i]).join('');
  let lastLen = input.value.length;
  input.addEventListener('input', () => { stage?.tick(input.value.length >= lastLen ? 1 : -1); lastLen = input.value.length; });
  if (!reduce) gsap.from('#vaultUi > *', { y: 30, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.7 });
  setTimeout(() => input.focus({ preventScroll: true }), 900);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button'), msg = $('#vaultMsg');
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Das Schloss wird geprüft …';
    const res = await openVault(p.vault, input.value);
    btn.disabled = false;
    if (!res) {
      stage?.fail(); f.classList.add('err'); shake(f);
      msg.className = 'msg err'; msg.textContent = 'Klack. Der Tresor bleibt zu. Versucht es nochmal!';
      setTimeout(() => f.classList.remove('err'), 1200);
      return;
    }
    state.opened[k] = res.nextCode; save(); updateHud();
    input.blur();
    msg.className = 'msg ok'; msg.textContent = 'Richtig!';
    await gsap.to('#vaultUi', { autoAlpha: 0, y: 30, duration: 0.5, ease: 'power2.in' });
    if (stage) {
      const tl = stage.open();
      tl.call(() => flash(0.3), null, 1.8);
      tl.call(() => flash(0.85), null, 3.4);
      await tl;
    } else flash(0.9);
    showReveal(k, res.nextCode, true);
  });
}
function showReveal(k, code, animate) {
  const next = S[k + 1], st = S[k];
  const chars = [...code].map((c) => `<span class="${c === '-' ? 'sep' : ''}">${esc(c)}</span>`).join('');
  const r = $('#reveal');
  r.innerHTML = `<div class="reveal-card" id="revealCard">
    <div class="eyebrow">Der Tresor ist offen</div>
    <h2 class="display">Ortscode für <em>${esc(next.name)}</em></h2>
    <div class="big-code" id="bigCode">${chars}</div>
    <p class="lead">${esc(st.nextHint)}<br>Merkt euch den Code gut. Damit schaltet ihr den nächsten Ort frei und könnt auch auf einem anderen Gerät weiterspielen.</p>
    <div class="cta-row" style="justify-content:center"><button class="btn" id="nextBtn">Weiter nach ${esc(next.name)} <span class="arrow">→</span></button></div>
  </div>`;
  r.classList.add('on');
  $('#nextBtn').onclick = () => { state.view = k + 1; save(); stage?.setMode('ambient'); goMap({ drawRoute: k }); };
  if (!animate || reduce) return;
  gsap.from('#revealCard', { y: 60, scale: 0.94, autoAlpha: 0, duration: 1, ease: 'power3.out' });
  const glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  [...$('#bigCode').children].forEach((span, i) => {
    if (span.classList.contains('sep')) return;
    const final = span.textContent; let n = 0;
    const iv = setInterval(() => {
      span.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      if (++n > 10 + i * 2) { clearInterval(iv); span.textContent = final; gsap.fromTo(span, { scale: 1.4 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }); }
    }, 45);
  });
}

// ============ Finale ============
function renderFinal(p) {
  const first = !state.finishedAt;
  if (first) { state.finishedAt = new Date().toISOString(); save(); }
  const t = new Date(state.finishedAt);
  const lights = [[100, 62, '#f2b45a'], [82, 98, '#8fdcff'], [118, 104, '#ffdca0'], [70, 140, '#f2b45a'], [128, 146, '#8fdcff'], [98, 128, '#ffdca0'], [60, 178, '#8fdcff'], [140, 182, '#f2b45a'], [100, 168, '#ffdca0']];
  const code = [...p.zielcode].map((c) => `<span class="${c === '-' ? 'sep' : ''}">${esc(c)}</span>`).join('');
  const el = screens.final;
  el.innerHTML = `<div class="final">
    <svg class="tree" viewBox="0 0 200 240" aria-hidden="true" data-rise>
      <path d="M100 18 20 200h160z" fill="#123d33"/><path d="M100 18 40 150h120z" fill="#17503f"/><path d="M100 18 62 100h76z" fill="#1d634d"/>
      <path d="M30 196c40-10 100-10 140 0M46 150c36-10 72-10 108 0M66 100c22-6 46-6 68 0" stroke="#eaf4ff" stroke-width="4" fill="none" opacity=".7"/>
      <rect x="90" y="200" width="20" height="26" fill="#3d2a18"/>
      <path d="M100 2l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#ffdca0"/>
      ${lights.map(([x, y, c], i) => `<circle class="light" cx="${x}" cy="${y}" r="4.5" fill="${c}" style="animation-delay:${i * 0.2}s"/>`).join('')}
    </svg>
    <div class="eyebrow" data-rise>Station ${LAST + 1} · Winterdorf</div>
    <h1 class="display" data-rise>Ziel <em>erreicht!</em></h1>
    <p class="lead" data-rise>${esc(p.team)} hat den Weihnachtsbaum erreicht.</p>
    <div class="stamp" data-rise>${t.toLocaleDateString('de-DE')} · ${t.toLocaleTimeString('de-DE')} Uhr</div>
    <div class="eyebrow" style="margin-top:14px" data-rise>Euer Zielcode</div>
    <div class="big-code" data-rise>${code}</div>
    <p class="lead" data-rise style="max-width:540px">Schickt <b>jetzt sofort</b> einen Screenshot dieser Seite per DM an die Eventleitung. Die ersten drei Teams bekommen eine Belohnung! 🏆</p>
    <button class="btn ghost sm" id="mapBtn" data-rise>Zur Karte</button>
  </div>`;
  $('#mapBtn').onclick = () => goMap();
  show('final'); rise(el);
  if (first) setTimeout(confetti, 400);
}
function confetti() {
  if (reduce) return;
  const colors = ['#f2b45a', '#ffdca0', '#8fdcff', '#eaf4ff'];
  for (let i = 0; i < 110; i++) {
    const c = document.createElement('div'); c.className = 'confetti';
    c.style.background = colors[i % colors.length]; document.body.append(c);
    gsap.fromTo(c, { x: innerWidth / 2, y: innerHeight * 0.55, rotate: 0, scale: 0.6 + Math.random() },
      { x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 1.2, y: innerHeight * (Math.random() * 0.5 - 0.1), rotate: Math.random() * 720,
        duration: 1 + Math.random() * 0.6, ease: 'power3.out', delay: Math.random() * 0.2,
        onComplete: () => gsap.to(c, { y: innerHeight + 40, x: `+=${(Math.random() - 0.5) * 200}`, rotate: '+=360', duration: 2.4 + Math.random() * 2, ease: 'power1.in', onComplete: () => c.remove() }) });
  }
}

// ============ Start ============
async function boot() {
  gsap.set(['#mapStage', '#mapNodes', '#bgIntro', '#toast'], { autoAlpha: 0 });
  if (!crypto?.subtle) { screens.intro.innerHTML = '<div class="intro"><p class="lead">Bitte öffnet die Seite über https. Sonst blockiert euer Browser die Verschlüsselung.</p></div>'; return show('intro', { introBg: true }); }
  if (!state.team) return renderIntro();
  await Promise.all(Object.entries(state.codes).map(async ([k, code]) => {
    const p = await lookup(code);
    if (p && p.team === state.team) payloads[k] = p; else delete state.codes[k];
  }));
  if (!Object.keys(state.codes).length) { state = fresh(); save(); return renderIntro(); }
  save();
  goMap({ intro: true });
}
boot();
