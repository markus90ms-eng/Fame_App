// Sound & Vibration – Loot-Sounds je Seltenheit, Ticks beim Erhöhen des Betrags.

let ctx;
let lastTick = 0;
// Ziel der Töne: normalerweise die Lautsprecher, für Musikschleifen ein eigener Regler (zum Stoppen)
let out = null;
const dest = (ac) => out || ac.destination;
// Ton aus (Schalter auf der Card-Seite), gemerkt auf dem Gerät
let muted = false;
try { muted = localStorage.getItem('fame.muted') === 'true'; } catch { /* privat */ }
export const isMuted = () => muted;
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('fame.muted', String(muted)); } catch { /* privat */ }
  if (muted) loops.forEach((l) => l.stop());
}

function audio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Handys erlauben Ton erst nach einer echten Berührung. Als Erlaubnis zählt dort erst das
// Loslassen des Fingers (touchend/pointerup/click), nicht das Aufsetzen. Wir versuchen es bei
// jeder Berührung, bis der Ton wirklich läuft, und spielen dabei einen stillen Puffer ab (iOS).
export function unlockAudio() {
  // iPhone: Web-Töne auch bei eingeschaltetem Lautlos-Schalter abspielen (Safari 17+)
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* nicht unterstützt */ }
  const events = ['touchend', 'pointerup', 'click', 'keydown'];
  const tryUnlock = () => {
    const ac = audio();
    if (!ac) return;
    try {
      const src = ac.createBufferSource();
      src.buffer = ac.createBuffer(1, 1, 22050);
      src.connect(ac.destination);
      src.start(0);
    } catch { /* ignorieren */ }
    const done = () => events.forEach((ev) => window.removeEventListener(ev, tryUnlock, true));
    if (ac.state === 'running') done();
    else ac.resume().then(() => { if (ac.state === 'running') done(); }).catch(() => {});
  };
  events.forEach((ev) => window.addEventListener(ev, tryUnlock, true));
}

// Hall für die großen Aufdeck-Sounds: künstlicher Raumklang aus abklingendem Rauschen
let verb;
function reverb() {
  const ac = audio();
  if (!ac) return null;
  if (verb) return verb;
  const len = Math.floor(ac.sampleRate * 2.6);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  verb = ac.createConvolver();
  verb.buffer = ir;
  const back = ac.createGain();
  back.gain.value = 0.55;
  verb.connect(back).connect(ac.destination);
  return verb;
}
const send = (node, amount) => {
  if (!amount) return;
  const r = reverb();
  if (!r) return;
  const g = node.context.createGain();
  g.gain.value = amount;
  node.connect(g).connect(r);
};

function tone(freq, { at = 0, dur = 0.12, vol = 0.06, type = 'sine', slideTo = null, attack = 0.005, rev = 0, detune = 0 } = {}) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(dest(ac));
  send(gain, rev);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ at = 0, dur = 0.4, vol = 0.05, from = 800, to = 4000, rev = 0, q = 1.2, peak = 0.3 } = {}) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + at;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + dur * peak);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(dest(ac));
  send(gain, rev);
  src.start(t0);
}

export function buzz(pattern = 8) {
  if (muted) return;
  try { navigator.vibrate?.(pattern); } catch { /* nicht unterstützt */ }
}

// intensity 0..1 – je höher der Betrag, desto höher der Ton.
export function tick(intensity, rising = true) {
  const now = performance.now();
  if (now - lastTick < 45) return;
  lastTick = now;
  tone(260 + intensity * 1100, { type: 'triangle', dur: 0.07, vol: rising ? 0.04 : 0.02 });
  if (rising) buzz(6 + Math.round(intensity * 14));
}

// Kurzes "Plink", wenn ein Gegenstand ins Inventar fällt.
export function plink(i = 0) {
  tone(880 + i * 180, { type: 'triangle', dur: 0.09, vol: 0.035 });
}

