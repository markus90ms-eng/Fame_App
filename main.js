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

  // Videos: erst beim Tippen laden und mit Ton abspielen; nur eins gleichzeitig, beim Wegscrollen Pause
  const clips = Array.from(document.querySelectorAll('.clip'));
  clips.forEach((clip) => {
    const v = clip.querySelector('video'), btn = clip.querySelector('.clip-play');
    btn.addEventListener('click', () => {
      clips.forEach((o) => { const ov = o.querySelector('video'); if (o !== clip && !ov.paused) ov.pause(); });
      v.controls = true;
      v.play().then(() => clip.classList.add('is-playing')).catch(() => { v.controls = true; });
    });
    v.addEventListener('ended', () => clip.classList.remove('is-playing'));
    new IntersectionObserver((entries) => { if (!entries[0].isIntersecting && !v.paused) v.pause(); }, { threshold: 0.2 }).observe(clip);
  });

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

  // ---- Glas-Diamanten fliegen und kippen beim Scrollen -------------------------------------
  // Jeder Stein ist echtes Glas: ein ausgeschnittener Diamant mit Backdrop-Blur (man sieht den
  // Inhalt dahinter verzerrt), weißen Glanzkanten und einem weichen Schatten. Bewegt wird nur transform.
  const layer = document.createElement('div');
  layer.className = 'fly';
  layer.setAttribute('aria-hidden', 'true');
  const small = window.innerWidth < 720;
  // x in % der Breite, Größe in px, speed = Flug pro gescrolltem Pixel, tilt = Kippfrequenz
  const gems = [
    { x: 4,  size: 64,  speed: 0.55, tilt: 0.0042, ph: 0.0 },
    { x: 90, size: 84,  speed: 0.8,  tilt: 0.0035, ph: 1.7 },
    { x: 14, size: 34,  speed: 0.3,  tilt: 0.006,  ph: 3.1 },
    { x: 80, size: 40,  speed: 0.36, tilt: 0.005,  ph: 4.4 },
    { x: 48, size: 26,  speed: 0.22, tilt: 0.007,  ph: 2.2 },
    { x: 95, size: 140, speed: 1.15, tilt: 0.0026, ph: 5.1 },
    { x: 1,  size: 120, speed: 1.05, tilt: 0.003,  ph: 0.9 },
    { x: 66, size: 30,  speed: 0.28, tilt: 0.0065, ph: 3.8 },
    { x: 30, size: 46,  speed: 0.45, tilt: 0.0048, ph: 2.9 },
  ].filter((g) => !small || g.x <= 16 || g.x >= 78); // am Handy nur am Rand, damit kein Text verdeckt wird
  const items = gems.map((g, i) => {
    const el = document.createElement('span');
    el.className = 'fly-item';
    el.style.cssText = `left:${g.x}%;width:${g.size}px;height:${(g.size * 0.9).toFixed(1)}px;`;
    el.innerHTML = '<i class="fly-shadow"></i><i class="fly-glass"></i>'
      + '<svg class="fly-facets" viewBox="0 0 100 90" aria-hidden="true">'
      // Facetten: helle und dunkle Flächen im Wechsel, so liest sich Glas auch auf Weiß
      + '<path d="M26 6L2 32h18z" fill="rgba(30,50,95,.2)"/>'
      + '<path d="M26 6L20 32h18L50 6z" fill="rgba(255,255,255,.5)"/>'
      + '<path d="M50 6L38 32h24z" fill="rgba(255,255,255,.85)"/>'
      + '<path d="M50 6l12 26h18L74 6z" fill="rgba(30,50,95,.24)"/>'
      + '<path d="M74 6l24 26H80z" fill="rgba(255,255,255,.45)"/>'
      + '<path d="M2 32h18l30 54z" fill="rgba(30,50,95,.3)"/>'
      + '<path d="M20 32h18l12 54z" fill="rgba(255,255,255,.6)"/>'
      + '<path d="M38 32h24L50 86z" fill="rgba(255,255,255,.28)"/>'
      + '<path d="M62 32h18L50 86z" fill="rgba(30,50,95,.34)"/>'
      + '<path d="M80 32h18L50 86z" fill="rgba(255,255,255,.5)"/>'
      // Kanten: innen weiß, außen eine dunkle Kontur
      + '<path d="M20 32l6-26M80 32L74 6M2 32h96M20 32l30 54 30-54M38 32l12-26 12 26M38 32l12 54 12-54" fill="none" stroke="rgba(255,255,255,.95)" stroke-width=".9" stroke-linejoin="round"/>'
      + '<path d="M26 6h48l24 26L50 86 2 32z" fill="none" stroke="rgba(20,35,70,.75)" stroke-width="1.5" stroke-linejoin="round"/>'
      + '<path d="M27.5 8.5h45L94 31.5" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="1.2" stroke-linecap="round"/>'
      + '<path d="M32 13l6 12M12 29l6-9" stroke="rgba(255,255,255,1)" stroke-width="2.2" stroke-linecap="round"/>'
      + '</svg>';
    layer.appendChild(el);
    return { el, ...g, base: (i * 0.37 + 0.1) % 1 };
  });
  document.body.appendChild(layer);

  // ---- 3D beim Scrollen: Bereiche kippen aus der Tiefe nach vorn ----------------------------------
  const depth = Array.from(document.querySelectorAll('.steps, .ladder, .split, .podium, .statement .wrap, .final-in'));
  depth.forEach((el) => el.classList.add('d3'));
  const heroVisual = document.querySelector('.hero-visual');
  const amp = small ? 0.55 : 1;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let ticking = false;
  const place = () => {
    ticking = false;
    const y = window.scrollY, vh = window.innerHeight;
    for (const g of items) {
      const range = vh + g.size * 2;
      const pos = (((g.base * range - y * g.speed) % range) + range) % range;
      // Kippen in 3D: nie ganz kantig, damit der Stein sichtbar bleibt
      const ry = Math.sin(y * g.tilt + g.ph) * 58;
      const rx = Math.cos(y * g.tilt * 0.8 + g.ph) * 24;
      const rz = Math.sin(y * g.tilt * 0.5 + g.ph) * 14;
      g.el.style.transform = `translate3d(0, ${(pos - g.size).toFixed(1)}px, 0) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`;
    }
    for (const el of depth) {
      const r = el.getBoundingClientRect();
      const t = clamp((r.top + r.height / 2 - vh / 2) / (vh * 0.65), -1, 1);
      const rx = t * 16 * amp;
      const z = -Math.abs(t) * 110 * amp;
      el.style.transform = `perspective(1100px) rotateX(${rx.toFixed(2)}deg) translateZ(${z.toFixed(1)}px)`;
    }
    if (heroVisual) {
      const s = clamp(y, 0, vh);
      heroVisual.style.transform = `perspective(900px) translate3d(0, ${(s * 0.22).toFixed(1)}px, ${(-s * 0.25).toFixed(1)}px) rotateX(${(s * 0.02).toFixed(2)}deg) rotateY(${(-s * 0.012).toFixed(2)}deg)`;
    }
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(place); } };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  place();
})();
