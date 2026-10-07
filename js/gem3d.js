// 3D-Edelsteine: Schliffe, Materialien und gezeichnete Muster für alle 89 Steine.
// Der Diamant selbst kommt aus diamond3d.js (diamondObject), alle anderen von hier.

import * as THREE from '../vendor/three.module.min.js';
import { brilliantGeometry, starTexture } from './diamond3d.js';

// ---- Zufall mit festem Startwert, damit jeder Stein immer gleich aussieht ---------------

function seeded(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---- Schliffe -------------------------------------------------------------------------------

// Treppenschliff (Smaragdschliff): achteckig, gestreckt, mit Stufen in Krone und Pavillon.
function stepGeometry() {
  const profile = [
    [0, -0.72], [0.34, -0.6], [0.66, -0.36], [0.88, -0.14], [1, -0.02],
    [1, 0.03], [0.9, 0.15], [0.78, 0.25], [0.64, 0.32], [0, 0.32],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 8);
  geo.rotateY(Math.PI / 8);
  geo.scale(1.25, 1, 0.82);
  return geo.toNonIndexed();
}

// Cabochon: glatte Wölbung mit flachem Boden. UVs als Draufsicht, damit Muster natürlich liegen.
function cabochonGeometry(oval = 1.2) {
  const pts = [new THREE.Vector2(0, -0.14), new THREE.Vector2(0.97, -0.14), new THREE.Vector2(1, -0.08)];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a), 0.58 * Math.sin(a)));
  }
  const geo = new THREE.LatheGeometry(pts, 64);
  geo.scale(oval, 1, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * oval) + 0.5, pos.getZ(i) / 2 + 0.5);
  geo.computeVertexNormals();
  return geo;
}

function cutGeometry(spec) {
  if (spec.cut === 'cabochon') return cabochonGeometry();
  if (spec.cut === 'step') return stepGeometry();
  const geo = brilliantGeometry();
  if (spec.cut === 'oval') geo.scale(1.24, 1, 0.9);
  return geo;
}

// ---- Gezeichnete Muster (Canvas-Texturen) -----------------------------------------------

