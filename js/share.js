// Teilen der Fame-Card: Instagram Story, TikTok, weitere Apps, Bild speichern.
//
// Instagram "Sharing to Stories" und das TikTok "Share Kit" sind Schnittstellen für native Apps.
// Läuft Fame in der nativen Hülle (Capacitor, siehe native/), nutzen wir sie direkt über das
// Plugin "FameShare". Im Browser gehen wir über das Teilen-Menü des Handys (Web Share API),
// dort erscheinen Instagram (Story) und TikTok als Ziel. Klappt auch das nicht, wird das Bild
// gespeichert und wir sagen, wie es weitergeht.

import { LOGO_TEXT, APP_NAME, DIA } from './ui.js';
import { GEM_COUNT } from './data.js';

// Wohin der Link in der Story führt (Echtheits-Seite der Card). Vor dem Livegang anpassen.
export const SHARE_BASE = 'https://fame.app/card/';

const STORY_W = 1080;
const STORY_H = 1920;
const FONT = '"Source Code Pro", ui-monospace, monospace';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const font = (w, s, style = '') => `${style} ${w} ${s}px ${FONT}`;

// ---- Zeichen-Helfer ------------------------------------------------------------------

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Metall-Verlauf des Rahmens: Gold, Roségold, Platin – bei Legenden ein Holo-Schimmer.
const METALS = {
  gold: ['#7a5a14', '#f7dc8a', '#b8892c', '#fff3c4', '#a47a26', '#e9c76a'],
  rose: ['#7e4536', '#f6c2b0', '#b9735e', '#ffe4da', '#9a5a48', '#e9a892'],
  platinum: ['#6f7780', '#e9eef3', '#9aa3ad', '#ffffff', '#7c858f', '#dfe5ec'],
  legend: ['#ffd6ec', '#9fd8ff', '#fff4c2', '#ff9ad0', '#c6b6ff', '#b6fff0'],
};
const METAL_LINE = { gold: '#d8b95e', rose: '#e8a894', platinum: '#c9d2dc', legend: '#f5d2ea' };

function metalFill(g, metal, x, y, w, h) {
  const cols = METALS[metal] || METALS.platinum;
  if (metal === 'legend' && g.createConicGradient) {
    const grd = g.createConicGradient(0, x + w / 2, y + h / 2);
    [...cols, cols[0]].forEach((c, i) => grd.addColorStop(i / cols.length, c));
    return grd;
  }
  const grd = g.createLinearGradient(x, y, x + w, y + h);
  cols.forEach((c, i) => grd.addColorStop(i / (cols.length - 1), c));
  return grd;
}

