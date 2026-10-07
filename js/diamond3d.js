// Realistischer 3D-Diamant (Brillantschliff, 57 Facetten) mit three.js.
// Spiegelungen aus einer Studio-Lichtumgebung, Regenbogen-Feuer (Iridescence) und kurze
// Lichtblitze auf den Facetten. Die Stufe (0 = lädiert … 4 = perfekt) bestimmt Schliff,
// Klarheit und Funkeln. Fällt auf ein SVG zurück, wenn kein WebGL verfügbar ist.

import * as THREE from '../vendor/three.module.min.js';
import { glassDiamond } from './ui.js';
import { gemObject } from './gem3d.js';
import { cubeFromScene } from './refraction.js';

// Der klassische Diamant, wenn kein bestimmter Stein angegeben ist (Intro, Login, Silhouette).
const DIAMOND = { name: 'Diamant', c: '#ffffff', cut: 'brilliant', look: 'diamond', ior: 2.42, disp: 0.024, level: 4 };

export { THREE };

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

// ---- Geteilte Bausteine (auch für die 3D-Gegenstände im Inventar) ------------------------

// Studio mit hellen Lichtleisten auf schwarzem Grund: erzeugt die typischen
// Schwarz-Weiß-Reflexe eines Brillanten.
export function studioScene() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: 0x16161a, side: THREE.BackSide })));
  const panel = (w, h, pos, color, k) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(6, 6, [0, 5.5, 0], 0xffffff, 4);                 // große Softbox oben
  for (let i = 0; i < 14; i++) {                          // Lichtleisten rundherum, oben und unten
    const a = (i / 14) * Math.PI * 2;
    const up = i % 2 === 0;
    panel(0.6 + (i % 3) * 0.35, 3, [Math.cos(a) * 5, up ? 3 : -1.5, Math.sin(a) * 5], 0xffffff, 3 + (i % 4) * 1.5);
  }
  panel(7, 3, [0, 3.5, -5], 0xffffff, 3.5);               // Licht hinten oben (spiegelt sich in der Tafel)
  panel(5, 1.2, [0, 0.5, 5.5], 0xffffff, 2);              // Streiflicht von vorn
  // Regenbogen-Punkte rundherum für das "Feuer" (Dispersion)
  [0xff3b3b, 0xff9d2e, 0xfff23a, 0x46ff6a, 0x35d4ff, 0x5b6bff, 0xd04bff, 0xff4fd8].forEach((c, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    panel(1.1, 1.1, [Math.cos(a) * 4.8, i % 2 ? 0.4 : 2.2, Math.sin(a) * 4.8], c, 5);
  });
  return s;
}

export function studioEnvironment(renderer) {
  const s = studioScene();
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.015).texture;
  pm.dispose();
  return tex;
}

// Sternförmiger Lichtblitz als Textur (für Sprites).
let starTex;
export function starTexture() {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.35, 'rgba(200,230,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 5], [5, 128]]) {
    const lg = g.createLinearGradient(w > h ? 0 : 64, w > h ? 64 : 0, w > h ? 128 : 64, w > h ? 64 : 128);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,1)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

