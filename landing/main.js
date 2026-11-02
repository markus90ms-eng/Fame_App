// Fame – Landingpage. Animationen mit Motion (vendor/motion.js): nur transform und opacity,
// Federn statt fester Dauer, und prefers-reduced-motion wird respektiert.
(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const M = window.Motion;

  // Navigation bekommt eine Linie, sobald gescrollt wird
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Ohne Motion-Bibliothek oder bei reduzierter Bewegung bleibt alles sofort sichtbar
  if (reduce || !M) { root.classList.remove('js'); return; }

  const { animate, inView, stagger } = M;
  const spring = { type: 'spring', stiffness: 170, damping: 22 };
  const show = { opacity: 1, transform: 'translateY(0px)' };

  // Hero: Elemente nacheinander einblenden
  animate('[data-hero]', show, { ...spring, delay: stagger(0.09, { startDelay: 0.1 }) });

  // Restliche Elemente beim Reinscrollen
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    inView(el, () => { animate(el, show, spring); }, { margin: '0px 0px -12% 0px' });
  });

  // Stufenleiter: Kacheln laufen gestaffelt ein
  const ladder = document.getElementById('ladder');
  inView(ladder, () => {
    animate('#ladder li', show, { ...spring, delay: stagger(0.06) });
  }, { margin: '0px 0px -10% 0px' });

  // Podest wächst von unten
  document.querySelectorAll('.pod').forEach((pod, i) => {
    pod.style.transformOrigin = 'bottom';
    inView(pod, () => {
      animate(pod, { transform: ['scaleY(0.2)', 'scaleY(1)'], opacity: 1 }, { ...spring, delay: i * 0.1 });
    });
  });

  // Card neigt sich mit dem Zeiger (nur Desktop mit Maus)
  const card = document.getElementById('tilt');
  if (card && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const visual = card.parentElement;
    let raf = 0;
    visual.addEventListener('pointermove', (e) => {
      const r = visual.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        card.style.setProperty('--ty', `${(px * 18).toFixed(2)}deg`);
        card.style.setProperty('--tx', `${(-py * 14).toFixed(2)}deg`);
        card.style.setProperty('--sx', `${(px * 90).toFixed(1)}%`);
      });
    });
    visual.addEventListener('pointerleave', () => {
      card.style.setProperty('--tx', '0deg');
      card.style.setProperty('--ty', '0deg');
      card.style.setProperty('--sx', '-30%');
    });
  }

  // Diamanten fliegen beim Scrollen durch die Seite (Parallax: nah = schnell, weit = langsam).
  // Nur transform wird bewegt, die Ebene liegt fest über dem Inhalt und blockiert keine Klicks.
  const layer = document.createElement('div');
  layer.className = 'fly';
  layer.setAttribute('aria-hidden', 'true');
  const colors = ['#3dfa74', '#3b6bff', '#ec4899', '#ffd23f', '#38c8f8', '#a855f7', '#ff8a1f', '#5fe3c0', '#ef3a3a', '#e9e4ff'];
  const small = window.innerWidth < 720;
  // x in % der Breite, Größe in px, speed = Flug pro gescrolltem Pixel, rot = Drehung pro Pixel
  const gems = [
    { x: 4,  size: 54, speed: 0.55, rot: 0.05,  blur: 0 },
    { x: 90, size: 70, speed: 0.8,  rot: -0.06, blur: 0 },
    { x: 14, size: 28, speed: 0.3,  rot: -0.03, blur: 1.5 },
    { x: 80, size: 34, speed: 0.35, rot: 0.04,  blur: 1.5 },
    { x: 48, size: 22, speed: 0.22, rot: 0.02,  blur: 2.5 },
    { x: 95, size: 120, speed: 1.15, rot: 0.07, blur: 4 },
    { x: 1,  size: 100, speed: 1.05, rot: -0.05, blur: 4 },
    { x: 66, size: 26, speed: 0.28, rot: -0.04, blur: 2 },
    { x: 30, size: 40, speed: 0.45, rot: 0.05,  blur: 1 },
  ].filter((g) => !small || g.x <= 16 || g.x >= 78); // am Handy nur am Rand, damit kein Text verdeckt wird
  const items = gems.map((g, i) => {
    const el = document.createElement('span');
    el.className = 'fly-gem';
    el.style.cssText = `left:${g.x}%;width:${g.size}px;height:${g.size * 0.9}px;color:${colors[i % colors.length]};` + (g.blur ? `filter:blur(${g.blur}px);` : '');
    el.innerHTML = '<svg viewBox="0 0 100 90" aria-hidden="true"><use href="#gem"/></svg>';
    layer.appendChild(el);
    return { el, ...g, base: (i * 0.37 + 0.1) % 1 };
  });
  document.body.appendChild(layer);

  let ticking = false;
  const place = () => {
    ticking = false;
    const y = window.scrollY, vh = window.innerHeight;
    for (const g of items) {
      const range = vh + g.size * 2;
      // Startposition je Diamant, dann nach oben fliegen und unten wieder auftauchen
      const pos = (((g.base * range - y * g.speed) % range) + range) % range;
      g.el.style.transform = `translate3d(0, ${(pos - g.size).toFixed(1)}px, 0) rotate(${(y * g.rot).toFixed(1)}deg)`;
    }
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(place); } };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  place();
  animate(layer, { opacity: [0, 1] }, { duration: 0.8, delay: 0.6 });
})();