function drawInstaGlyph(g, x, y, s, color) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = s * 0.1;
  roundRect(g, x, y, s, s, s * 0.3);
  g.stroke();
  g.beginPath();
  g.arc(x + s / 2, y + s / 2, s * 0.22, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x + s * 0.76, y + s * 0.24, s * 0.06, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawDiamondGlyph(g, x, y, s, line, fill) {
  // gleiche Form wie das Logo-Icon (48x40-Box)
  const k = s / 48;
  const trace = (poly) => {
    g.beginPath();
    poly.forEach(([px, py], i) => (i ? g.lineTo(x + px * k, y + py * k) : g.moveTo(x + px * k, y + py * k)));
    g.closePath();
  };
  g.save();
  g.fillStyle = fill;
  trace(DIA.crown);
  g.fill();
  g.strokeStyle = line;
  g.lineWidth = 2.6 * k;
  g.lineJoin = 'round';
  DIA.facets.forEach((f) => { trace(f); g.stroke(); });
  g.restore();
}

// ---- Die Card selbst (gleicher Look wie in der App) --------------------------------------

export function drawCard(g, { x, y, w, h, tier, serial, insta, gem }) {
  const c = tier.tone || tier.rarity.color;
  const metal = tier.metal || 'platinum';
  const line = METAL_LINE[metal];
  const s = w / 300; // Maßstab bezogen auf die 300px breite Card in der App
  const r = 18 * s;
  const cx = x + w / 2;

  // Leuchten in der Steinfarbe
  g.save();
  g.shadowColor = hexA(c, 0.55);
  g.shadowBlur = (tier.legend ? 70 : 45) * s;
  g.fillStyle = '#000';
  roundRect(g, x, y, w, h, r);
  g.fill();
  g.restore();

  // Metallrahmen
  g.fillStyle = metalFill(g, metal, x, y, w, h);
  roundRect(g, x, y, w, h, r);
  g.fill();

  // Innenfläche: tiefes Schwarz
  const b = 3 * s;
  const ix = x + b, iy = y + b, iw = w - 2 * b, ih = h - 2 * b;
  g.fillStyle = '#0b0a0d';
  roundRect(g, ix, iy, iw, ih, r - b);
  g.fill();

  // Foto des Steins randlos oben, läuft weich ins Schwarz aus
  const photoH = 250 * s;
  if (gem) {
    const k = Math.max(iw / gem.width, photoH / gem.height);
    const gw = gem.width * k, gh = gem.height * k;
    g.save();
    roundRect(g, ix, iy, iw, ih, r - b);
    g.clip();
    g.drawImage(gem, cx - gw / 2, iy + (photoH - gh) / 2, gw, gh);
    const fade = g.createLinearGradient(0, iy + photoH * 0.62, 0, iy + photoH);
    fade.addColorStop(0, 'rgba(11,10,13,0)');
    fade.addColorStop(1, 'rgba(11,10,13,1)');
    g.fillStyle = fade;
    g.fillRect(ix, iy + photoH * 0.62, iw, photoH * 0.38 + 1);
    g.restore();
  }

  // Kopfzeile über dem Foto: Logo links, Seriennummer rechts
  const pad = 16 * s;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = font(800, 19 * s);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 8 * s;
  g.fillStyle = '#3dfa74';
  g.fillText(LOGO_TEXT, ix + pad + 1 * s, iy + pad + 17.5 * s);
  g.restore();
  g.fillStyle = '#f8f8f6';
  g.fillText(LOGO_TEXT, ix + pad, iy + pad + 16 * s);
  const lw = g.measureText(LOGO_TEXT).width;
  drawDiamondGlyph(g, ix + pad + lw + 4 * s, iy + pad + 2 * s, 18 * s, '#f8f8f6', '#3dfa74');
  g.textAlign = 'right';
  g.font = font(600, 9.5 * s);
  const serialText = `Nr. ${serial}`;
  const sw = g.measureText(serialText).width + 16 * s;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(g, ix + iw - pad - sw + 6 * s, iy + pad + 1 * s, sw, 20 * s, 10 * s);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText(serialText, ix + iw - pad - 2 * s, iy + pad + 14.5 * s);
  const gemY = iy + 42 * s, gemH = 190 * s;

  // Schild: Name in Serifenschrift mit Metall-Verlauf, Zierlinie, Spruch
  let ty = gemY + gemH + 34 * s;
  g.textAlign = 'center';
  let size = 31;
  g.font = `700 ${size * s}px ${SERIF}`;
  while (g.measureText(tier.name).width > iw - 30 * s && size > 18) { size -= 1; g.font = `700 ${size * s}px ${SERIF}`; }
  g.save();
  g.shadowColor = hexA(c, 0.6);
  g.shadowBlur = 14 * s;
  const tw = g.measureText(tier.name).width;
  g.fillStyle = metalFill(g, metal, cx - tw / 2, ty - size * s, tw, size * s);
  g.fillText(tier.name, cx, ty);
  g.restore();
  ty += 14 * s;
  g.strokeStyle = line;
  g.lineWidth = 1 * s;
  g.beginPath(); g.moveTo(cx - 90 * s, ty); g.lineTo(cx - 12 * s, ty); g.moveTo(cx + 12 * s, ty); g.lineTo(cx + 90 * s, ty); g.stroke();
  drawDiamondGlyph(g, cx - 7 * s, ty - 5 * s, 14 * s, line, c);
  ty += 22 * s;
  // Spruch: bei Bedarf auf zwei Zeilen umbrechen, damit er nicht über den Rand läuft
  g.font = `italic 500 ${16 * s}px ${SERIF}`;
  g.fillStyle = '#e2dccd';
  const maxW = iw - 36 * s;
  const words = tier.flavor.split(' ');
  const lines = [''];
  for (const w of words) {
    const test = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
    if (g.measureText(test).width > maxW && lines[lines.length - 1]) lines.push(w);
    else lines[lines.length - 1] = test;
  }
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, cx, ty + i * 19 * s));

  // Fuß: Instagram links, Echtheitssiegel rechts
  const fy = iy + ih - 26 * s;
  g.textAlign = 'left';
  if (insta) {
    g.font = font(600, 12 * s);
    drawInstaGlyph(g, ix + pad, fy - 11 * s, 13 * s, '#f8f8f6');
    g.fillStyle = '#f8f8f6';
    g.fillText(`@${insta}`, ix + pad + 19 * s, fy);
  }
  const sx = ix + iw - pad - 19 * s, sy = fy - 6 * s, sr = 19 * s;
  const seal = g.createConicGradient ? g.createConicGradient(0.5, sx, sy) : '#e8e8f0';
  if (seal.addColorStop) ['#ffd6ec', '#9fd8ff', '#fff4c2', '#b6fff0', '#ffd6ec'].forEach((col, i) => seal.addColorStop(i / 4, col));
  g.fillStyle = seal;
  g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b0b0c';
  g.textAlign = 'center';
  g.font = font(800, 6.5 * s);
  g.fillText('ECHT', sx, sy - 1 * s);
  g.fillText(LOGO_TEXT, sx, sy + 7 * s);
  g.textAlign = 'left';

  // diagonaler Glanz über allem
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  const sheen = g.createLinearGradient(x, y, x + w, y + h);
  sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.42, 'rgba(255,255,255,0.09)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(x, y, w, h);
  g.restore();
}

