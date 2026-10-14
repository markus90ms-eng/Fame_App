// Hommage Stufe 30 (Mondstein): kurze Buch-Animation beim Aufdecken der Card.
// Das geschlossene Buch „Der Mondstein“ (Wilkie Collins, 1868) öffnet sich, die Kapitel blättern um,
// am Ende leuchtet der Mondstein auf. Antippen überspringt. Der Roman ist gemeinfrei.

import { isEn } from './i18n.js';
import { storySound } from './fx.js';

const PAGES = ['kap2', 'kap3', 'kap4'];
// Wie lange jede Szene stehen bleibt (ms). Jeder Schritt startet erst, wenn der vorige wirklich fertig ist –
// so fehlt auf langsamen Handys kein Kapitel.
const HOLD = { cover: 700, page: 900, epilog: 1500, glow: 900 };

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

  let done = false;
  let timer = 0;
  const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });
  // auf das Ende einer CSS-Animation warten (mit Sicherheitsgrenze)
  const animate = (node, cls, max) => new Promise((r) => {
    const end = (e) => {
      if (e && e.target !== node) return; // nur die eigene Animation, nicht die von Elementen darin
      clearTimeout(t); node.removeEventListener('animationend', end); r();
    };
    const t = setTimeout(end, max);
    node.addEventListener('animationend', end);
    node.classList.add(cls);
  });
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 600);
    onDone?.();
  };
  el.addEventListener('click', finish);
  (async () => {
    await wait(HOLD.cover);
    if (done) return;
    storySound('cover');
    await animate(el.querySelector('[data-cover]'), 'is-open', 2500);
    for (const p of el.querySelectorAll('[data-page]')) {
      await wait(HOLD.page);
      if (done) return;
      storySound('page');
      await animate(p, 'is-flip', 2000);
    }
    await wait(HOLD.epilog);
    if (done) return;
    storySound('glow');
    await animate(el.querySelector('.story-glow'), 'is-on', 2000);
    await wait(HOLD.glow / 3);
    finish();
  })();
  return finish;
}
