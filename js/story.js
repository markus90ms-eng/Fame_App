// Hommage Stufe 30 (Mondstein): kurze Buch-Animation beim Aufdecken der Card.
// Das geschlossene Buch „Der Mondstein“ (Wilkie Collins, 1868) öffnet sich, die Kapitel blättern um,
// am Ende leuchtet der Mondstein auf. Antippen überspringt. Der Roman ist gemeinfrei.

import { isEn } from './i18n.js';

const PAGES = ['kap2', 'kap3', 'kap4'];
// Zeitplan in Millisekunden (Einband auf, drei Seiten umblättern, Lichtblitz, Ausblenden)
const T = { open: 900, flips: [2200, 3400, 4600], glow: 5500, end: 6700 };

export function playMoonStory(host, { onDone } = {}) {
  const el = document.createElement('div');
  el.className = 'story';
  el.setAttribute('aria-label', isEn ? 'The Moonstone – story' : 'Der Mondstein – Geschichte');
  el.innerHTML = `
    <div class="story-book">
      <div class="story-block"></div><div class="story-edge"></div>
      <div class="story-page story-last"><div class="story-face story-paper"><i style="background-image:url(assets/moon/epilog.jpg)"></i></div></div>
      ${PAGES.map((p, i) => `<div class="story-page" data-page style="z-index:${PAGES.length + 1 - i}"><div class="story-face story-paper"><i style="background-image:url(assets/moon/${p}.jpg)"></i></div><div class="story-face story-back"></div></div>`).join('')}
      <div class="story-page story-cover" data-cover><div class="story-face story-front">
        <div class="story-frame"></div>
        <span class="story-corner" style="left:8px;top:8px"></span><span class="story-corner" style="right:8px;top:8px"></span>
        <span class="story-corner" style="left:8px;bottom:8px"></span><span class="story-corner" style="right:8px;bottom:8px"></span>
        <div class="story-author story-gold">WILKIE COLLINS</div>
        <div class="story-emblem"></div>
        <div class="story-title story-gold">${isEn ? 'The Moonstone' : 'Der Mondstein'}</div>
        <div class="story-sub">${isEn ? 'A Novel' : 'Ein Kriminalroman'}</div>
        <div class="story-year">LONDON · MDCCCLXVIII</div>
        <div class="story-shine"></div>
      </div><div class="story-face story-back story-endpaper"></div></div>
    </div>
    <div class="story-glow"></div>
    <span class="story-skip">${isEn ? 'Tap to skip' : 'Antippen zum Überspringen'}</span>`;
  host.appendChild(el);

  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 600);
    onDone?.();
  };
  at(T.open, () => el.querySelector('[data-cover]').classList.add('is-open'));
  el.querySelectorAll('[data-page]').forEach((p, i) => at(T.flips[i], () => p.classList.add('is-flip')));
  at(T.glow, () => el.querySelector('.story-glow').classList.add('is-on'));
  at(T.end, finish);
  el.addEventListener('click', finish);
  return finish;
}
