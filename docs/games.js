/* Minispiele: Memory (Karten-Klick), Screen-Detektiv, Buchstabensalat, Schiebepuzzle.
   Jedes Spiel bekommt einen Container, die Lösung (answer) und onDone(); es zeigt den
   Tresorcode Buchstabe für Buchstabe in "Code-Slots" an. */
(function () {
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  function slots(answer, filled) {
    return `<div class="slots" aria-label="Tresorcode">${[...answer].map((c, i) =>
      `<div class="slot ${i < filled ? 'filled' : ''}">${i < filled ? c : ''}</div>`).join('')}</div>`;
  }
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
  function memory(el, { answer, solved, onDone }) {
    const kinds = ['hufeisen', 'karotte', 'apfel', 'flocke', 'stern', 'falke', 'geschenk', 'laterne'].slice(0, answer.length);
    let matched = solved ? answer.length : 0, tries = 0, open = [], lock = false;
    const deck = shuffle([...kinds, ...kinds]);
    el.innerHTML = '';
    const slotBox = h(`<div>${slots(answer, matched)}</div>`);
    const grid = h(`<div class="memory"></div>`);
    const meta = h(`<div class="game-meta"></div>`);
    const updateMeta = () => { meta.textContent = matched === answer.length ? 'Alle Paare gefunden! ✨' : `Paare: ${matched} / ${answer.length} · Versuche: ${tries}`; };
    deck.forEach((k) => {
      const card = h(`<button class="card ${solved ? 'matched' : ''}" aria-label="Karte"><div class="card-inner">
        <div class="card-face card-back"><svg viewBox="0 0 64 44"><use href="#hawk-shape"/></svg></div>
        <div class="card-face card-front">${ICONS[k]}</div></div></button>`);
      card.dataset.kind = k;
      card.addEventListener('click', () => {
        if (lock || solved || card.classList.contains('flipped') || card.classList.contains('matched')) return;
        card.classList.add('flipped'); open.push(card);
        if (open.length < 2) return;
        tries++; lock = true;
        const [a, b] = open;
        if (a.dataset.kind === b.dataset.kind) {
          setTimeout(() => {
            a.classList.add('matched'); b.classList.add('matched'); open = []; lock = false; matched++;
            slotBox.innerHTML = slots(answer, matched); updateMeta();
            if (matched === answer.length) onDone();
          }, 350);
        } else {
          setTimeout(() => { a.classList.remove('flipped'); b.classList.remove('flipped'); open = []; lock = false; updateMeta(); }, 900);
        }
        updateMeta();
      });
      grid.append(card);
    });
    updateMeta();
    el.append(grid, slotBox, meta);
  }

  // ---------- 2) Screen-Detektiv ----------
  const SCENE_OBJECTS = [
    { id: 'falke', label: 'Falke', x: 671, y: 77, r: 13 }, // dunkle Silhouette vor dem Mond
    { id: 'hufeisen', label: 'Hufeisen', x: 612, y: 248 },
    { id: 'laterne', label: 'Laterne', x: 352, y: 268 },
    { id: 'geschenk', label: 'Geschenk', x: 742, y: 366 },
    { id: 'karotte', label: 'Karotte', x: 448, y: 408 },
  ];
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
  function detective(el, { answer, solved, onDone }) {
    const objs = SCENE_OBJECTS.slice(0, answer.length);
    const found = new Set(solved ? objs.map((o) => o.id) : []);
    el.innerHTML = '';
    const wrap = h(`<div class="scene-wrap">${sceneSVG()}</div>`);
    const list = h(`<div class="find-list"></div>`);
    const slotBox = h(`<div></div>`);
    const svg = wrap.querySelector('svg'), marks = svg.querySelector('#marks');
    const render = () => {
      list.innerHTML = objs.map((o) => `<span class="find-item ${found.has(o.id) ? 'found' : ''}">${o.label}</span>`).join('');
      slotBox.innerHTML = slots(answer, found.size);
      marks.innerHTML = objs.filter((o) => found.has(o.id)).map((o) =>
        `<circle cx="${o.x}" cy="${o.y}" r="22" fill="none" stroke="#7cf2a6" stroke-width="4"/><circle cx="${o.x}" cy="${o.y}" r="28" fill="none" stroke="#7cf2a6" stroke-width="1.5" opacity=".6"/>`).join('');
    };
    svg.addEventListener('click', (e) => {
      if (found.size === objs.length) return;
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const k = 800 / svg.getBoundingClientRect().width; // auf kleinen Bildschirmen größere Trefferzone
      const hit = objs.find((o) => !found.has(o.id) && Math.hypot(o.x - p.x, o.y - p.y) < Math.max(o.r || 26, (o.r ? 11 : 18) * k));
      if (hit) {
        found.add(hit.id); render();
        if (found.size === objs.length) onDone();
      } else {
        const m = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        m.setAttribute('cx', p.x); m.setAttribute('cy', p.y); m.setAttribute('r', 14);
        m.setAttribute('fill', 'none'); m.setAttribute('stroke', '#ff7a9a'); m.setAttribute('stroke-width', 3);
        svg.append(m); setTimeout(() => m.remove(), 500);
      }
    });
    render();
    el.append(wrap, list, slotBox);
  }

  // ---------- 3) Buchstabensalat ----------
  function wordscramble(el, { answer, solved, onDone, words, seed }) {
    const rnd = seeded(hashStr(seed));
    const done = new Set(solved ? words.map((_, i) => i) : []);
    el.innerHTML = '';
    const box = h(`<div class="words"></div>`);
    const slotBox = h(`<div></div>`);
    const renderSlots = () => { slotBox.innerHTML = slots(answer, done.size); };
    words.forEach((w, i) => {
      let mixed; do mixed = shuffle([...w.word], rnd).join(''); while (mixed === w.word && w.word.length > 1);
      const row = h(`<form class="word-row ${done.has(i) ? 'solved' : ''}">
        <div class="scrambled">${mixed}<span class="word-hint">${w.hint}</span></div>
        <input autocomplete="off" spellcheck="false" aria-label="Lösung für ${mixed}" placeholder="Lösung…" ${done.has(i) ? `value="${w.word}" disabled` : ''}>
        <button class="btn small teal" ${done.has(i) ? 'disabled' : ''}>${done.has(i) ? '✓' : 'Prüfen'}</button></form>`);
      row.addEventListener('submit', (e) => {
        e.preventDefault();
        const inp = row.querySelector('input');
        const guess = inp.value.toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/[^A-Z]/g, '');
        if (guess === w.word) {
          done.add(i); row.classList.add('solved'); inp.disabled = true; inp.value = w.word;
          const b = row.querySelector('button'); b.textContent = '✓'; b.disabled = true;
          renderSlots(); if (done.size === words.length) onDone();
        } else { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
      });
      box.append(row);
    });
    renderSlots();
    el.append(box, slotBox);
  }

  // ---------- 4) Schiebepuzzle ----------
  async function puzzleImage(answer, withCode) {
    try { await document.fonts.load('900 60px "Cinzel Decorative"'); } catch (_) {}
    const c = document.createElement('canvas'); c.width = c.height = 600; const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 600); sky.addColorStop(0, '#120a2a'); sky.addColorStop(0.6, '#3a1f72'); sky.addColorStop(1, '#8a5bc0');
    g.fillStyle = sky; g.fillRect(0, 0, 600, 600);
    const r = seeded(42); g.fillStyle = '#fff';
    for (let i = 0; i < 90; i++) { g.globalAlpha = 0.3 + r() * 0.7; g.beginPath(); g.arc(r() * 600, r() * 330, r() * 1.8 + 0.4, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(470, 90, 42, 0, 7); g.fill();
    // Schloss
    g.fillStyle = '#1b1240';
    const tower = (x, w, top) => { g.fillRect(x, top, w, 600); g.beginPath(); g.moveTo(x - 8, top); g.lineTo(x + w / 2, top - w * 1.1); g.lineTo(x + w + 8, top); g.fill(); };
    g.fillRect(120, 330, 360, 270); tower(90, 70, 260); tower(440, 70, 260); tower(250, 100, 190);
    for (let x = 120; x < 480; x += 30) g.fillRect(x, 314, 18, 18);
    g.fillStyle = '#ffd56a';
    [[118, 300], [468, 300], [290, 240], [190, 390], [390, 390], [290, 330]].forEach(([x, y]) => { g.fillRect(x, y, 14, 22); });
    g.fillStyle = '#eef3ff'; g.beginPath(); g.moveTo(0, 520); g.quadraticCurveTo(300, 470, 600, 520); g.lineTo(600, 600); g.lineTo(0, 600); g.fill();
    // Code-Band
    g.fillStyle = 'rgba(18,10,42,0.78)'; g.fillRect(0, 420, 600, 110);
    g.strokeStyle = '#f4cf73'; g.lineWidth = 4; g.strokeRect(-4, 420, 608, 110);
    if (!withCode) {
      g.font = '700 40px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(244,207,115,0.55)';
      g.fillText('❄  ?  ?  ?  ❄', 300, 478);
      return c.toDataURL('image/png');
    }
    g.font = '900 78px "Cinzel Decorative", Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#f4cf73'; g.shadowBlur = 18; g.fillStyle = '#ffe9a8';
    g.fillText(answer.split('').join(' '), 300, 478);
    return c.toDataURL('image/png');
  }
  async function slidepuzzle(el, { answer, solved, onDone }) {
    el.innerHTML = '<div class="loading"><div><div class="spinner"></div>Puzzle wird gezaubert…</div></div>';
    const img = await puzzleImage(answer, false);
    const solvedImg = await puzzleImage(answer, true);
    const N = 3, EMPTY = N * N - 1;
    let pos = [...Array(N * N).keys()]; // pos[tile] = Zelle
    let moves = 0, isSolved = !!solved;
    const neighbors = (cell) => [cell - N, cell + N, cell % N ? cell - 1 : -1, (cell + 1) % N ? cell + 1 : -1].filter((c) => c >= 0 && c < N * N);
    if (!isSolved) {
      let prev = -1;
      for (let i = 0; i < 240 || pos.every((p, t) => p === t); i++) {
        const empty = pos[EMPTY];
        const opts = neighbors(empty).filter((c) => c !== prev);
        const target = opts[Math.floor(Math.random() * opts.length)];
        const t = pos.indexOf(target); pos[t] = empty; pos[EMPTY] = target; prev = empty;
      }
    }
    el.innerHTML = '';
    const board = h(`<div class="slide ${isSolved ? 'solved' : ''}"></div>`);
    const meta = h(`<div class="game-meta"></div>`);
    const tiles = [];
    for (let t = 0; t < N * N; t++) {
      const b = h(`<button class="tile" aria-label="Puzzleteil ${t + 1}"></button>`);
      b.style.backgroundImage = `url(${isSolved ? solvedImg : img})`;
      b.style.backgroundPosition = `${(t % N) * 50}% ${Math.floor(t / N) * 50}%`;
      b.addEventListener('click', () => move(t));
      tiles.push(b); board.append(b);
    }
    const render = () => {
      tiles.forEach((b, t) => {
        b.style.left = `${(pos[t] % N) * (100 / N)}%`; b.style.top = `${Math.floor(pos[t] / N) * (100 / N)}%`;
        b.style.visibility = t === EMPTY && !isSolved ? 'hidden' : 'visible';
      });
      meta.textContent = isSolved ? 'Das Bild ist wieder ganz! Lest den Code im Bild ✨' : `Züge: ${moves}`;
    };
    function move(t) {
      if (isSolved || t === EMPTY) return;
      if (!neighbors(pos[EMPTY]).includes(pos[t])) return;
      [pos[t], pos[EMPTY]] = [pos[EMPTY], pos[t]]; moves++;
      if (pos.every((p, i) => p === i)) {
        isSolved = true; board.classList.add('solved');
        tiles.forEach((tb) => { tb.style.backgroundImage = `url(${solvedImg})`; });
        onDone();
      }
      render();
    }
    render();
    el.append(board, meta);
  }

  window.GAMES = { memory, detective, wordscramble, slidepuzzle, ICONS, slots };
})();