// Fund-Sound je Seltenheit (0 = Normal … 4 = Legendär).
export function rarityDrop(level) {
  switch (level) {
    case 0:
      tone(150, { type: 'sine', dur: 0.18, vol: 0.09, slideTo: 90 });
      noise({ dur: 0.08, vol: 0.03, from: 2000, to: 600 });
      buzz(12);
      break;
    case 1:
      [988, 1319].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.35, vol: 0.05 }));
      buzz([10, 30, 10]);
      break;
    case 2:
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.45, vol: 0.045, type: 'triangle' }));
      noise({ at: 0.05, dur: 0.5, vol: 0.015, from: 3000, to: 9000 });
      buzz([14, 30, 14, 30, 24]);
      break;
    case 3:
      [440, 523, 659, 784].forEach((f) => tone(f, { dur: 1.2, vol: 0.03, attack: 0.04 }));
      [1319, 1568, 1976, 2637].forEach((f, i) => tone(f, { at: 0.1 + i * 0.07, dur: 0.6, vol: 0.03, type: 'triangle' }));
      noise({ dur: 0.9, vol: 0.02, from: 1500, to: 8000 });
      buzz([20, 40, 20, 40, 60]);
      break;
    default:
      // Legendär: tiefer Einschlag, Rauschen und ein Glockenakkord
      tone(120, { dur: 0.7, vol: 0.14, slideTo: 38, attack: 0.01 });
      noise({ dur: 0.7, vol: 0.05, from: 300, to: 6000 });
      [523, 659, 784, 1046].forEach((f) => tone(f, { at: 0.12, dur: 1.8, vol: 0.035, attack: 0.02 }));
      [2093, 2637, 3136, 4186].forEach((f, i) => tone(f, { at: 0.25 + i * 0.08, dur: 0.7, vol: 0.02, type: 'triangle' }));
      buzz([40, 40, 40, 40, 120]);
  }
}

// Klang je Farbklasse (0 = Kiesel … 9 = Diamant-Holo): jede Klasse hat ihren eigenen Sound,
// von dumpf und kurz bis zu Einschlag, Glockenakkord und Glitzerregen.
export function classDrop(cls) {
  switch (cls) {
    case 0: // Kiesel: dumpfer Plopp
      tone(150, { dur: 0.18, vol: 0.09, slideTo: 90 });
      noise({ dur: 0.08, vol: 0.03, from: 2000, to: 600 });
      buzz(12);
      break;
    case 1: // Mint: zwei weiche, helle Töne
      [880, 1175].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.3, vol: 0.05 }));
      buzz([8, 30, 8]);
      break;
    case 2: // Aquamarin: perlend wie Wasser
      [988, 1319, 1760].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.35, vol: 0.04, type: 'triangle' }));
      noise({ at: 0.04, dur: 0.35, vol: 0.012, from: 4000, to: 9000 });
      buzz([10, 30, 10, 30]);
      break;
    case 3: // Saphir: klare Glocke
      [659, 831, 988].forEach((f) => tone(f, { dur: 1, vol: 0.035, attack: 0.02 }));
      tone(1976, { at: 0.05, dur: 0.6, vol: 0.02, type: 'triangle' });
      buzz([14, 30, 14, 30, 20]);
      break;
    case 4: // Amethyst: Arpeggio mit Schimmer
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.45, vol: 0.045, type: 'triangle' }));
      noise({ at: 0.05, dur: 0.5, vol: 0.015, from: 3000, to: 9000 });
      buzz([14, 30, 14, 30, 24]);
      break;
    case 5: // Rubellit: verspielter Akkord mit Glitzer
      [523, 659, 784].forEach((f) => tone(f, { dur: 1, vol: 0.03, attack: 0.03 }));
      [1568, 1976, 2349, 3136].forEach((f, i) => tone(f, { at: 0.08 + i * 0.06, dur: 0.4, vol: 0.025, type: 'triangle' }));
      buzz([16, 30, 16, 30, 30]);
      break;
    case 6: // Rubin: tiefer Akzent und warmer Glockenakkord
      tone(196, { dur: 0.4, vol: 0.08, slideTo: 98 });
      [440, 523, 659, 784].forEach((f) => tone(f, { at: 0.05, dur: 1.2, vol: 0.03, attack: 0.04 }));
      [1319, 1568, 1976, 2637].forEach((f, i) => tone(f, { at: 0.15 + i * 0.07, dur: 0.6, vol: 0.03, type: 'triangle' }));
      noise({ dur: 0.9, vol: 0.02, from: 1500, to: 8000 });
      buzz([20, 40, 20, 40, 60]);
      break;
    case 7: // Feuer: Einschlag mit aufsteigendem Rauschen
      tone(130, { dur: 0.6, vol: 0.12, slideTo: 45 });
      noise({ dur: 0.8, vol: 0.05, from: 200, to: 7000 });
      [587, 740, 880, 1175].forEach((f, i) => tone(f, { at: 0.15 + i * 0.08, dur: 0.5, vol: 0.04, type: 'square' }));
      buzz([30, 40, 30, 40, 90]);
      break;
    case 8: // Gold: Einschlag, großer Glockenakkord und Münzklimpern
      tone(120, { dur: 0.7, vol: 0.14, slideTo: 38, attack: 0.01 });
      noise({ dur: 0.7, vol: 0.05, from: 300, to: 6000 });
      [523, 659, 784, 1046].forEach((f) => tone(f, { at: 0.12, dur: 1.8, vol: 0.035, attack: 0.02 }));
      for (let i = 0; i < 12; i++) tone(2600 + Math.random() * 1800, { at: 0.3 + i * 0.06, dur: 0.06, vol: 0.02, type: 'triangle' });
      buzz([40, 40, 40, 40, 120]);
      break;
    default: // Diamant-Holo: Einschlag, schwebendes Arpeggio über mehrere Oktaven, Glitzerregen
      tone(110, { dur: 0.9, vol: 0.15, slideTo: 33, attack: 0.01 });
      noise({ dur: 1, vol: 0.05, from: 200, to: 9000 });
      [523, 659, 784, 988, 1175, 1568, 1976, 2349, 3136].forEach((f, i) => tone(f, { at: 0.1 + i * 0.07, dur: 1.4, vol: 0.026, attack: 0.02 }));
      for (let i = 0; i < 26; i++) tone(2400 + Math.random() * 2600, { at: 0.6 + i * 0.045, dur: 0.05, vol: 0.02, type: 'triangle' });
      buzz([50, 40, 50, 40, 160]);
  }
}