function canvasTexture(draw, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const PATTERNS = {
  // Malachit: gewellte, konzentrische Bänder
  bands(g, n, spec, rnd) {
    g.fillStyle = spec.c2;
    g.fillRect(0, 0, n, n);
    const cx = n * (0.3 + rnd() * 0.4), cy = n * (0.3 + rnd() * 0.4);
    for (let r = n; r > 4; r -= 6 + rnd() * 10) {
      g.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.08) {
        const rr = r * (1 + 0.08 * Math.sin(a * 3 + r * 0.05));
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
      }
      g.fillStyle = (Math.round(r / 7) % 2) ? spec.c : spec.c2;
      g.fill();
    }
  },
  // Larimar, Sugilith: weiche Wolken
  clouds(g, n, spec, rnd) {
    g.fillStyle = spec.c;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * n, y = rnd() * n, r = 20 + rnd() * 90;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, spec.c2 + '66');
      grd.addColorStop(1, spec.c2 + '00');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  },
  // Lapislazuli: tiefes Blau mit goldenen Pyrit-Flecken
  flecks(g, n, spec, rnd) {
    g.fillStyle = spec.c;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * n, y = rnd() * n, r = 30 + rnd() * 80;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(10,20,80,0.45)');
      grd.addColorStop(1, 'rgba(10,20,80,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.fillStyle = spec.c2;
    for (let i = 0; i < 260; i++) g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 3);
  },
  // Dendritenachat: helle Basis mit farnartigen dunklen Verästelungen
  dendrite(g, n, spec, rnd) {
    g.fillStyle = spec.c;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = spec.c2;
    const branch = (x, y, a, len, w) => {
      if (len < 4) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      branch(x2, y2, a - 0.5 + rnd() * 0.3, len * 0.72, w * 0.7);
      branch(x2, y2, a + 0.5 - rnd() * 0.3, len * 0.72, w * 0.7);
    };
    for (let i = 0; i < 7; i++) branch(rnd() * n, n * (0.7 + rnd() * 0.3), -Math.PI / 2 + (rnd() - 0.5), 90 + rnd() * 60, 7);
  },
  // Türkis: Adernetz aus dunklem Muttergestein
  matrix(g, n, spec, rnd) {
    g.fillStyle = spec.c;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = spec.c2;
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = rnd() * n, y = rnd() * n;
      g.lineWidth = 1 + rnd() * 3;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70; g.lineTo(x, y); }
      g.stroke();
    }
  },
  // Rhodonit: rosa mit schwarzen Adern
  veins(g, n, spec, rnd) {
    PATTERNS.matrix(g, n, spec, rnd);
  },
  // Sonnenstein: warmer Verlauf mit glitzernden Plättchen
  glitter(g, n, spec, rnd) {
    const grd = g.createLinearGradient(0, 0, n, n);
    grd.addColorStop(0, spec.c);
    grd.addColorStop(1, '#a33c12');
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = rnd() > 0.5 ? spec.c2 : '#ffffff';
      g.globalAlpha = 0.4 + rnd() * 0.6;
      g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    g.globalAlpha = 1;
  },
  // Opal: Farbspiel – leuchtende Flecken in allen Regenbogenfarben
  opal(g, n, spec, rnd) {
    const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n * 0.7);
    grd.addColorStop(0, spec.c);
    grd.addColorStop(1, spec.c2 || spec.c);
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 180; i++) {
      const x = rnd() * n, y = rnd() * n, r = 8 + rnd() * 34;
      const hue = Math.floor(rnd() * 360);
      const p = g.createRadialGradient(x, y, 0, x, y, r);
      p.addColorStop(0, `hsla(${hue},95%,60%,0.95)`);
      p.addColorStop(0.6, `hsla(${(hue + 40) % 360},95%,55%,0.6)`);
      p.addColorStop(1, `hsla(${hue},95%,55%,0)`);
      g.fillStyle = p;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  },
  // Labradorit/Spektrolith: dunkle Basis mit schillernden Bändern
  labra(g, n, spec, rnd) {
    g.fillStyle = spec.c;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 14; i++) {
      const y = rnd() * n, h = 20 + rnd() * 60, hue = 160 + rnd() * 120;
      const grd = g.createLinearGradient(0, y - h, 0, y + h);
      grd.addColorStop(0, `hsla(${hue},90%,55%,0)`);
      grd.addColorStop(0.5, `hsla(${hue},95%,55%,0.95)`);
      grd.addColorStop(1, `hsla(${hue},90%,55%,0)`);
      g.save();
      g.translate(n / 2, n / 2);
      g.rotate(-0.4 + rnd() * 0.3);
      g.fillStyle = grd;
      g.fillRect(-n, y - n / 2 - h, n * 2, h * 2);
      g.restore();
    }
  },
  // Sternsaphir/Sternrubin: seidiger Grund
  silk(g, n, spec, rnd) {
    const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n * 0.6);
    grd.addColorStop(0, '#ffffff55');
    grd.addColorStop(0.15, spec.c);
    grd.addColorStop(1, '#00000088');
    g.fillStyle = spec.c;
    g.fillRect(0, 0, n, n);
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 300; i++) {
      const a = rnd() * Math.PI;
      g.beginPath();
      g.moveTo(n / 2, n / 2);
      g.lineTo(n / 2 + Math.cos(a) * n, n / 2 + Math.sin(a) * n);
      g.stroke();
    }
  },
};

// Sechsstrahliger Stern (Asterismus) als Leuchttextur
function asterismTexture() {
  return canvasTexture((g, n) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, n, n);
    g.translate(n / 2, n / 2);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      g.save();
      g.rotate((i * Math.PI) / 3);
      const grd = g.createLinearGradient(-n / 2, 0, n / 2, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(-n / 2, -3, n, 6);
      g.restore();
    }
    const c = g.createRadialGradient(0, 0, 0, 0, 0, 40);
    c.addColorStop(0, 'rgba(255,255,255,0.9)');
    c.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = c;
    g.fillRect(-40, -40, 80, 80);
  });
}

