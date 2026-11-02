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
})();