// ---- Aufdecken: Spielautomat + Loot-Fund (Novoline trifft WoW/Diablo) -----------------------

// Glocke mit unharmonischen Obertönen (wie der „Shing“ beim Loot-Fund)
function bell(f, { at = 0, dur = 2.2, vol = 0.05, rev = 0.5 } = {}) {
  [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]].forEach(([m, v]) => tone(f * m, { at, dur: dur / Math.sqrt(m), vol: vol * v, attack: 0.002, rev }));
}
// Chor-Fläche wie bei legendären Funden: verstimmte Sägezähne, weich gefiltert, langsam einblenden
function choir(freqs, { at = 0, dur = 2.6, vol = 0.018 } = {}) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + at;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.Q.value = 3;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.5);
  g.gain.setValueAtTime(vol, t0 + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  lp.connect(g).connect(dest(ac));
  send(g, 1.2);
  freqs.forEach((f) => [-9, 0, 9].forEach((d) => {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }));
}
// Tiefer Einschlag (Boom) mit Druck
function impact(vol = 0.2, at = 0) {
  tone(90, { at, dur: 0.9, vol, slideTo: 28, attack: 0.003, rev: 0.3 });
  tone(45, { at, dur: 1.2, vol: vol * 0.7, attack: 0.01 });
  noise({ at, dur: 0.35, vol: vol * 0.4, from: 2500, to: 120, peak: 0.05 });
}
// Gewinnzähler wie am Spielautomaten: schnell steigende Töne, am Ende Ding-Ding-Ding
function rollup(at, len, base = 523) {
  const steps = Math.round(len / 0.045);
  for (let i = 0; i < steps; i++) {
    const f = base * Math.pow(2, (i / steps) * 1.5);
    tone(f, { at: at + i * 0.045, dur: 0.05, vol: 0.03, type: 'square' });
  }
  const end = at + steps * 0.045;
  [0, 0.16, 0.32].forEach((d) => bell(base * 4, { at: end + d, dur: 0.9, vol: 0.05, rev: 0.25 }));
  return end + 0.5;
}

