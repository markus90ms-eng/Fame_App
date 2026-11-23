// Echte Steinfotos (assets/gems/01–99.webp, je Stufe ein Stein) statt des 3D-Steins.
// photoGem() hat dieselbe Schnittstelle wie createDiamond() aus diamond3d.js, soweit die Card sie nutzt:
// pulse() beim Aufdecken, snapshot() für die Teilen-Bilder, dispose() beim Verlassen der Seite.

export const GEM_COUNT_PHOTOS = 99;
export const gemSrc = (stage) => `assets/gems/${String(Math.min(GEM_COUNT_PHOTOS, Math.max(1, stage | 0))).padStart(2, '0')}.webp`;

// Bild laden (für Canvas-Zeichnungen wie Teilen-Bild und Profilbild-Abzeichen)
export function loadGem(stage) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = gemSrc(stage);
  });
}

// Ausschnitt um den Stein als quadratisches Canvas (der Stein liegt im Foto mittig, leicht unterhalb der Mitte)
export function gemCrop(img, size = 640) {
  if (!img?.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const side = img.naturalHeight * 0.78;
  const sx = (img.naturalWidth - side) / 2, sy = img.naturalHeight * 0.52 - side / 2;
  c.getContext('2d').drawImage(img, sx, Math.max(0, sy), side, side, 0, 0, size, size);
  return c;
}

export function photoGem(container, tier) {
  container.innerHTML = `<img class="gem-photo" src="${gemSrc(tier.stage)}" alt="" decoding="async" draggable="false">`;
  const img = container.firstElementChild;
  return {
    canvas: null,
    pulse() {
      img.classList.remove('is-pulse');
      void img.offsetWidth; // Animation neu starten
      img.classList.add('is-pulse');
    },
    // Standbild in beliebiger Größe: Foto füllt die Fläche (wie object-fit: cover)
    snapshot(w, h) {
      if (!img.complete || !img.naturalWidth) return null;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
      g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return c;
    },
    cutout(size = 640) { return gemCrop(img, size); },
    ready: () => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })),
    setGem() {}, setGlow() {}, setRim() {}, setMystery() {}, setLevel() {}, setTiltPitch() {},
    dispose() { container.innerHTML = ''; },
  };
}