export const CARD_RATIO = 1.3; // Höhe zu Breite der Card

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts?.load(`800 40px ${FONT}`),
      document.fonts?.load(`italic 500 20px ${FONT}`),
      document.fonts?.load(`600 20px ${FONT}`),
      document.fonts?.load(`700 30px ${SERIF}`),
      document.fonts?.load(`italic 500 16px ${SERIF}`),
    ]);
  } catch { /* Ersatzschrift */ }
}

// ---- Story-Bild 9:16 (Instagram Story, TikTok-Foto, Status) ----------------------------
// Oben ~14 % und unten ~20 % überdecken Instagram/TikTok mit Bedienelementen – dort steht nichts Wichtiges.

export async function renderStory(data) {
  await fontsReady();
  const { tier } = data;
  const c = tier.tone || tier.rarity.color;
  const cv = document.createElement('canvas');
  cv.width = STORY_W;
  cv.height = STORY_H;
  const g = cv.getContext('2d');

  // Hintergrund: oben Stufenfarbe, unten schwarz
  const bg = g.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, hexA(c, 1));
  bg.addColorStop(0.08, '#141416');
  bg.addColorStop(1, '#070708');
  g.fillStyle = '#070708';
  g.fillRect(0, 0, STORY_W, STORY_H);
  g.globalAlpha = 0.55;
  g.fillStyle = bg;
  g.fillRect(0, 0, STORY_W, STORY_H);
  g.globalAlpha = 1;

  const cardW = 780, cardH = Math.round(780 * CARD_RATIO);
  const cardX = (STORY_W - cardW) / 2, cardY = 330;
  const ccx = STORY_W / 2, ccy = cardY + cardH * 0.4;

  // Strahlenkranz + Licht hinter der Card
  g.save();
  g.translate(ccx, ccy);
  g.globalAlpha = 0.06 + tier.level * 0.03;
  g.fillStyle = c;
  for (let i = 0; i < 28; i++) {
    g.rotate((Math.PI * 2) / 28);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-45, -1500);
    g.lineTo(45, -1500);
    g.fill();
  }
  g.restore();
  const halo = g.createRadialGradient(ccx, ccy, 50, ccx, ccy, 900);
  halo.addColorStop(0, hexA(c, 0.45));
  halo.addColorStop(1, hexA(c, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, STORY_W, STORY_H);

  // Funken
  let seed = data.serial.split('').reduce((a, ch) => a + ch.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 60 + tier.level * 20; i++) {
    const px = rnd() * STORY_W, py = 250 + rnd() * 1450, pr = 1.5 + rnd() * 4;
    g.fillStyle = hexA(i % 4 ? c : '#ffffff', 0.15 + rnd() * 0.6);
    g.beginPath();
    g.arc(px, py, pr, 0, Math.PI * 2);
    g.fill();
  }

  // Logo oben
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = font(800, 76);
  const lw = g.measureText(LOGO_TEXT).width;
  const lx = STORY_W / 2 - 34;
  g.fillStyle = '#3dfa74';
  g.fillText(LOGO_TEXT, lx + 5, 286);
  g.fillStyle = '#f8f8f6';
  g.fillText(LOGO_TEXT, lx, 280);
  drawDiamondGlyph(g, lx + lw / 2 + 10, 216, 64, '#f8f8f6', '#3dfa74');

  drawCard(g, { x: cardX, y: cardY, w: cardW, h: cardH, ...data });

  // Botschaft unter der Card
  g.textAlign = 'center';
  g.font = font(800, 46);
  g.fillStyle = '#f8f8f6';
  g.fillText('Erst Fame,', STORY_W / 2, cardY + cardH + 92);
  g.fillStyle = '#3dfa74';
  g.fillText('dann die anderen.', STORY_W / 2, cardY + cardH + 148);
  g.font = font(500, 26);
  g.fillStyle = 'rgba(248,248,246,0.6)';
  g.fillText(`${APP_NAME} · then the others`, STORY_W / 2, cardY + cardH + 196);
  return cv;
}