// Aufdecken je Farbklasse (0 Kiesel … 9 Holo). Unten noch kurz und freundlich, oben ein großes
// Spektakel: Einschlag, Loot-Glocke, Chor, Gewinnzähler und Münzregen.
export function classReveal(cls) {
  const k = cls / 9;
  const root = [262, 294, 330, 349, 392, 440, 466, 523, 587, 659][cls] || 523;
  impact(0.06 + k * 0.16);
  // Loot-„Shing“: heller Glockenakkord, je Klasse höher und voller
  bell(root * 2, { vol: 0.05 + k * 0.03, rev: 0.4 + k * 0.6 });
  if (cls >= 2) bell(root * 2.52, { at: 0.06, vol: 0.035, rev: 0.6 });
  if (cls >= 3) bell(root * 3, { at: 0.12, vol: 0.03, rev: 0.8 });
  // Glitzer-Schweif nach oben (WoW-Loot)
  const sparks = 4 + cls * 3;
  for (let i = 0; i < sparks; i++) tone(root * 4 * Math.pow(2, (i / sparks) * 1.3), { at: 0.1 + i * 0.035, dur: 0.18, vol: 0.016, type: 'triangle', rev: 0.6 });
  // Ab Amethyst: Chor wie bei einem legendären Fund (Diablo)
  if (cls >= 4) choir([root, root * 1.26, root * 1.5, root * 2].slice(0, cls >= 7 ? 4 : 3), { at: 0.05, dur: 2.2 + k * 1.6, vol: 0.012 + k * 0.012 });
  // Ab Rubellit: Gewinnzähler mit Ding-Ding-Ding (Spielautomat)
  let t = 0.45;
  if (cls >= 5) t = rollup(0.45, 0.3 + (cls - 5) * 0.25, root * 2);
  // Ab Feuer: zweiter Einschlag und Fanfare
  if (cls >= 7) {
    impact(0.18, t);
    [1, 1.26, 1.5, 2].forEach((m, i) => tone(root * 2 * m, { at: t + 0.05 + i * 0.09, dur: 0.5, vol: 0.04, type: 'square', rev: 0.4 }));
    [1, 1.26, 1.5, 2].forEach((m) => tone(root * 2 * m, { at: t + 0.45, dur: 1.4, vol: 0.025, type: 'sawtooth', attack: 0.02, rev: 0.8 }));
  }
  // Gold und Holo: Münzregen
  if (cls >= 8) for (let i = 0; i < 18 + (cls - 8) * 16; i++) tone(2400 + Math.random() * 2600, { at: t + 0.3 + i * 0.04, dur: 0.07, vol: 0.02, type: 'triangle', rev: 0.3 });
  buzz(cls >= 7 ? [60, 40, 60, 40, 200] : cls >= 4 ? [40, 40, 40, 40, 120] : [30, 40, 60]);
}

export function fanfare() {
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.22, vol: 0.05, type: 'square' }));
  buzz([30, 50, 30, 50, 80]);
}

// Nach dem Antippen der verdeckten Card: Sog nach oben (Trommelwirbel, der immer schneller wird,
// Herzschlag, Rauschen, Töne ziehen hoch). Gibt die Dauer zurück: 1,9–2,9 s je nach Stärke.
export function buildup(level) {
  const ac = audio();
  const dur = 1.9 + level * 0.25;
  if (!ac) return dur;
  for (let t = 0, i = 0; t < dur; i++) {
    const p = t / dur;
    noise({ at: t, dur: 0.05, vol: 0.03 + p * 0.07, from: 1800, to: 900, q: 1.5, peak: 0.1 });
    t += 0.12 - p * 0.095;
  }
  for (let h = 0; h < dur; h += 0.5 - (h / dur) * 0.28) {
    tone(70, { at: h, dur: 0.16, vol: 0.14, slideTo: 45 });
    tone(62, { at: h + 0.14, dur: 0.14, vol: 0.09, slideTo: 40 });
  }
  noise({ dur: dur + 0.05, vol: 0.06, from: 300, to: 10000, peak: 0.97, rev: 0.4 });
  tone(220, { dur: dur, vol: 0.03, slideTo: 1760, type: 'sawtooth', attack: dur * 0.85, rev: 0.3 });
  tone(330, { dur: dur, vol: 0.02, slideTo: 2640, type: 'sawtooth', attack: dur * 0.85 });
  buzz(Array.from({ length: 12 }, (_, k) => (k % 2 ? 50 - k * 3 : 10)));
  return dur;
}

// Gewinn beim Aufdecken: Fund-Sound der Stufe, ab "Diamant" ein Gewinn-Jingle, beim
// perfekten Diamanten zusätzlich ein Münzregen.
export function reveal(level) {
  rarityDrop(level);
  if (level >= 2) {
    const scale = [523, 659, 784, 1046, 1318, 1568];
    for (let r = 0; r < level - 1; r++) {
      scale.forEach((f, i) => tone(f, { at: 0.25 + r * 0.36 + i * 0.05, dur: 0.12, vol: 0.035, type: 'square' }));
    }
  }
  if (level >= 4) {
    for (let i = 0; i < 26; i++) tone(2400 + Math.random() * 2400, { at: 0.5 + i * 0.045, dur: 0.05, vol: 0.02, type: 'triangle' });
  }
}

