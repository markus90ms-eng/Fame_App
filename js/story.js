// Hommage Stufe 30 (Mondstein): kurze Buch-Animation beim Aufdecken der Card.
// Das geschlossene Buch „Der Mondstein“ (Wilkie Collins, 1868) öffnet sich, die Kapitel blättern um,
// am Ende leuchtet der Mondstein auf. Antippen überspringt. Der Roman ist gemeinfrei.
//
// Für flüssigen Ablauf auf dem Handy:
// - alle Bilder werden vorab geladen und dekodiert (keine leeren oder weißen Seiten)
// - jede Seite ist eine einzige Ebene ohne Rückseite: ab der Hälfte des Umblätterns ist sie
//   unsichtbar und gibt die darunterliegende Seite frei
// - Animationen laufen über die Web Animations API mit transform/opacity (Grafikkarte)
// - solange das Buch offen ist, pausieren der 3D-Stein und die Funken dahinter (Klasse story-on)

import { isEn } from './i18n.js';
import { storySound } from './fx.js';

const IMAGES = ['kap2', 'kap3', 'kap4', 'epilog'].map((n) => `assets/moon/${n}.jpg`);
const TIME = { cover: 1100, flip: 850, hold: 850, epilog: 1500 };

function preload(urls, max = 2500) {
  const all = Promise.all(urls.map((src) => {
    const img = new Image();
    img.src = src;
    return (img.decode ? img.decode() : new Promise((r) => { img.onload = r; })).catch(() => {});
  }));
  return Promise.race([all, new Promise((r) => setTimeout(r, max))]);
}

export function playMoonStory(host, { onDone } = {}) {
  const root = document.documentElement;
  const el = document.createElement('div');
  el.className = 'story';
  el.setAttribute('aria-label', isEn ? 'The Moonstone – story' : 'Der Mondstein – Geschichte');
  // Reihenfolge im DOM = Stapel: unten der Epilog, oben das erste Kapitel, ganz oben der Einband
  el.innerHTML = `
    <div class="story-book">
      ${IMAGES.slice().reverse().map((src) => `<div class="story-sheet" style="background-image:url(${src})"><i class="story-dim"></i></div>`).join('')}
      <div class="story-sheet story-cover">
        <div class="story-frame"></div>
        <span class="story-corner" style="left:8px;top:8px"></span><span class="story-corner" style="right:8px;top:8px"></span>
        <span class="story-corner" style="left:8px;bottom:8px"></span><span class="story-corner" style="right:8px;bottom:8px"></span>
        <div class="story-author story-gold">WILKIE COLLINS</div>
        <div class="story-emblem"></div>
        <div class="story-title story-gold">${isEn ? 'The Moonstone' : 'Der Mondstein'}</div>
        <div class="story-sub">${isEn ? 'A Novel' : 'Ein Kriminalroman'}</div>
        <div class="story-year">LONDON · MDCCCLXVIII</div>
        <div class="story-shine"></div>
      </div>
    </div>
    <div class="story-glow"></div>
    <span class="story-skip">${isEn ? 'Tap to skip' : 'Antippen zum Überspringen'}</span>`;
  host.appendChild(el);
  root.classList.add('story-on');

  let done = false;
  const anims = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const finish = () => {
    if (done) return;
    done = true;
    anims.forEach((a) => { try { a.cancel(); } catch { /* schon fertig */ } });
    root.classList.remove('story-on');
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease', fill: 'forwards' })
      .finished.then(() => el.remove(), () => el.remove());
    onDone?.();
  };
  el.addEventListener('click', finish);

  // Seite umblättern: dreht sich um den linken Rand; die Seite darunter wird dabei heller
  const flip = (sheet, ms) => {
    const below = sheet.previousElementSibling?.querySelector('.story-dim');
    if (below) anims.push(below.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }));
    const a = sheet.animate([
      { transform: 'perspective(1400px) rotateY(0deg)', filter: 'brightness(1)' },
      { transform: 'perspective(1400px) rotateY(-60deg) translateZ(20px)', filter: 'brightness(.75)', offset: 0.45 },
      { transform: 'perspective(1400px) rotateY(-100deg)', filter: 'brightness(.5)' },
    ], { duration: ms, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
    anims.push(a);
    return a.finished.then(() => sheet.remove(), () => {});
  };

  (async () => {
    // Buch erscheint, Glanz läuft über den Einband – währenddessen die Bilder laden
    const book = el.querySelector('.story-book');
    anims.push(book.animate([{ opacity: 0, transform: 'translateY(16px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'ease-out', fill: 'both' }));
    await Promise.all([preload(IMAGES), wait(TIME.cover)]);
    if (done) return;
    const sheets = [...el.querySelectorAll('.story-sheet')].reverse(); // Einband, Kap. 2, 3, 4
    for (let i = 0; i < sheets.length - 1; i++) {
      storySound(i === 0 ? 'cover' : 'page');
      await flip(sheets[i], i === 0 ? TIME.flip + 150 : TIME.flip);
      if (done) return;
      if (i < sheets.length - 2) await wait(TIME.hold);
      if (done) return;
    }
    await wait(TIME.epilog);
    if (done) return;
    storySound('glow');
    const glow = el.querySelector('.story-glow');
    await glow.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.05)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(.6)', offset: 0.3 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)' },
    ], { duration: 1100, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
    finish();
  })();
  return finish;
}