// Dreiecke so ausrichten, dass die Normale vom Mittelpunkt weg zeigt (für konvexe Körper).
export function facetGeometry(tris, center = new THREE.Vector3()) {
  const pos = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < tris.length; i += 3) {
    let [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    m.copy(a).add(b).add(c).divideScalar(3).sub(center);
    if (n.dot(m) < 0) [b, c] = [c, b];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// Runder Brillant: Tafel, 8 Sterne, 8 Hauptfacetten, 16 obere und 16 untere Rundistenfacetten,
// 8 Pavillonfacetten. Maße nach Tolkowsky (Tafel 56 %, Kronenwinkel ~34°, Pavillon ~41°).
export function brilliantGeometry({ damage = 0 } = {}) {
  const V = (r, a, y) => new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
  const n = 8, step = (Math.PI * 2) / n, half = step / 2;
  const rT = 0.56, yT = 0.33, yG = 0.025, yGb = -0.025, depth = 0.86;
  const rS = 0.78, yS = yG + ((1 - rS) / (1 - rT)) * (yT - yG) * 1.08;
  const rL = 0.2, yL = yGb - (1 - rL) * depth;
  const culet = new THREE.Vector3(0, yGb - depth, 0);
  const tableC = new THREE.Vector3(0, yT, 0);

  const T = [], S = [], G = [], H = [], Gb = [], Hb = [], L = [];
  for (let k = 0; k < n; k++) {
    const a = k * step;
    T.push(V(rT, a + half, yT));
    S.push(V(rS, a, yS));
    G.push(V(1, a, yG));
    H.push(V(1, a + half, yG));
    Gb.push(V(1, a, yGb));
    Hb.push(V(1, a + half, yGb));
    L.push(V(rL, a + half, yL));
  }
  const nx = (k) => (k + 1) % n, pv = (k) => (k + n - 1) % n;
  const t = [];
  const tri = (a, b, c) => t.push(a, b, c);
  for (let k = 0; k < n; k++) {
    tri(tableC, T[k], T[nx(k)]);                                 // Tafel
    tri(T[pv(k)], T[k], S[k]);                                   // Stern
    tri(T[k], S[k], H[k]); tri(T[k], H[k], S[nx(k)]);            // Hauptfacette (Drachen)
    tri(S[k], G[k], H[k]); tri(S[nx(k)], H[k], G[nx(k)]);        // obere Rundistenfacetten
    tri(G[k], H[k], Gb[k]); tri(H[k], Hb[k], Gb[k]);             // Rundiste
    tri(H[k], G[nx(k)], Hb[k]); tri(G[nx(k)], Gb[nx(k)], Hb[k]);
    tri(Gb[k], Hb[k], L[k]); tri(Hb[k], Gb[nx(k)], L[k]);        // untere Rundistenfacetten
    tri(Gb[k], L[pv(k)], culet); tri(Gb[k], culet, L[k]);        // Pavillon
  }
  // T, S und Stern-Geometrie: Tafelecken liegen auf den Halbwinkeln, daher Stern zwischen T[k-1] und T[k].

  if (damage) {
    // Abgeplatzte Ecken: gleiche Position -> gleicher Versatz, damit die Facetten zusammenhängen.
    const seen = new Map();
    for (const v of t) {
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!seen.has(key)) {
        const r = Math.abs(Math.sin((v.x * 97 + v.y * 89 + v.z * 83) * 12.9898) * 43758.5453) % 1;
        const k = 1 - damage * (r > 0.5 ? r : r * 0.3);
        seen.set(key, new THREE.Vector3(v.x * k, v.y + (r - 0.5) * damage * 0.35, v.z * k));
      }
    }
    for (let i = 0; i < t.length; i++) {
      const v = t[i];
      t[i] = seen.get(`${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`);
    }
  }
  return facetGeometry(t, new THREE.Vector3(0, -0.2, 0));
}

// ---- Fertige Bühne mit Renderer, Drehung per Finger und Glow ------------------------------

export function createDiamond(container, opts = {}) {
  const { level = 2, glow = 0.4, autoRotate = true, interactive = true, tilt = 0.55, rim = '#ffffff', mystery = false } = opts;
  // opts.gem: ein Edelstein aus data.js (TIERS). Ohne Angabe zeigt die Bühne den Diamanten.

  if (!webglAvailable()) {
    container.innerHTML = `<div class="diamond-fallback">${glassDiamond()}</div>`;
    return { setLevel() {}, setGem() {}, setMystery() {}, setRim() {}, setGlow() {}, pulse() {}, snapshot() { return null; }, canvas: null, dispose() { container.innerHTML = ''; } };
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);
  renderer.domElement.classList.add('diamond-canvas');

  const scene = new THREE.Scene();
  const env = studioEnvironment(renderer);
  scene.environment = env;
  // Würfel-Umgebung für die Lichtbrechung in facettierten Steinen
  let envCube = null;
  try { envCube = cubeFromScene(renderer, studioScene(), 256); } catch { /* Ersatzmaterial */ }
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.5, 5.4);
  camera.lookAt(0, -0.14, 0);

  // Halter für den Stein: kippen, drehen, pulsieren. Der Stein darin lässt sich austauschen.
  const holder = new THREE.Group();
  holder.rotation.x = tilt;
  scene.add(holder);
  let gem = null;
  let mysteryOn = mystery;
  let mysteryColor = rim;
  const setGem = (spec) => {
    if (gem) { holder.remove(gem.group); gem.dispose(); }
    gem = gemObject(spec || DIAMOND, { envCube: envCube?.texture });
    holder.add(gem.group);
    if (mysteryOn) gem.setMystery(true, mysteryColor);
  };
  setGem(opts.gem);

  // Farbiges Randlicht von unten (Seltenheit) und ein Spitzlicht
  const rimLight = new THREE.PointLight(rim, 10, 10, 1.4);
  rimLight.position.set(0, -2, 1.6);
  scene.add(rimLight);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(1.5, 3, 4);
  scene.add(key);

  let spin = 0, velocity = 0, dragging = false, lastX = 0, glowLevel = glow, pulseT = 0;
  const onDown = (e) => { dragging = true; lastX = e.clientX; velocity = 0; renderer.domElement.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    velocity = dx * 0.012;
    spin += velocity;
  };
  const onUp = () => { dragging = false; };
  if (interactive) {
    const el = renderer.domElement;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0;
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dragging) {
      velocity *= 0.94;
      spin += velocity + (autoRotate ? dt * 0.5 : 0);
    }
    holder.rotation.y = spin;
    pulseT = Math.max(0, pulseT - dt * 2.2);
    holder.scale.setScalar(1 + glowLevel * 0.04 + pulseT * 0.1);
    gem.update(now / 1000, pulseT);
    rimLight.intensity = 4 + glowLevel * 10 + pulseT * 25;
    renderer.toneMappingExposure = 1.05 + pulseT * 0.6;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    canvas: renderer.domElement,
    setLevel(lv) { gem.setLevel?.(lv); },
    setGem,
    setMystery(on, color) { mysteryOn = on; if (color) mysteryColor = color; gem.setMystery(on, mysteryColor); },
    setRim(color) { rimLight.color.set(color); },
    setGlow(v) { glowLevel = Math.max(0, Math.min(1, v)); },
    pulse() { pulseT = 1; },
    // Scharfes Standbild in beliebiger Größe (für Story- und Sharing-Bilder).
    snapshot(w, h) {
      const pr = renderer.getPixelRatio();
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      gem.update(performance.now() / 1000, 0.35);
      renderer.render(scene, camera);
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      out.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
      renderer.setPixelRatio(pr);
      resize();
      return out;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gem.dispose();
      env.dispose();
      envCube?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