// ---- Materialien ---------------------------------------------------------------------------

function darker(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k);
}

function buildMaterials(spec) {
  const rnd = seeded(spec.name);
  const disposables = [];
  const tex = (name) => {
    const t = canvasTexture((g, n) => PATTERNS[name](g, n, spec, rnd));
    disposables.push(t);
    return t;
  };

  if (spec.cut !== 'cabochon') {
    // Facettiert: farbiger, durchscheinender Stein mit getönten Innenreflexen
    const outer = new THREE.MeshPhysicalMaterial({
      color: spec.bicolor ? 0xffffff : spec.c, vertexColors: !!spec.bicolor,
      metalness: 0.55, roughness: 0.03, flatShading: true, transparent: true, opacity: 0.88,
      clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.18, iridescenceIOR: 1.6, envMapIntensity: 1.35,
      emissive: spec.glow ? spec.c : 0x000000, emissiveIntensity: spec.glow ? 0.45 : 0,
    });
    const inner = new THREE.MeshPhysicalMaterial({
      color: darker(spec.c, 0.6), metalness: 1, roughness: 0.05, side: THREE.BackSide, flatShading: true, envMapIntensity: 1.1,
    });
    return { outer, inner, disposables };
  }

  // Cabochons: wenig Umgebungsspiegelung, sonst überstrahlt der Glanz das Muster
  const base = { roughness: 0.55, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.05, envMapIntensity: 0.22 };
  let outer;
  switch (spec.look) {
    case 'opaque':
      outer = new THREE.MeshPhysicalMaterial({ ...base, map: tex(spec.pattern) });
      break;
    case 'opal': {
      const map = tex('opal');
      outer = new THREE.MeshPhysicalMaterial({
        ...base, map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.28,
        iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 1100],
      });
      break;
    }
    case 'labra': {
      const map = tex('labra');
      outer = new THREE.MeshPhysicalMaterial({
        ...base, map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.95,
        iridescence: 0.25, iridescenceIOR: 2, iridescenceThicknessRange: [300, 1300],
      });
      break;
    }
    case 'moon':
      outer = new THREE.MeshPhysicalMaterial({
        ...base, color: spec.c, transparent: true, opacity: 0.92, sheen: 0.5, sheenColor: new THREE.Color('#9cc4ff'),
        sheenRoughness: 0.3, emissive: new THREE.Color('#7fa6ff'), emissiveIntensity: 0.12, iridescence: 0.35,
      });
      break;
    case 'star': {
      const star = asterismTexture();
      disposables.push(star);
      outer = new THREE.MeshPhysicalMaterial({
        ...base, map: tex('silk'), emissiveMap: star, emissive: 0xffffff, emissiveIntensity: 0.85,
      });
      break;
    }
    default: // milk: milchig-durchscheinend mit innerem Leuchten
      outer = new THREE.MeshPhysicalMaterial({
        ...base, color: spec.c, transparent: true, opacity: 0.9, sheen: 0.25, sheenColor: new THREE.Color('#ffffff'),
        emissive: spec.c, emissiveIntensity: 0.06,
      });
  }
  return { outer, inner: null, disposables };
}

