// 3D-Szene: GPU-Schneefall (immer aktiv) + prozeduraler Tresor (Three.js) mit GSAP-Animationen.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

export function createStage(canvas) {
  const gsap = window.gsap;
  const isMobile = matchMedia('(max-width: 760px)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile && devicePixelRatio < 1.5, alpha: true, powerPreference: 'high-performance' });
  // Auflösung: im Tresor höher, beim Schnee niedriger. Sinkt die Bildrate, wird automatisch reduziert.
  const MAX_PR = Math.min(devicePixelRatio, isMobile ? 1.25 : 1.5);
  let quality = 1; // 1 = voll, wird bei Ruckeln schrittweise gesenkt
  let mode = 'ambient';
  const targetPR = () => Math.max(0.6, (mode === 'vault' ? MAX_PR : Math.min(1, MAX_PR)) * quality);
  renderer.setPixelRatio(targetPR());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const CAM_HOME = new THREE.Vector3(0, 0, 13);
  camera.position.copy(CAM_HOME);

  // ---------- Schnee (Shader, läuft komplett auf der GPU) ----------
  const N = isMobile ? 500 : 1100;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 34;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 2] = -14 + Math.random() * 22;
    seed[i] = Math.random();
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  snowGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const snowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uOpacity: { value: 1 } },
    vertexShader: `
      attribute float aSeed; uniform float uTime; uniform float uPR; varying float vA;
      void main(){
        vec3 p = position;
        float sp = 0.35 + aSeed * 0.9;
        p.y = mod(p.y - uTime * sp + 11.0, 22.0) - 11.0;
        p.x += sin(uTime * (0.3 + aSeed) + aSeed * 40.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (18.0 + aSeed * 34.0) * uPR / -mv.z;
        vA = 0.35 + aSeed * 0.65;
      }`,
    fragmentShader: `
      varying float vA; uniform float uOpacity;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.85, 0.93, 1.0), a * a * vA * uOpacity);
      }`,
  });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  snow.renderOrder = 10;
  scene.add(snow);

  // ---------- Materialien ----------
  const steel = new THREE.MeshStandardMaterial({ color: 0x8f9bb3, metalness: 1, roughness: 0.3 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3a4357, metalness: 1, roughness: 0.42 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xe0a64e, metalness: 1, roughness: 0.22 });
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x1a2440 }); // Wand: günstiges Material, füllt den ganzen Bildschirm
  const seamMat = new THREE.MeshLambertMaterial({ color: 0x2c3654 });

  function etchedFace() {
    const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
    const grd = g.createRadialGradient(512, 512, 40, 512, 512, 512);
    grd.addColorStop(0, '#9fa9bf'); grd.addColorStop(1, '#5d677e');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
    for (let r = 8; r < 512; r += 3) { // gebürstetes Metall
      g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.07})`; g.lineWidth = 1;
      g.beginPath(); g.arc(512, 512, r, 0, Math.PI * 2); g.stroke();
    }
    g.save(); g.translate(512, 512);
    g.font = '600 46px "Cormorant Garamond", Georgia, serif'; g.fillStyle = 'rgba(30,24,10,0.55)';
    const txt = '  ENCHANTED HAWKS  ✦  WINTEREVENT  ✦  SCHNITZELJAGD DURCH JORVIK  ✦'; const R = 420;
    const step = (Math.PI * 2) / txt.length;
    [...txt].forEach((ch, i) => { g.save(); g.rotate(i * step); g.translate(0, -R); g.fillText(ch, -12, 0); g.restore(); });
    g.restore();
    g.strokeStyle = 'rgba(20,16,8,0.45)'; g.lineWidth = 4;
    g.beginPath(); g.arc(512, 512, 470, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(512, 512, 360, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function glowTex(inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, inner); grd.addColorStop(0.35, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  // ---------- Tresor ----------
  const vault = new THREE.Group(); vault.visible = false; scene.add(vault);
  const R = 2.4, DEPTH = 0.62;

  const wallShape = new THREE.Shape();
  wallShape.moveTo(-30, -17); wallShape.lineTo(30, -17); wallShape.lineTo(30, 17); wallShape.lineTo(-30, 17); wallShape.lineTo(-30, -17);
  const hole = new THREE.Path(); hole.absarc(0, 0, R + 0.1, 0, Math.PI * 2, true); wallShape.holes.push(hole);
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape, 48), wallMat); wall.position.z = -0.45; vault.add(wall);
  // Wandplatten
  for (let i = -4; i <= 4; i++) {
    if (Math.abs(i * 3.4) < R + 1) continue;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 34, 0.02), seamMat); seam.position.set(i * 3.4, 0, -0.43); vault.add(seam);
  }
  // Rahmen
  const frame = new THREE.Mesh(new THREE.TorusGeometry(R + 0.32, 0.36, 16, 72), darkSteel); frame.position.z = -0.12; vault.add(frame);
  const frameLip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.06, 6, 72), brass); frameLip.position.z = 0.05; vault.add(frameLip);
  // Innenraum
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 6, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x4a3214, metalness: 0.9, roughness: 0.38, side: THREE.BackSide, emissive: 0x2a1806, emissiveIntensity: 0.25 }));
  tunnel.rotation.x = Math.PI / 2; tunnel.position.z = -3.2; vault.add(tunnel);
  for (let i = 1; i <= 5; i++) { // Ringe für Tiefe
    const rib = new THREE.Mesh(new THREE.TorusGeometry(R - 0.02, 0.07, 6, 48), brass); rib.position.z = -i * 1.05; vault.add(rib);
  }
  const backDisc = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,240,205,1)', 'rgba(150,90,25,1)') }));
  backDisc.position.z = -6.1; vault.add(backDisc);
  const innerLight = new THREE.PointLight(0xffc06a, 0, 30, 1.6); innerLight.position.set(0, 0, -2.5); vault.add(innerLight);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,236,190,1)', 'rgba(255,170,70,0.45)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  glow.scale.set(7, 7, 1); glow.position.z = -1.5; vault.add(glow);
  // schwebender Kristall im Tresor
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, metalness: 0.2, roughness: 0.05, emissive: 0x4fb6ff, emissiveIntensity: 0.6 }));
  crystal.position.set(0, 0, -3.2); vault.add(crystal);

  // Tür (Scharnier links)
  const hinge = new THREE.Group(); hinge.position.set(-R, 0, 0.05); vault.add(hinge);
  const door = new THREE.Group(); door.position.x = R; hinge.add(door);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, DEPTH, 72), steel); body.rotation.x = Math.PI / 2; door.add(body);
  const face = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 72), new THREE.MeshStandardMaterial({ map: etchedFace(), metalness: 0.95, roughness: 0.32 }));
  face.position.z = DEPTH / 2 + 0.001; door.add(face);
  [[R - 0.18, 0.05], [1.62, 0.05], [0.9, 0.035]].forEach(([r, t]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 72), brass); ring.position.z = DEPTH / 2 + 0.02; door.add(ring);
  });
  const rivetGeo = new THREE.SphereGeometry(0.075, 8, 6);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, rv = new THREE.Mesh(rivetGeo, brass);
    rv.position.set(Math.cos(a) * 2.0, Math.sin(a) * 2.0, DEPTH / 2 + 0.02); door.add(rv);
  }
  // Scharnierblöcke
  [-1.3, 1.3].forEach((y) => {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), darkSteel); hb.position.set(-R - 0.05, y, 0); door.add(hb);
    const hp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 12), brass); hp.position.set(-R - 0.05, y, 0.28); door.add(hp);
  });
  // Riegel
  const bolts = [];
  const boltGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.72, 10);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    if (Math.cos(a) < -0.75) continue; // nicht auf der Scharnierseite
    const b = new THREE.Mesh(boltGeo, brass);
    b.rotation.z = a - Math.PI / 2;
    const set = (r) => b.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    b.userData = { a, set, r: R + 0.25 }; set(b.userData.r);
    door.add(b); bolts.push(b);
  }
  // Handrad
  const wheel = new THREE.Group(); wheel.position.z = DEPTH / 2 + 0.38; door.add(wheel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 24), brass); hub.rotation.x = Math.PI / 2; hub.position.z = -0.15; wheel.add(hub);
  const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), darkSteel); hubCap.rotation.x = Math.PI / 2; hubCap.position.z = 0.1; wheel.add(hubCap);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.085, 10, 56), brass); wheel.add(rim);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.15, 8), brass);
    sp.position.set(Math.cos(a) * 0.575, Math.sin(a) * 0.575, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), brass);
    knob.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0.04); wheel.add(knob);
  }

  // Licht
  scene.add(new THREE.AmbientLight(0x6e86c4, 0.35));
  const key = new THREE.DirectionalLight(0xcfe2ff, 2.4); key.position.set(-5, 6, 9); scene.add(key);
  const rimL = new THREE.SpotLight(0xffb45e, 60, 30, 0.6, 0.6, 1.4); rimL.position.set(6, -3, 8); rimL.target.position.set(0, 0, 0); scene.add(rimL, rimL.target);
  steel.emissive.set(0xff2244); steel.emissiveIntensity = 0; // rotes Aufglühen bei falschem Code

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth - 0.5); mouse.ty = (e.clientY / innerHeight - 0.5); }, { passive: true });
  const camBase = new THREE.Vector3().copy(CAM_HOME);
  const lookAt = new THREE.Vector3(0, 0, 0);
  let visible = !document.hidden, paused = false, rafId = 0, frameNo = 0;
  let acc = 0, accN = 0, lastT = performance.now();
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function applyPR() {
    const pr = targetPR();
    if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) { renderer.setPixelRatio(pr); resize(); snowMat.uniforms.uPR.value = pr; }
  }
  resize(); addEventListener('resize', resize);
  const start = () => { if (!rafId && visible && !paused) { lastT = performance.now(); rafId = requestAnimationFrame(loop); } };
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) start(); });
  function loop(now) {
    rafId = 0;
    if (!visible || paused) return;
    rafId = requestAnimationFrame(loop);
    // Ruckel-Erkennung: dauert ein Bild im Schnitt zu lange, Auflösung senken
    const dt = now - lastT; lastT = now;
    if (dt < 250) { acc += dt; accN++; }
    if (accN >= 45) {
      const avg = acc / accN; acc = 0; accN = 0;
      if (avg > 24 && quality > 0.55) { quality -= 0.15; applyPR(); }
      else if (avg < 14 && quality < 1) { quality = Math.min(1, quality + 0.05); applyPR(); }
    }
    // Ohne Tresor reicht der Schnee mit 30 Bildern pro Sekunde
    if (mode !== 'vault' && (frameNo++ & 1)) return;
    const t = clock.getElapsedTime();
    snowMat.uniforms.uTime.value = t;
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    camera.position.set(camBase.x + mouse.x * 0.9, camBase.y - mouse.y * 0.6, camBase.z);
    camera.lookAt(lookAt);
    if (vault.visible && hinge.rotation.y < -0.3) { crystal.rotation.y = t * 0.8; crystal.position.y = Math.sin(t * 1.6) * 0.12; }
    renderer.render(scene, camera);
  }
  start();

  // ---------- API ----------
  function resetVault(open = false) {
    gsap.killTweensOf([hinge.rotation, door.position, wheel.rotation, camBase, innerLight, glow.material, steel, lookAt]);
    bolts.forEach((b) => { gsap.killTweensOf(b.userData); b.userData.r = open ? R - 0.45 : R + 0.25; b.userData.set(b.userData.r); });
    hinge.rotation.y = open ? -1.85 : 0; door.position.z = 0; wheel.rotation.z = 0;
    innerLight.intensity = open ? 16 : 0; glow.material.opacity = open ? 0.55 : 0; steel.emissiveIntensity = 0;
    camBase.set(0, open ? 0 : -1.25, open ? 5.6 : 13.5); lookAt.set(0, open ? 0 : -1.25, open ? -3 : 0);
  }
  const fit = () => { // auf schmalen Bildschirmen Kamera weiter weg
    const a = innerWidth / innerHeight; return a < 0.8 ? 1 + (0.8 - a) * 1.6 : 1;
  };

  return {
    setMode(m, opts = {}) {
      mode = m;
      paused = m === 'paused';
      canvas.style.visibility = paused ? 'hidden' : 'visible';
      if (paused) return;
      applyPR(); start();
      if (m === 'vault') {
        vault.visible = true; resetVault(!!opts.open);
        const f = fit();
        camBase.z *= f;
        snowMat.uniforms.uOpacity.value = 0.55;
        if (!opts.open) gsap.from(camBase, { z: 18 * f, duration: reduce ? 0.01 : 1.8, ease: 'power3.out' });
      } else {
        vault.visible = false; camBase.copy(CAM_HOME); lookAt.set(0, 0, 0); snowMat.uniforms.uOpacity.value = 1;
      }
    },
    tick(dir = 1) {
      gsap.to(wheel.rotation, { z: `+=${0.22 * dir}`, duration: 0.25, ease: 'back.out(3)' });
    },
    fail() {
      const tl = gsap.timeline();
      tl.to(wheel.rotation, { z: '+=0.35', duration: 0.12, ease: 'power2.out' })
        .to(wheel.rotation, { z: '-=0.7', duration: 0.18, ease: 'power2.inOut' })
        .to(wheel.rotation, { z: '+=0.35', duration: 0.5, ease: 'elastic.out(1, 0.3)' })
        .to(steel, { emissiveIntensity: 0.35, duration: 0.08, yoyo: true, repeat: 3 }, 0)
        .to(camBase, { x: 0.12, duration: 0.05, yoyo: true, repeat: 5, ease: 'none' }, 0)
        .set(camBase, { x: 0 });
      return tl;
    },
    open() {
      const f = fit();
      const tl = gsap.timeline();
      if (reduce) tl.timeScale(4);
      tl.to(wheel.rotation, { z: `-=${Math.PI * 2.5}`, duration: 1.6, ease: 'power2.inOut' })
        .to(camBase, { z: 11.6 * f, duration: 1.6, ease: 'power1.inOut' }, 0)
        .to(bolts.map((b) => b.userData), { r: R - 0.45, duration: 0.32, ease: 'back.in(2)', stagger: 0.05, onUpdate() { bolts.forEach((b) => b.userData.set(b.userData.r)); } }, 1.25)
        .to(camBase, { y: '-=0.08', duration: 0.06, yoyo: true, repeat: 3, ease: 'none' }, 1.75)
        .to(door.position, { z: 0.22, duration: 0.3, ease: 'power2.out' }, 1.8)
        .to(glow.material, { opacity: 0.35, duration: 0.3 }, 1.8)
        .to(innerLight, { intensity: 12, duration: 0.3 }, 1.8)
        .to(hinge.rotation, { y: -1.85, duration: 2.1, ease: 'power3.inOut' }, 2.1)
        .to(innerLight, { intensity: 16, duration: 1.6, ease: 'power2.in' }, 2.3)
        .to(glow.material, { opacity: 0.55, duration: 1.6 }, 2.3)
        .to(camBase, { x: 0, y: 0, z: 5.6 * f, duration: 2.2, ease: 'power2.inOut' }, 3.0)
        .to(lookAt, { y: 0, z: -3, duration: 2.2, ease: 'power2.inOut' }, 3.0);
      return tl;
    },
    hasWebGL: true,
  };
}
