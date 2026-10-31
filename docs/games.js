/* Minispiele: Memory (Karten-Klick), Screen-Detektiv, Buchstabensalat, Schiebepuzzle.
   Die Lösungen kennt nur der Server. Jedes Spiel bekommt seinen öffentlichen Zustand (game),
   eine Funktion call(op, daten) für Spielzüge und onDone(). Der Server verrät die Buchstaben
   des Tresorcodes erst, wenn sie verdient sind. */
(function () {
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  // Code-Slots: len Felder, die ersten mit den bereits verdienten Buchstaben
  function slots(len, revealed = '') {
    return `<div class="slots" aria-label="Tresorcode">${Array.from({ length: len }, (_, i) =>
      `<div class="slot ${i < revealed.length ? 'filled' : ''}">${i < revealed.length ? revealed[i] : ''}</div>`).join('')}</div>`;
  }
  const errText = (e) => (e && e.message) || 'Verbindung unterbrochen. Bitte nochmal versuchen.';
  function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function hashStr(str) { let x = 2166136261; for (const c of str) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; }
  function shuffle(a, rnd = Math.random) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------- Icons ----------
  const ICONS = {
    hufeisen: `<svg viewBox="0 0 64 64"><path d="M18 12v20a14 14 0 0 0 28 0V12" fill="none" stroke="#8a6a4a" stroke-width="10" stroke-linecap="round"/><path d="M18 12v20a14 14 0 0 0 28 0V12" fill="none" stroke="#c9a77a" stroke-width="4" stroke-linecap="round"/><g fill="#4b3420"><circle cx="18" cy="20" r="2"/><circle cx="46" cy="20" r="2"/><circle cx="20" cy="34" r="2"/><circle cx="44" cy="34" r="2"/></g></svg>`,
    karotte: `<svg viewBox="0 0 64 64"><path d="M40 18 14 54c-2 3 1 5 4 3l30-30z" fill="#f28a1e"/><path d="M24 40l5 3M30 32l5 3M19 48l4 2" stroke="#c45e0a" stroke-width="2.5" stroke-linecap="round"/><path d="M42 20c2-8 8-12 14-12-2 6-6 10-12 14M44 22c6-2 12 0 16 4-6 2-12 1-16-2M40 18c-2-6 0-12 4-14 2 6 1 10-2 15" fill="#3fb34f"/></svg>`,
    apfel: `<svg viewBox="0 0 64 64"><path d="M32 20c-6-5-20-4-20 12 0 14 10 24 16 24 2 0 3-1 4-1s2 1 4 1c6 0 16-10 16-24 0-16-14-17-20-12z" fill="#e2334a"/><path d="M22 28c0-4 3-6 6-6" stroke="#ff8fa0" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M32 20c0-6 2-10 5-12" stroke="#6b3e1f" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M35 14c4-6 12-6 14-4-4 6-10 6-14 4z" fill="#3fb34f"/></svg>`,
    flocke: `<svg viewBox="0 0 64 64"><g stroke="#36b8d9" stroke-width="4" stroke-linecap="round" fill="none"><path d="M32 6v52M9.5 19l45 26M9.5 45l45-26"/><path d="M26 10l6 6 6-6M26 54l6-6 6 6M10 27l8-2-2-8M54 37l-8 2 2 8M10 37l8 2-2 8M54 27l-8-2 2-8"/></g></svg>`,
    stern: `<svg viewBox="0 0 64 64"><path d="M32 6l7.6 16.5 18 2.1-13.3 12.3 3.6 17.8L32 45.8 16.1 54.7l3.6-17.8L6.4 24.6l18-2.1z" fill="#f4cf73" stroke="#c99a3b" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    falke: `<svg viewBox="0 0 64 44" style="color:#5b35a8"><use href="#hawk-shape"/></svg>`,
    geschenk: `<svg viewBox="0 0 64 64"><rect x="10" y="26" width="44" height="30" rx="3" fill="#e86bd0"/><rect x="8" y="18" width="48" height="10" rx="3" fill="#f38ae0"/><rect x="28" y="18" width="8" height="38" fill="#f4cf73"/><path d="M32 18c-6-10-16-8-14-2 2 4 10 3 14 2zm0 0c6-10 16-8 14-2-2 4-10 3-14 2z" fill="#f4cf73"/></svg>`,
    laterne: `<svg viewBox="0 0 64 64"><path d="M26 8h12M32 4v4" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M22 14h20l-3 6H25z" fill="#2f2f45"/><rect x="24" y="20" width="16" height="26" rx="2" fill="#ffd56a"/><path d="M24 20h16v26H24z" fill="none" stroke="#2f2f45" stroke-width="3"/><path d="M20 46h24l-3 6H23z" fill="#2f2f45"/></svg>`,
  };

  // ---------- 1) Memory ----------
  function memory(el, { game, call, onDone, toast }) {
    let busy = false, tries = 0, pending = null;
    el.innerHTML = '';
    const grid = h(`<div class="memory"></div>`);
    const slotBox = h(`<div></div>`);
    const meta = h(`<div class="game-meta"></div>`);
    const pairs = game.cards / 2;
    const cards = Array.from({ length: game.cards }, (_, i) => {
      const card = h(`<button class="card" aria-label="Karte ${i + 1}"><div class="card-inner">
        <div class="card-face card-back"><svg viewBox="0 0 64 44"><use href="#hawk-shape"/></svg></div>
        <div class="card-face card-front"></div></div></button>`);
      card.addEventListener('click', () => flip(i));
      grid.append(card); return card;
    });
    const show = (i, kind) => { cards[i].querySelector('.card-front').innerHTML = ICONS[kind] || ''; cards[i].classList.add('flipped'); };
    function update(g) {
      game = g;
      for (const [i, kind] of Object.entries(g.faces || {})) { show(+i, kind); cards[+i].classList.add('matched'); }
      const found = g.revealed.length;
      slotBox.innerHTML = slots(g.len, g.revealed);
      meta.textContent = g.solved ? 'Alle Paare gefunden! ✨' : `Paare: ${found} / ${pairs} · Versuche: ${tries}`;
    }
    async function flip(i) {
      if (busy || game.solved || cards[i].classList.contains('matched') || pending === i) return;
      busy = true;
      try {
        const r = await call('flip', { i });
        show(i, r.kind);
        if (r.other === undefined) { pending = i; }
        else {
          tries++; pending = null; show(r.other, r.otherKind);
          if (r.match) { setTimeout(() => { update(r.game); if (r.game.solved) onDone(r.game); }, 300); }
          else { await new Promise((res) => setTimeout(res, 850)); cards[i].classList.remove('flipped'); cards[r.other].classList.remove('flipped'); update(r.game); }
        }
      } catch (e) { toast(errText(e)); }
      busy = false;
    }
    update(game);
    el.append(grid, slotBox, meta);
  }

  // ---------- 2) Screen-Detektiv ----------
  function sceneSVG() {
    const stars = Array.from({ length: 60 }, (_, i) => {
      const r = seeded(i * 97 + 3); return `<circle cx="${(r() * 800).toFixed(0)}" cy="${(r() * 170).toFixed(0)}" r="${(r() * 1.4 + 0.4).toFixed(1)}" fill="#fff" opacity="${(r() * 0.6 + 0.3).toFixed(2)}"/>`;
    }).join('');
    const pine = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-5" y="0" width="10" height="16" fill="#3b2516"/><path d="M0-90 30-40H16L40 0h-80l24-40h-14z" fill="#1d5148"/><path d="M0-90 12-70 4-66 16-50 6-46 22-28-22-28-6-46-16-50-4-66-12-70z" fill="#e9f1ff" opacity=".85"/></g>`;
    return `<svg class="scene" viewBox="0 0 800 450" role="img" aria-label="Winterliches Silverglade Village mit versteckten Gegenständen">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140b33"/><stop offset=".6" stop-color="#3a1f72"/><stop offset="1" stop-color="#7b4fb0"/></linearGradient>
        <linearGradient id="snowg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7ff"/><stop offset="1" stop-color="#b9c6ef"/></linearGradient>
        <radialGradient id="win"><stop offset="0" stop-color="#fff2b0"/><stop offset="1" stop-color="#f0a83a"/></radialGradient>
      </defs>
      <rect width="800" height="450" fill="url(#sky)"/>${stars}
      <circle cx="680" cy="70" r="30" fill="#fff8de"/><circle cx="692" cy="62" r="28" fill="#2a1659" opacity=".25"/>
      <g transform="translate(660 69.5) scale(.34)" style="color:#1b0f3d" opacity=".9"><use href="#hawk-shape" width="64" height="44"/></g>
      <path d="M0 250 120 170 220 230 330 150 460 230 560 160 680 220 800 170V300H0z" fill="#5a4a9a" opacity=".7"/>
      <path d="M330 150 352 168 340 170 312 165zM560 160 585 178 570 180 540 176z" fill="#fff" opacity=".7"/>
      <path d="M0 300C120 280 240 310 400 296S680 280 800 300V450H0z" fill="url(#snowg)"/>
      <!-- Haus 1 -->
      <rect x="80" y="220" width="130" height="90" fill="#6a3f5f"/><path d="M66 226 145 176 224 226z" fill="#eef3ff"/>
      <rect x="98" y="240" width="26" height="24" fill="url(#win)"/><rect x="166" y="240" width="26" height="24" fill="url(#win)"/><rect x="132" y="268" width="26" height="42" fill="#3b2240"/>
      <rect x="180" y="180" width="14" height="30" fill="#4a2c45"/>
      <!-- Haus 2 -->
      <rect x="240" y="240" width="90" height="70" fill="#3f4f86"/><path d="M230 246 285 206 340 246z" fill="#eef3ff"/><rect x="270" y="262" width="22" height="20" fill="url(#win)"/>
      <!-- Stall -->
      <rect x="470" y="212" width="190" height="98" fill="#7b4a2e"/><path d="M455 218 565 160 675 218z" fill="#eef3ff"/>
      <path d="M535 310v-56a30 30 0 0 1 60 0v56z" fill="#4a2a18"/><path d="M540 258h50M565 228v82" stroke="#6b4026" stroke-width="4"/>
      <rect x="490" y="232" width="28" height="22" fill="url(#win)"/>
      <path d="M470 236h190" stroke="#663b22" stroke-width="2"/><path d="M470 262h190M470 288h190" stroke="#663b22" stroke-width="2"/>
      ${pine(40, 330, 1)}${pine(360, 312, 0.9)}${pine(400, 340, 1.1)}${pine(720, 350, 1.2)}${pine(775, 330, 0.8)}
      <!-- Zaun -->
      <g stroke="#8a5a3a" stroke-width="5" stroke-linecap="round"><path d="M20 400h230M20 420h230"/>${[30, 80, 130, 180, 230].map((x) => `<path d="M${x} 388v44"/>`).join('')}</g>
      <!-- Schneemann -->
      <circle cx="610" cy="390" r="30" fill="#f7f9ff"/><circle cx="610" cy="346" r="20" fill="#f7f9ff"/><circle cx="604" cy="342" r="2.5"/><circle cx="616" cy="342" r="2.5"/><path d="M610 348l12 3-12 2z" fill="#f28a1e"/><path d="M592 360h36" stroke="#e86bd0" stroke-width="6"/>
      <!-- versteckte Gegenstände -->
      <g transform="translate(603 238) scale(.3)" opacity=".75">${ICONS.hufeisen.replace(/<\/?svg[^>]*>/g, '')}</g>
      <g transform="translate(343 256) scale(.3)">${ICONS.laterne.replace(/<\/?svg[^>]*>/g, '')}</g>
      <g transform="translate(728 352) scale(.42)">${ICONS.geschenk.replace(/<\/?svg[^>]*>/g, '')}</g>
      <path d="M711 330 L760 330 L770 360 L700 360z" fill="#1d5148"/>
      <g transform="translate(436 400) scale(.34) rotate(30 32 32)" opacity=".85">${ICONS.karotte.replace(/<\/?svg[^>]*>/g, '')}</g>
      <path d="M425 414c10-6 24-6 34 0" stroke="#e9eefc" stroke-width="7" fill="none" stroke-linecap="round"/>
      <g id="marks"></g>
    </svg>`;
  }
  function detective(el, { game, call, onDone, toast }) {
    el.innerHTML = '';
    const wrap = h(`<div class="scene-wrap">${sceneSVG()}</div>`);
    const list = h(`<div class="find-list"></div>`);
    const slotBox = h(`<div></div>`);
    const svg = wrap.querySelector('svg'), marks = svg.querySelector('#marks');
    let busy = false;
    function update(g) {
      game = g;
      list.innerHTML = g.labels.map((o) => `<span class="find-item ${g.found.includes(o.id) ? 'found' : ''}">${o.label}</span>`).join('');
      slotBox.innerHTML = slots(g.len, g.revealed);
      marks.innerHTML = g.marks.map((o) =>
        `<circle cx="${o.x}" cy="${o.y}" r="22" fill="none" stroke="#7cf2a6" stroke-width="4"/><circle cx="${o.x}" cy="${o.y}" r="28" fill="none" stroke="#7cf2a6" stroke-width="1.5" opacity=".6"/>`).join('');
    }
    svg.addEventListener('click', async (e) => {
      if (game.solved || busy) return;
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const scale = 800 / svg.getBoundingClientRect().width;
      busy = true;
      try {
        const r = await call('click', { x: Math.round(p.x), y: Math.round(p.y), scale });
        update(r.game);
        if (!r.hit) {
          const m = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          m.setAttribute('cx', p.x); m.setAttribute('cy', p.y); m.setAttribute('r', 14);
          m.setAttribute('fill', 'none'); m.setAttribute('stroke', '#ff7a9a'); m.setAttribute('stroke-width', 3);
          svg.append(m); setTimeout(() => m.remove(), 500);
        } else if (r.game.solved) onDone(r.game);
      } catch (err) { toast(errText(err)); }
      busy = false;
    });
    update(game);
    el.append(wrap, list, slotBox);
  }

  // ---------- 3) Buchstabensalat ----------
  function wordscramble(el, { game, call, onDone, toast }) {
    el.innerHTML = '';
    const box = h(`<div class="words"></div>`);
    const slotBox = h(`<div></div>`);
    game.words.forEach((w, i) => {
      const done = !!w.solved;
      const row = h(`<form class="word-row ${done ? 'solved' : ''}">
        <div class="scrambled">${w.mix}<span class="word-hint">${w.hint}</span></div>
        <input autocomplete="off" spellcheck="false" aria-label="Lösung für ${w.mix}" placeholder="Lösung…" ${done ? `value="${w.solved}" disabled` : ''}>
        <button class="btn sm ice" ${done ? 'disabled' : ''}>${done ? '✓' : 'Prüfen'}</button></form>`);
      row.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inp = row.querySelector('input'), b = row.querySelector('button');
        if (!inp.value.trim() || b.disabled) return;
        b.disabled = true;
        try {
          const r = await call('guess', { i, word: inp.value });
          if (r.correct) {
            row.classList.add('solved'); inp.disabled = true; inp.value = r.game.words[i].solved; b.textContent = '✓';
            slotBox.innerHTML = slots(r.game.len, r.game.revealed);
            if (r.game.solved) onDone(r.game);
          } else { b.disabled = false; row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
        } catch (err) { b.disabled = false; toast(errText(err)); }
      });
      box.append(row);
    });
    slotBox.innerHTML = slots(game.len, game.revealed);
    el.append(box, slotBox);
  }

  // ---------- 4) Schiebepuzzle ----------
  let motifImg = null;
  function loadMotif() {
    if (!motifImg) motifImg = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'img/puzzle-motiv.webp'; });
    return motifImg;
  }
  // Puzzlebild: Club-Motiv vor Winter-Nachthimmel mit Polarlicht, unten das Code-Band
  async function puzzleImage(code) {
    try { await document.fonts.load('600 60px "Cormorant Garamond"'); } catch (_) {}
    const motif = await loadMotif();
    const c = document.createElement('canvas'); c.width = c.height = 600; const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 600); sky.addColorStop(0, '#060a1c'); sky.addColorStop(0.55, '#14203f'); sky.addColorStop(1, '#2a1c3d');
    g.fillStyle = sky; g.fillRect(0, 0, 600, 600);
    // Polarlicht
    [['rgba(80,220,200,0.32)', 120, -40], ['rgba(140,120,255,0.22)', 190, 30], ['rgba(242,180,90,0.18)', 250, 90]].forEach(([col, y, sh]) => {
      const a = g.createLinearGradient(0, y - 90, 0, y + 90); a.addColorStop(0, 'rgba(0,0,0,0)'); a.addColorStop(0.5, col); a.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = a; g.beginPath(); g.moveTo(0, y + sh); g.bezierCurveTo(160, y - 80, 380, y + 90, 600, y - sh); g.lineTo(600, y - sh + 120); g.bezierCurveTo(380, y + 190, 160, y + 20, 0, y + sh + 120); g.fill();
    });
    const r = seeded(7); g.fillStyle = '#fff';
    for (let i = 0; i < 120; i++) { g.globalAlpha = 0.25 + r() * 0.75; g.beginPath(); g.arc(r() * 600, r() * 420, r() * 1.6 + 0.3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // Glut hinter dem Motiv
    const glow = g.createRadialGradient(300, 250, 20, 300, 250, 260); glow.addColorStop(0, 'rgba(242,172,85,0.55)'); glow.addColorStop(1, 'rgba(242,172,85,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 600, 600);
    if (motif) g.drawImage(motif, 40, 0, 520, 520);
    // Schnee
    g.fillStyle = '#e9f1ff'; g.beginPath(); g.moveTo(0, 540); g.quadraticCurveTo(300, 500, 600, 540); g.lineTo(600, 600); g.lineTo(0, 600); g.fill();
    // Code-Band
    g.fillStyle = 'rgba(8,10,24,0.82)'; g.fillRect(0, 432, 600, 96);
    g.strokeStyle = '#f2b45a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 432); g.lineTo(600, 432); g.moveTo(0, 528); g.lineTo(600, 528); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!code) { g.font = '600 40px "Cormorant Garamond", Georgia, serif'; g.fillStyle = 'rgba(242,180,90,0.6)'; g.fillText('❄   ?   ?   ?   ❄', 300, 482); }
    else { g.font = '700 70px "Cormorant Garamond", Georgia, serif'; g.shadowColor = '#f2b45a'; g.shadowBlur = 18; g.fillStyle = '#ffe2a8'; g.fillText(code.split('').join(' '), 300, 484); }
    return c.toDataURL('image/png');
  }
  async function slidepuzzle(el, { game, call, onDone, toast }) {
    el.innerHTML = '<div class="loading"><div><div class="spinner"></div>Puzzle wird gezaubert…</div></div>';
    const img = await puzzleImage(game.solved ? game.revealed : '');
    const N = 3, EMPTY = N * N - 1;
    let pos = game.solved ? [...Array(N * N).keys()] : [...game.pos]; // pos[tile] = Zelle
    let moves = 0, isSolved = !!game.solved, history = [];
    const neighbors = (cell) => [cell - N, cell + N, cell % N ? cell - 1 : -1, (cell + 1) % N ? cell + 1 : -1].filter((c) => c >= 0 && c < N * N);
    // Kürzeste Lösung vom aktuellen Stand (für den Tipp-Knopf)
    function solve(start) {
      const key = (p) => p.join(','), goal = key([...Array(N * N).keys()]);
      const prev = new Map([[key(start), null]]); let q = [start];
      while (q.length) {
        const nq = [];
        for (const p of q) {
          if (key(p) === goal) { const path = []; let k = goal; while (prev.get(k)) { const [pk, t] = prev.get(k); path.unshift(t); k = pk; } return path; }
          for (const c of neighbors(p[EMPTY])) { const t = p.indexOf(c), n = [...p]; n[t] = p[EMPTY]; n[EMPTY] = c; const nk = key(n); if (!prev.has(nk)) { prev.set(nk, [key(p), t]); nq.push(n); } }
        }
        q = nq;
      }
      return [];
    }
    el.innerHTML = '';
    const wrap = h(`<div class="slide-wrap"></div>`);
    const board = h(`<div class="slide ${isSolved ? 'solved' : ''}"></div>`);
    const side = h(`<div class="slide-side">
      <button class="btn ghost sm" type="button" data-hint disabled></button>
      <p class="slide-help">Klickt ein leuchtendes Teil neben der Lücke an, dann rutscht es hinein. Setzt das Bild wieder richtig zusammen.</p>
    </div>`);
    const meta = h(`<div class="game-meta"></div>`);
    const tiles = [];
    for (let t = 0; t < N * N; t++) {
      const b = h(`<button class="tile" aria-label="Puzzleteil ${t + 1}"></button>`);
      b.style.backgroundImage = `url(${img})`;
      b.style.backgroundPosition = `${(t % N) * 50}% ${Math.floor(t / N) * 50}%`;
      b.addEventListener('click', () => move(t));
      tiles.push(b); board.append(b);
    }
    const render = () => {
      const nb = neighbors(pos[EMPTY]);
      tiles.forEach((b, t) => {
        b.style.left = `${(pos[t] % N) * (100 / N)}%`; b.style.top = `${Math.floor(pos[t] / N) * (100 / N)}%`;
        b.style.visibility = t === EMPTY && !isSolved ? 'hidden' : 'visible';
        b.classList.toggle('movable', !isSolved && t !== EMPTY && nb.includes(pos[t]));
        b.classList.remove('hint');
      });
      side.hidden = isSolved;
      updateHint();
      meta.textContent = isSolved ? 'Das Bild ist wieder ganz! Lest den Code im Bild ✨' : `Züge: ${moves}`;
    };
    async function finish() {
      // Der Server spielt die Züge nach und gibt erst dann den Code heraus
      meta.textContent = 'Der Code erscheint …';
      try {
        const r = await call('solve', { moves: history });
        isSolved = true; board.classList.add('solved');
        const solvedImg = await puzzleImage(r.game.revealed);
        tiles.forEach((tb) => { tb.style.backgroundImage = `url(${solvedImg})`; });
        render(); onDone(r.game);
      } catch (e) { toast(errText(e)); render(); }
    }
    function move(t) {
      if (isSolved || t === EMPTY) return;
      if (!neighbors(pos[EMPTY]).includes(pos[t])) return;
      [pos[t], pos[EMPTY]] = [pos[EMPTY], pos[t]]; moves++; history.push(t);
      render();
      if (pos.every((p, i) => p === i)) finish();
    }
    // Tipps: höchstens 2, der erste ab Zug 10, der zweite frühestens 5 Züge später
    const HINT_MAX = 2, HINT_FIRST = 10, HINT_GAP = 5;
    let hintsUsed = 0, lastHintAt = -Infinity;
    const hintBtn = side.querySelector('[data-hint]');
    const nextHintAt = () => Math.max(HINT_FIRST, lastHintAt + HINT_GAP);
    function updateHint() {
      const left = HINT_MAX - hintsUsed;
      if (left <= 0) { hintBtn.disabled = true; hintBtn.textContent = '💡 Keine Tipps mehr'; return; }
      const at = nextHintAt();
      hintBtn.disabled = moves < at;
      hintBtn.textContent = moves < at ? `💡 Tipp ab Zug ${at}` : `💡 Tipp (${left} übrig)`;
    }
    hintBtn.addEventListener('click', () => {
      if (hintBtn.disabled) return;
      const next = solve(pos)[0];
      if (next == null) return;
      hintsUsed++; lastHintAt = moves; updateHint();
      tiles.forEach((b) => b.classList.remove('hint'));
      void tiles[next].offsetWidth; tiles[next].classList.add('hint');
    });
    render();
    wrap.append(board, side);
    el.append(wrap, meta);
  }

  window.GAMES = { memory, detective, wordscramble, slidepuzzle, ICONS, slots, puzzleImage };
})();