// Bicolor: Farbe wechselt von einer Seite zur anderen
function paintBicolor(geo, c1, c2) {
  const a = new THREE.Color(c1), b = new THREE.Color(c2), tmp = new THREE.Color();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.smoothstep((pos.getX(i) - min.x) / (max.x - min.x), 0.35, 0.65);
    tmp.copy(a).lerp(b, t).toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// ---- Edelstein-Objekt ----------------------------------------------------------------------

export function gemObject(spec) {
  const group = new THREE.Group();
  const geo = cutGeometry(spec);
  if (spec.bicolor) paintBicolor(geo, spec.c, spec.c2);
  const { outer, inner, disposables } = buildMaterials(spec);
  const meshes = [];
  if (inner) {
    const im = new THREE.Mesh(geo, inner);
    im.scale.setScalar(0.985);
    meshes.push(im);
  }
  meshes.push(new THREE.Mesh(geo, outer));
  meshes.forEach((m) => group.add(m));

  // Rutilquarz: goldene Nadeln im Stein
  if (spec.name === 'Rutilquarz') {
    const rnd = seeded('rutil');
    const v = [];
    for (let i = 0; i < 18; i++) {
      const x = (rnd() - 0.5) * 1.4, y = -0.4 + rnd() * 0.6, z = (rnd() - 0.5) * 1.2, a = rnd() * Math.PI;
      v.push(x, y, z, x + Math.cos(a) * 0.5, y + (rnd() - 0.5) * 0.2, z + Math.sin(a) * 0.5);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: spec.c2, transparent: true, opacity: 0.8 }));
    group.add(lines);
    disposables.push(lg, lines.material);
  }

  // Lichtblitze: facettierte Steine funkeln mehr als Cabochons
  const sparkles = new THREE.Group();
  group.add(sparkles);
  const count = spec.cut === 'cabochon' ? 2 : 3 + spec.level * 2;
  const pos = geo.attributes.position;
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, (i * 7919) % pos.count);
    if (v.y < -0.05) v.set(v.x * 0.6, 0.2, v.z * 0.6);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0,
    }));
    sp.position.copy(v).multiplyScalar(1.04);
    sp.userData = { phase: (i * 1.618) % 1, speed: 0.35 + ((i * 0.37) % 0.5) };
    sparkles.add(sp);
  }

  // Mystery: schwarzer Stein mit leuchtenden Kanten
  const edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, spec.cut === 'cabochon' ? 30 : 1), edgeMat);
  edges.scale.setScalar(1.003);
  group.add(edges);
  const saved = { color: outer.color.clone(), map: outer.map, emissive: outer.emissive.clone(), ei: outer.emissiveIntensity };
  const colA = new THREE.Color(spec.c), colB = new THREE.Color(spec.c2 || spec.c);

  let mystery = false;
  return {
    group,
    setMystery(on, color) {
      mystery = on;
      if (color) edgeMat.color.set(color);
      edgeMat.opacity = on ? 1 : 0;
      sparkles.visible = !on;
      outer.color.copy(on ? new THREE.Color(0x050506) : saved.color);
      outer.map = on ? null : saved.map;
      outer.emissive.copy(on ? edgeMat.color : saved.emissive);
      outer.emissiveIntensity = on ? 0.14 : saved.ei;
      outer.needsUpdate = true;
      if (inner) inner.visible = !on;
    },
    update(t, boost = 0) {
      if (spec.shift && !mystery) {
        // Alexandrit: Farbwechsel zwischen Grün (Tageslicht) und Purpur (Kunstlicht)
        outer.color.copy(colA).lerp(colB, (Math.sin(t * 0.8) + 1) / 2);
        inner?.color.copy(outer.color).multiplyScalar(0.6);
      }
      if (spec.look === 'moon' && !mystery) outer.emissiveIntensity = 0.08 + (Math.sin(t * 1.4) + 1) * 0.08;
      sparkles.children.forEach((sp) => {
        const ph = (t * sp.userData.speed + sp.userData.phase) % 1;
        const f = Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 14);
        sp.material.opacity = Math.min(1, f + boost * 0.6);
        sp.scale.setScalar(0.06 + f * 0.55 + boost * 0.35);
      });
    },
    dispose() {
      geo.dispose();
      edges.geometry.dispose();
      edgeMat.dispose();
      outer.dispose();
      inner?.dispose();
      disposables.forEach((d) => d.dispose());
      sparkles.children.forEach((s) => s.material.dispose());
    },
  };
}
