// Fame Stufe 14 — eigene Voxel-/Kristallwand vor dem ORIGINALEN Card-Reveal.
// Benutzt ausschließlich die bereits vorhandenen Fame-Assets: stone.png,
// crystals-top/bottom.png, pick.png und gem.png. Keine externen Materialien.
// Das Modul berührt weder den Card-Renderer noch die gespeicherten Card-Daten.

export function mineStage14Wall(screen, { onImpact = () => {}, onComplete = () => {} } = {}) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const layer = document.createElement('div');
  layer.className = 'cave-break';
  layer.setAttribute('aria-hidden', 'true');

  // Individuelle Original-Steinblöcke — konsistente Koordinaten, kein Zufall.
  // 8 x 10 Blöcke geben der Wand ein scharfes, dreidimensionales Voxelraster.
  const blocks = Array.from({ length: 80 }, (_, index) => {
    const column = index % 8;
    const row = Math.floor(index / 8);
    const x = column - 3.5;
    const y = row - 4.5;
    const r = (index * 37 + 11) % 31;
    const delay = (index * 23) % 210;
    return '<i class="cave-break__block" style="'
      + '--dx:' + Math.round(x * (75 + r)) + ';'
      + '--dy:' + Math.round(y * (72 + (r % 13))) + ';'
      + '--dz:' + (48 + ((index * 17) % 130)) + ';'
      + '--rot:' + (x > 0 ? 1 : -1) * (26 + r) + 'deg;'
      + '--delay:' + delay + 'ms"></i>';
  }).join('');

  layer.innerHTML = '<div class="cave-break__opening"></div>'
    + '<div class="cave-break__light"></div>'
    + '<div class="cave-break__gem"></div>'
    + '<div class="cave-break__wall">' + blocks + '</div>'
    + '<svg class="cave-break__fracture" viewBox="0 0 400 740" preserveAspectRatio="none" aria-hidden="true">'
    + '<path d="M205 315l-27 38 36 32-32 43 28 27-35 52 24 26"/>'
    + '<path d="M205 315l43-34 22 44 55-11 30 29m-141 42 54 12 26 43 42 8"/>'
    + '<path d="M182 428l-47-7-31 32-41-12m147 14 42 65-16 43 37 36m-74-92-38 49-27 18"/>'
    + '</svg>'
    + '<i class="cave-break__pick"></i>';

  screen.appendChild(layer);

  const timers = [];
  let cancelled = false;
  const after = (time, callback) => {
    const id = window.setTimeout(() => { if (!cancelled) callback(); }, time);
    timers.push(id);
  };

  const dispose = () => {
    if (cancelled) return;
    cancelled = true;
    timers.forEach((id) => clearTimeout(id));
    layer.remove();
  };
  const complete = () => {
    if (cancelled) return;
    dispose();
    onComplete();
  };

  // Kürzere, nicht blinkende Animation bei reduziertem Bewegungswunsch.
  if (reduced) {
    layer.classList.add('cave-break--impact-1', 'cave-break--impact-2', 'cave-break--impact-3');
    after(100, () => layer.classList.add('cave-break--shatter'));
    after(460, complete);
    return dispose;
  }

  // Drei Spitzhackenschläge im Rhythmus der Swing-Animation:
  // sichtbare Risse, violettes Licht, dann kollabieren die Original-Steinblöcke.
  after(60, () => layer.classList.add('cave-break--swing'));
  [405, 925, 1445].forEach((time, index) => {
    after(time, () => {
      layer.classList.add('cave-break--impact-' + (index + 1));
      onImpact(index + 1);
    });
  });
  after(1735, () => {
    layer.classList.add('cave-break--shatter');
    onImpact(4);
  });
  after(2470, () => layer.classList.add('cave-break--finish'));
  after(2770, complete);
  return dispose;
}