// Neuer Edelstein beim Schieben: kurzer Kristall-Ton, je höher die Stufe, desto heller.
export function stageTick(stage, up = true) {
  const now = performance.now();
  if (now - lastTick < 60) return;
  lastTick = now;
  const f = 520 * Math.pow(2, stage / 36);
  tone(f, { type: 'sine', dur: 0.18, vol: up ? 0.05 : 0.03 });
  tone(f * 1.5, { at: 0.04, type: 'sine', dur: 0.16, vol: up ? 0.03 : 0.015 });
  if (up) buzz(10);
}

// ---- Musik auf der Card-Seite --------------------------------------------------------------
// Solange die Card verdeckt ist, läuft eine Spannungsschleife in der Klasse der Card. Nach dem
// Aufdecken folgt der Fund-Sound, dann läuft eine Gewinn-Schleife, solange die Seite offen ist.
// Schon die unteren Klassen klingen kräftig (boost); nach oben kommt immer mehr dazu.

export const boost = (cls) => Math.min(9, Math.round(3 + cls * 0.67));

const semi = (f, n) => f * Math.pow(2, n / 12);
const ROOT = [196, 208, 220, 233, 247, 262, 277, 294, 311, 330]; // jede Klasse eine eigene Tonart
// Ein Takt der Spannungsschleife. Jede Klasse hat ihre Tonart und ihr Tempo; die Stärke beginnt
// bei Kiesel schon bei 3 (mitreißend) und steigt bis 9, mit jeder Stufe kommt eine Schicht dazu.
function loopBar(t0, bar, cls) {
  const key = cls;
  cls = Math.min(9, 3 + key * 0.67);
  const bpm = 104 + key * 3;
  const beat = 60 / bpm;
  const r = ROOT[key];
  const prog = cls >= 4 ? [0, -2, 0, -4] : [0, 0, -2, 0];
  const root = semi(r, prog[bar % 4]);
  const minor = [0, 3, 7, 12];
  const penta = [0, 3, 5, 7, 10, 12];
  // Herzschlag – immer da
  [0, 2].forEach((b) => {
    tone(root / 4, { at: t0 + b * beat, dur: 0.22, vol: 0.12 + cls * 0.006, slideTo: root / 6, attack: 0.004 });
    tone(root / 4, { at: t0 + b * beat + 0.2, dur: 0.18, vol: 0.08, slideTo: root / 6, attack: 0.004 });
  });
  // Uhr-Ticken – leise, immer da
  for (let b = 0; b < 4; b++) noise({ at: t0 + b * beat, dur: 0.025, vol: 0.025, from: b % 2 ? 2600 : 3400, to: 1500, q: 8, peak: 0.05 });
  // ab Stärke 1: helle, luftige Zupfer
  if (cls >= 1) for (let k = 0; k < 4; k++) tone(semi(root * 4, penta[(bar * 4 + k * 3) % penta.length]), { at: t0 + (k + 0.5) * beat, dur: 0.25, vol: 0.012, type: 'triangle', rev: 0.6 });
  // ab Stärke 2: perlendes Arpeggio
  if (cls >= 2) for (let s16 = 0; s16 < 16; s16 += cls >= 5 ? 1 : 2) {
    tone(semi(root * 2, minor[(s16 / (cls >= 5 ? 1 : 2)) % 4] + (s16 >= 8 && cls >= 5 ? 12 : 0)), { at: t0 + s16 * beat / 4, dur: 0.09, vol: 0.009 + cls * 0.0006, type: cls >= 3 ? 'square' : 'triangle', rev: 0.4 });
  }
  // ab Stärke 3 (Kiesel): Glocke am Taktanfang
  if (cls >= 3) bell(semi(root * 4, 7), { at: t0, dur: 1.4, vol: 0.016, rev: 0.7 });
  // ab Stärke 4: dunkle Chor-Fläche
  if (cls >= 4) choir([root / 2, semi(root / 2, 3), semi(root / 2, 7)], { at: t0, dur: beat * 4 + 0.3, vol: 0.004 + cls * 0.0006 });
  // ab Stärke 5: Hi-Hats auf allen Achteln, Arpeggio doppelt so schnell
  if (cls >= 5) for (let e = 0; e < 8; e++) noise({ at: t0 + e * beat / 2, dur: 0.025, vol: e % 2 ? 0.014 : 0.022, from: 8000, to: 6000, q: 3, peak: 0.1 });
  // ab Stärke 6: tiefe Trommeln
  if (cls >= 6) [1.5, 3, 3.5].forEach((b) => tone(semi(root / 2, -12), { at: t0 + b * beat, dur: 0.25, vol: 0.09, slideTo: root / 8, attack: 0.003 }));
  // ab Stärke 7: flirrende Streicher, die über 4 Takte steigen, dazu Knistern
  if (cls >= 7) {
    const lift = bar % 4;
    for (let k = 0; k < 32; k++) tone(semi(root * 2, (k % 2 ? 7 : 0) + lift), { at: t0 + k * beat / 8, dur: 0.06, vol: 0.004 + (k / 32) * 0.006, type: 'sawtooth', rev: 0.4 });
    for (let k = 0; k < 6; k++) noise({ at: t0 + Math.random() * beat * 4, dur: 0.02, vol: 0.015, from: 5000, to: 2000, q: 2, peak: 0.1 });
  }
  // ab Stärke 8: Münz-Glitzern und Bläser-Stich auf Schlag 4
  if (cls >= 8) {
    for (let k = 0; k < 6; k++) tone(2600 + Math.random() * 1600, { at: t0 + Math.random() * beat * 4, dur: 0.06, vol: 0.01, type: 'triangle', rev: 0.4 });
    [0, 4, 7].forEach((n) => tone(semi(root * 2, n), { at: t0 + 3 * beat, dur: 0.25, vol: 0.016, type: 'sawtooth', attack: 0.01, rev: 0.4 }));
  }
  // Stärke 9 (Diamant-Holo): schwebendes Arpeggio über mehrere Oktaven und Sternenstaub
  if (cls >= 9) {
    [0, 7, 12, 16, 19, 24, 28, 31].forEach((n, i) => tone(semi(root * 2, n), { at: t0 + i * beat / 2, dur: 0.5, vol: 0.008, rev: 1 }));
    for (let k = 0; k < 10; k++) tone(3000 + Math.random() * 3000, { at: t0 + Math.random() * beat * 4, dur: 0.05, vol: 0.008, type: 'triangle', rev: 0.8 });
  }
  // jeder 4. Takt: Lauf nach oben, der die Schleife neu anheizt (in allen Stufen)
  if (bar % 4 === 3) {
    for (let k = 0; k < 8; k++) tone(semi(root * 2, [0, 3, 7, 10, 12, 15, 19, 24][k]), { at: t0 + 2 * beat + k * beat / 4, dur: 0.1, vol: 0.016, type: 'square', rev: 0.35 });
    noise({ at: t0 + 2 * beat, dur: beat * 2, vol: 0.03, from: 600, to: 8000, peak: 0.95, rev: 0.3 });
  }
  return beat * 4;
}