// Nur die Card mit transparentem Rand – als Sticker für Instagram (natives Sharing to Stories).
export async function renderSticker(data) {
  await fontsReady();
  const w = 900, pad = 90;
  const cv = document.createElement('canvas');
  cv.width = w + pad * 2;
  cv.height = Math.round(w * CARD_RATIO) + pad * 2;
  drawCard(cv.getContext('2d'), { x: pad, y: pad, w, h: Math.round(w * CARD_RATIO), ...data });
  return cv;
}

const toBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));
const toBase64 = (cv) => cv.toDataURL('image/png').split(',')[1];

// ---- Native Brücke (Capacitor-Plugin "FameShare", siehe native/README.md) ---------------

function nativeShare() {
  return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.FameShare : null;
}

// ---- Teilen ---------------------------------------------------------------------------------

export function shareText(data) {
  return `Mein ${data.tier.name} (Stufe ${data.tier.stage}/${GEM_COUNT}) auf ${APP_NAME} 💎 Nr. ${data.serial} – erst Fame, dann die anderen. #fame #thentheothers`;
}

async function webShare(blob, data, name) {
  const file = new File([blob], name, { type: 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], text: shareText(data), title: APP_NAME });
    return 'shared';
  } catch (err) {
    return err?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Ergebnis: { how: 'native' | 'sheet' | 'saved' | 'cancelled', hint?: string }
export async function shareToInstagramStory(data, assets) {
  const native = nativeShare();
  if (native) {
    const sticker = await assets.sticker();
    await native.instagramStory({
      stickerImage: toBase64(sticker),
      backgroundTopColor: data.tier.tone || data.tier.rarity.color,
      backgroundBottomColor: '#070708',
      contentUrl: SHARE_BASE + data.serial,
    });
    return { how: 'native' };
  }
  const blob = await toBlob(await assets.story());
  const r = await webShare(blob, data, 'fame-story.png');
  if (r === 'shared') return { how: 'sheet' };
  if (r === 'cancelled') return { how: 'cancelled' };
  download(blob, 'fame-story.png');
  return { how: 'saved', hint: 'Story-Bild gespeichert. In Instagram: Story → Bild aus der Galerie wählen.' };
}

export async function shareToTikTok(data, assets) {
  const story = await assets.story();
  const native = nativeShare();
  if (native) {
    await native.tiktok({ image: toBase64(story) });
    return { how: 'native' };
  }
  const blob = await toBlob(story);
  const r = await webShare(blob, data, 'fame-tiktok.png');
  if (r === 'shared') return { how: 'sheet' };
  if (r === 'cancelled') return { how: 'cancelled' };
  download(blob, 'fame-tiktok.png');
  return { how: 'saved', hint: 'Bild gespeichert. In TikTok: + → Hochladen → Foto wählen.' };
}

export async function shareElsewhere(data, assets) {
  const blob = await toBlob(await assets.story());
  const r = await webShare(blob, data, 'fame-card.png');
  if (r === 'shared') return { how: 'sheet' };
  if (r === 'cancelled') return { how: 'cancelled' };
  download(blob, 'fame-card.png');
  return { how: 'saved', hint: 'Bild gespeichert.' };
}

export async function saveImage(data, assets) {
  download(await toBlob(await assets.story()), `fame-${data.serial}.png`);
  return { how: 'saved', hint: 'Story-Bild gespeichert.' };
}
