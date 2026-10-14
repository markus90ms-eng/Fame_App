// Fame Stufe 14 — eigene Voxel-/Kristallwand vor dem ORIGINALEN Card-Reveal.
// Benutzt ausschließlich die bereits vorhandenen Fame-Assets: stone.png und pick.png.
// Keine fremden Grafiken, Sounds oder Schriften. Das Modul berührt weder den Card-Renderer
// noch die gespeicherten Card-Daten.
//
// Ablauf (ohne harten Schnitt): drei Hackenschläge mit Rissen, Staub und Licht, das durch die Risse
// dringt; dann bricht die Wand von der Mitte nach außen auf. Schon in diesem Moment startet das
// Aufdecken der Card (onComplete) – die Brocken fliegen noch über die aufleuchtende Card hinweg.

import { caveSound } from './fx.js';

const COLS = 8, ROWS = 10;

export function mineStage14Wall(screen, { onImpact = () => {}, onComplete = () => {} } = {}) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const layer = document.createElement('div');
  layer.className = 'cave-break';
  layer.setAttribute('aria-hidden', 'true');

  // Steinblöcke; die Wand bricht von der Aufschlagstelle (Mitte) nach außen auf.
  const cx = (COLS - 1) / 2, cy = 4.2;
  const blocks = Array.from({ length: COLS * ROWS }, (_, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = col - cx, y = row - cy;
    const dist = Math.hypot(x, y * 0.8);
    const r = (i * 37 + 11) % 31;
    return `<i class="cave-break__block" style="--dx:${Math.round(x * (55 + r))}px;--dy:${Math.round(y * 34 - 40 - (r % 9) * 4)}px;--fall:${Math.round(260 + (r % 13) * 22)}px;--dz:${120 + ((i * 17) % 160)}px;--rot:${(x >= 0 ? 1 : -1) * (40 + r * 3)}deg;--delay:${Math.round(dist * 55)}ms"></i>`;
  }).join('');

  layer.innerHTML = `<div class="cave-break__wall">${blocks}</div>
    <div class="cave-break__glow"></div>
    <svg class="cave-break__fracture" viewBox="0 0 400 740" preserveAspectRatio="none" aria-hidden="true">
      <path d="M205 315l-27 38 36 32-32 43 28 27-35 52 24 26"/>
      <path d="M205 315l43-34 22 44 55-11 30 29m-141 42 54 12 26 43 42 8"/>
      <path d="M182 428l-47-7-31 32-41-12m147 14 42 65-16 43 37 36m-74-92-38 49-27 18"/>
    </svg>
    <div class="cave-break__dust"></div>
    <i class="cave-break__pick"></i>
    <div class="cave-break__flash"></div>`;
  screen.appendChild(layer);

  const timers = [];
  let cancelled = false;
  const after = (ms, fn) => timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));
  const dispose = () => {
    if (cancelled) return;
    cancelled = true;
    timers.forEach(clearTimeout);
    layer.remove();
  };

  // Staub: kleine Pixelbrocken rieseln an der Aufschlagstelle herab
  const dust = (n, spread) => {
    const host = layer.querySelector('.cave-break__dust');
    for (let k = 0; k < n; k++) {
      const d = document.createElement('i');
      const s = 3 + Math.round(Math.random() * 4);
      d.style.cssText = `--x:${Math.round((Math.random() - 0.5) * spread)}px;--y:${Math.round(-20 - Math.random() * 40)}px;--fall:${Math.round(90 + Math.random() * 140)}px;width:${s}px;height:${s}px;animation-delay:${Math.round(Math.random() * 90)}ms`;
      host.appendChild(d);
      setTimeout(() => d.remove(), 1400);
    }
  };

  const breakWall = () => {
    layer.classList.add('cave-break--shatter');
    caveSound('break');
    onImpact(4);
    dust(40, 260);
    // Card-Reveal startet sofort, während die Brocken noch fliegen
    onComplete();
    after(1900, () => { cancelled = true; timers.forEach(clearTimeout); layer.remove(); });
  };

  if (reduced) {
    layer.classList.add('cave-break--impact-3');
    after(150, breakWall);
    return dispose;
  }

  const HITS = [430, 960, 1490];
  after(40, () => layer.classList.add('cave-break--swing'));
  HITS.forEach((t, i) => {
    after(t - 260, () => caveSound('swing'));
    after(t, () => {
      layer.classList.add(`cave-break--impact-${i + 1}`);
      layer.classList.remove('cave-break--shake');
      void layer.offsetWidth; // Schütteln neu starten
      layer.classList.add('cave-break--shake');
      caveSound('hit', i);
      onImpact(i + 1);
      dust(10 + i * 8, 90 + i * 50);
    });
  });
  after(1820, breakWall);
  return dispose;
}