// Nachklang nach dem Aufdecken: Gewinn-Melodie wie am Automaten, Münzen zählen hoch, Glitzer.
// Je höher die Klasse, desto länger und voller. Startet, wenn der Fund-Sound abklingt.
function winTail(cls, at = 1.4) {
  const ac = audio();
  if (!ac) return;
  const k = cls / 9;
  const root = [262, 294, 330, 349, 392, 440, 466, 523, 587, 659][cls] || 523;
  const riff = [0, 4, 7, 12, 7, 12, 16, 19, 16, 12, 7, 4, 7, 12, 16, 24]; // Halbtöne über dem Grundton
  const len = 1.6 + k * 3.4; // 1,6 s bis 5 s
  const step = 0.11;
  const n = Math.floor(len / step);
  for (let i = 0; i < n; i++) {
    const t = at + i * step;
    const fade = 1 - i / n;
    const f = root * 2 * Math.pow(2, riff[i % riff.length] / 12);
    tone(f, { at: t, dur: 0.09, vol: 0.035 * fade + 0.004, type: 'square', rev: 0.25 });
    if (cls >= 3 && i % 2 === 0) tone(f * 2, { at: t + 0.02, dur: 0.07, vol: 0.012 * fade, type: 'triangle', rev: 0.4 });
    // Münzzähler: schnelle Ticks dazwischen
    if (cls >= 2) tone(2200 + (i % 4) * 180, { at: t + step / 2, dur: 0.03, vol: 0.012 * fade, type: 'triangle' });
    // Bass auf jedem 4. Schlag
    if (i % 4 === 0) tone(root / 2, { at: t, dur: 0.18, vol: 0.06 * fade, attack: 0.003 });
  }
  // Glitzerregen, der ausklingt
  for (let i = 0; i < 8 + cls * 4; i++) {
    tone(2600 + Math.random() * 2400, { at: at + Math.random() * len, dur: 0.08, vol: 0.012, type: 'triangle', rev: 0.6 });
  }
  // Schluss-Akkord
  [1, 1.26, 1.5, 2].forEach((m) => tone(root * 2 * m, { at: at + len, dur: 1.6, vol: 0.022, attack: 0.01, rev: 0.8 }));
}

// Ein Takt der Gewinn-Schleife: Melodie wie am Automaten, Bass, Münzzähler, ab und zu Glitzer
function winBar(t0, bar, cls) {
  const k = cls / 9;
  const root = [262, 294, 330, 349, 392, 440, 466, 523, 587, 659][cls] || 523;
  const riffs = [[0, 4, 7, 12, 7, 12, 16, 19], [16, 12, 7, 4, 7, 12, 16, 24], [5, 9, 12, 17, 12, 9, 5, 12], [7, 11, 14, 19, 14, 19, 23, 26]];
  const riff = riffs[bar % 4];
  const step = 0.14;
  riff.forEach((n, i) => {
    const t = t0 + i * step * 2;
    const f = root * 2 * Math.pow(2, n / 12);
    tone(f, { at: t, dur: 0.12, vol: 0.02, type: 'square', rev: 0.3 });
    if (cls >= 4) tone(f * 2, { at: t + 0.03, dur: 0.08, vol: 0.007, type: 'triangle', rev: 0.5 });
    tone(2200 + (i % 4) * 180, { at: t + step, dur: 0.03, vol: 0.008, type: 'triangle' });
    if (i % 2 === 0) tone(root / 2 * Math.pow(2, riff[0] / 12), { at: t, dur: 0.2, vol: 0.045, attack: 0.003 });
  });
  for (let i = 0; i < 2 + Math.round(k * 5); i++) tone(2600 + Math.random() * 2400, { at: t0 + Math.random() * step * 16, dur: 0.07, vol: 0.008, type: 'triangle', rev: 0.6 });
  if (bar % 4 === 3) [1, 1.26, 1.5, 2].forEach((m) => tone(root * m, { at: t0, dur: step * 16, vol: 0.008, attack: 0.3, rev: 0.6 }));
  return step * 16;
}

// Schleifen-Planer: plant immer den nächsten Takt kurz im Voraus, über einen eigenen Regler,
// damit die Musik beim Stoppen sanft ausblendet.
const loops = new Set();
function startLoop(barFn, cls, delay = 0) {
  const ac = audio();
  if (!ac) return () => {};
  const gain = ac.createGain();
  gain.connect(ac.destination);
  let next = ac.currentTime + delay, bar = 0, stopped = false;
  const plan = () => {
    if (stopped || muted) return;
    while (next - ac.currentTime < 0.35) {
      const prev = out;
      out = gain;
      next += barFn(Math.max(0, next - ac.currentTime), bar++, cls);
      out = prev;
    }
  };
  const timer = setInterval(plan, 120);
  plan();
  const h = {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      loops.delete(h);
      const t = ac.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.4);
      setTimeout(() => gain.disconnect(), 800);
    },
  };
  loops.add(h);
  return () => h.stop();
}

// Verdeckte Card: Spannungsschleife, bis getippt wird. Gibt eine Stopp-Funktion zurück.
export const startTension = (cls) => startLoop(loopBar, cls);

// Aufdecken: Fund-Sound, Nachklang und danach die Gewinn-Schleife. Gibt eine Stopp-Funktion zurück.
export function revealMusic(cls) {
  const e = boost(cls);
  classReveal(e);
  const at = e >= 7 ? 2.2 : 1.4;
  winTail(e, at);
  const len = 1.6 + (e / 9) * 3.4;
  return startLoop(winBar, e, at + len + 1.2);
}

// Card schon aufgedeckt (Seite erneut geöffnet): gleich die Gewinn-Schleife
export const startCelebration = (cls) => startLoop(winBar, boost(cls), 0.3);
