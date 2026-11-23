// Teilen der Fame-Card: Instagram Story, TikTok, weitere Apps, Bild speichern.
//
// Instagram "Sharing to Stories" und das TikTok "Share Kit" sind Schnittstellen für native Apps.
// Läuft Fame in der nativen Hülle (Capacitor, siehe native/), nutzen wir sie direkt über das
// Plugin "FameShare". Im Browser gehen wir über das Teilen-Menü des Handys (Web Share API),
// dort erscheinen Instagram (Story) und TikTok als Ziel. Klappt auch das nicht, wird das Bild
// gespeichert und wir sagen, wie es weitergeht.

import { LOGO_TEXT, APP_NAME, DIA } from './ui.js';
import { GEM_COUNT, CLASSES } from './data.js';
import { facetImages, holoStrength } from './cardfx.js';

// Wohin der Link in der Story führt (Echtheits-Seite der Card). Vor dem Livegang anpassen.
export const SHARE_BASE = 'https://fame.app/card/';

const STORY_W = 1080;
const STORY_H = 1920;
import { t, isEn } from './i18n.js';

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

// Plattform-Symbole für die Card im Bild (gleiche Formen wie in der App, Raster 24 × 24)
const GLYPH = {
  tt: 'M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5 M14 3c.4 2.6 2.2 4.4 5 4.6',
  sc: 'M12 3.5c-3 0-5 2.2-5 5v2.3l-1.8.6c-.5.2-.5.8 0 1l1.6.6c-.5 1.6-1.7 2.8-3.3 3.4.4.8 1.6 1 2.6 1.2.2.6.4 1.1.9 1.1.7 0 1.5-.5 2.6-.2 1 .3 1.6 1.4 2.4 1.4s1.4-1.1 2.4-1.4c1.1-.3 1.9.2 2.6.2.5 0 .7-.5.9-1.1 1-.2 2.2-.4 2.6-1.2-1.6-.6-2.8-1.8-3.3-3.4l1.6-.6c.5-.2.5-.8 0-1l-1.8-.6V8.5c0-2.8-2-5-5-5z',
};
function drawGlyph(g, id, x, y, s, color) {
  if (!GLYPH[id] || typeof Path2D === 'undefined') { drawInstaGlyph(g, x, y, s, color); return; }
  g.save();
  g.translate(x, y);
  g.scale(s / 18, s / 18);
  g.translate(-3, -3);
  g.strokeStyle = color;
  g.lineWidth = 1.9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke(new Path2D(GLYPH[id]));
  g.restore();
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

export function drawCard(g, { x, y, w, h, tier, serial, accts = [], gem, facets }) {
  const c = tier.tone || tier.rarity.color;
  const cls = tier.cls ?? 0;
  const top = CLASSES.length - 1;
  const metal = cls >= top ? 'legend' : cls >= 7 ? 'gold' : cls >= 4 ? 'rose' : 'platinum';
  const clsColor = CLASSES[cls]?.color || c;
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

  // Samtglut + Prisma-Facetten (wie in der App, der Holo-Schimmer ist hier eingefroren)
  g.save();
  roundRect(g, ix, iy, iw, ih, r - b);
  g.clip();
  const glow = g.createRadialGradient(ix + iw / 2, iy + ih * 0.3, 0, ix + iw / 2, iy + ih * 0.3, iw * 0.75);
  glow.addColorStop(0, hexA(clsColor, 0.18 + Math.min(cls, 7) * 0.02));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(ix, iy, iw, ih);
  g.fillStyle = 'rgba(255,255,255,0.018)';
  for (let bx = ix; bx < ix + iw; bx += 3 * s) g.fillRect(bx, iy, 1 * s, ih);
  if (cls >= top && facets?.mask) {
    const hv = document.createElement('canvas');
    hv.width = Math.round(iw);
    hv.height = Math.round(ih);
    const hg = hv.getContext('2d');
    hg.drawImage(facets.mask, 0, 0, hv.width, hv.height);
    hg.globalCompositeOperation = 'source-in';
    const rb = hg.createLinearGradient(0, hv.height * 0.35, hv.width, hv.height);
    ['#ff6b6b', '#ffb347', '#fff275', '#7dff9a', '#6ad8ff', '#8f8bff', '#e78bff'].forEach((col, i, a) => rb.addColorStop(i / (a.length - 1), col));
    hg.fillStyle = rb;
    hg.fillRect(0, 0, hv.width, hv.height);
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = holoStrength(tier.cls ?? 0);
    g.drawImage(hv, ix, iy, iw, ih);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();

  // Foto des Steins randlos oben, läuft weich in den Hintergrund aus
  const photoH = 250 * s;
  if (gem) {
    const k = Math.max(iw / gem.width, photoH / gem.height);
    const gw = gem.width * k, gh = gem.height * k;
    const pv = document.createElement('canvas');
    pv.width = Math.round(iw);
    pv.height = Math.round(photoH);
    const pg = pv.getContext('2d');
    pg.drawImage(gem, (iw - gw) / 2, (photoH - gh) / 2, gw, gh);
    pg.globalCompositeOperation = 'destination-in';
    const fade = pg.createLinearGradient(0, photoH * 0.62, 0, photoH);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    pg.fillStyle = fade;
    pg.fillRect(0, 0, pv.width, pv.height);
    g.save();
    roundRect(g, ix, iy, iw, ih, r - b);
    g.clip();
    g.drawImage(pv, ix, iy, iw, photoH);
    g.restore();
  }

  // Kopfzeile über dem Foto: Logo links, Seriennummer rechts
  const pad = 16 * s;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = font(800, 19 * s);
  const lw = g.measureText(LOGO_TEXT).width;
  g.fillStyle = metalFill(g, metal, ix + pad, iy + pad, lw, 18 * s);
  g.fillText(LOGO_TEXT, ix + pad, iy + pad + 16 * s);
  drawDiamondGlyph(g, ix + pad + lw + 4 * s, iy + pad + 2 * s, 18 * s, '#050506', line);
  g.textAlign = 'right';
  g.font = font(600, 9.5 * s);
  const serialText = `${t('Nr.')} ${serial}`;
  const sw = g.measureText(serialText).width + 16 * s;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(g, ix + iw - pad - sw + 6 * s, iy + pad + 1 * s, sw, 20 * s, 10 * s);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText(serialText, ix + iw - pad - 2 * s, iy + pad + 14.5 * s);
  const gemY = iy + 42 * s, gemH = 190 * s;

  // weicher Schatten hinter Name und Spruch, damit die Schrift ruhig bleibt
  const scrimY = gemY + gemH + 40 * s;
  g.save();
  g.translate(cx, scrimY);
  g.scale(1, 0.42);
  const scrim = g.createRadialGradient(0, 0, 0, 0, 0, iw * 0.62);
  scrim.addColorStop(0, 'rgba(11,10,13,0.9)');
  scrim.addColorStop(0.62, 'rgba(11,10,13,0.6)');
  scrim.addColorStop(1, 'rgba(11,10,13,0)');
  g.fillStyle = scrim;
  g.fillRect(-iw, -iw, iw * 2, iw * 2);
  g.restore();

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
  // Accounts unten links: einer in normaler Größe, mehrere kleiner übereinander
  if (accts.length) {
    const n = accts.length;
    const fs = n > 1 ? 10 : 12, gs = n > 1 ? 11 : 13, lh = 14 * s;
    g.font = font(600, fs * s);
    g.fillStyle = '#f8f8f6';
    accts.forEach((a, i) => {
      const ly = fy - (n - 1 - i) * lh + (n > 1 ? 4 * s : 0);
      drawGlyph(g, a.id, ix + pad, ly - (gs - 2) * s, gs * s, '#f8f8f6');
      g.fillText(`@${a.handle}`, ix + pad + (gs + 5) * s, ly);
    });
  }
  const sx = ix + iw - pad - 19 * s, sy = fy - 6 * s, sr = 19 * s;
  const seal = metalFill(g, metal, sx - 20 * s, sy - 20 * s, 40 * s, 40 * s); // geprägte Münze im Metall der Klasse
  g.fillStyle = seal;
  g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b0b0c';
  g.textAlign = 'center';
  g.font = font(800, 6.5 * s);
  g.fillText(isEn ? 'REAL' : 'ECHT', sx, sy - 1 * s);
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
  data = { ...data, facets: await facetImages(data.tier.cls ?? 0) };
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

  // Freie Zonen: Instagram verdeckt oben ~250 px (Profilzeile) und unten ~300 px (Antwortfeld),
  // TikTok zusätzlich rechts die Button-Spalte (ab x ≈ 930) und unten links die Beschreibung
  // (ab y ≈ 1450). Darum: Logo und Slogan (eine Zeile) oben unter der Profilzeile, Card darunter
  // so groß, dass sie auf allen drei Plattformen frei bleibt.
  const cardW = 740, cardH = Math.round(740 * CARD_RATIO);
  const cardX = (STORY_W - cardW) / 2, cardY = 452;
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

  // Logo oben, darunter der Slogan (beides unterhalb der Profilzeile von Instagram/TikTok)
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = font(800, 64);
  const lw = g.measureText(LOGO_TEXT).width;
  const lx = STORY_W / 2 - 28;
  g.fillStyle = '#3dfa74';
  g.fillText(LOGO_TEXT, lx + 4, 323);
  g.fillStyle = '#f8f8f6';
  g.fillText(LOGO_TEXT, lx, 318);
  drawDiamondGlyph(g, lx + lw / 2 + 9, 263, 53, '#f8f8f6', '#3dfa74');
  g.font = font(800, 34);
  const s1 = t('Erst Fame, '), s2 = t('dann die anderen.');
  const w1 = g.measureText(s1).width, w2 = g.measureText(s2).width;
  const sx0 = STORY_W / 2 - (w1 + w2) / 2;
  g.textAlign = 'left';
  g.fillStyle = '#f8f8f6';
  g.fillText(s1, sx0, 398);
  g.fillStyle = '#3dfa74';
  g.fillText(s2, sx0 + w1, 398);
  g.textAlign = 'center';

  drawCard(g, { x: cardX, y: cardY, w: cardW, h: cardH, ...data });

  return cv;
}

// Nur die Card mit transparentem Rand – als Sticker für Instagram (natives Sharing to Stories).
export async function renderSticker(data) {
  await fontsReady();
  data = { ...data, facets: await facetImages(data.tier.cls ?? 0) };
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
  return t('Mein {gem} (Stufe {n}/{m}) auf {app} 💎 Nr. {serial} – erst Fame, dann die anderen. #fame #thentheothers', { gem: data.tier.name, n: data.tier.stage, m: GEM_COUNT, app: APP_NAME, serial: data.serial });
}

// withText: false = nur das Bild (Snapchat nimmt sonst manchmal den Text statt des Bildes)
async function webShare(blob, data, name, withText = true) {
  const file = new File([blob], name, { type: 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share(withText ? { files: [file], text: shareText(data), title: APP_NAME } : { files: [file] });
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
  return { how: 'manual', platform: 'ig' };
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
  return { how: 'manual', platform: 'tt' };
}

export async function shareToSnapchat(data, assets) {
  const blob = await toBlob(await assets.story());
  const r = await webShare(blob, data, 'fame-snap.png', false);
  if (r === 'shared') return { how: 'sheet' };
  if (r === 'cancelled') return { how: 'cancelled' };
  return { how: 'manual', platform: 'sc' };
}

export async function shareElsewhere(data, assets) {
  const blob = await toBlob(await assets.story());
  const r = await webShare(blob, data, 'fame-card.png');
  if (r === 'shared') return { how: 'sheet' };
  if (r === 'cancelled') return { how: 'cancelled' };
  return { how: 'manual', platform: 'more' };
}

// Speichern: Bildansicht öffnen (gedrückt halten → in Fotos sichern). Ein direkter Download
// klappt auf dem Handy und in eingebetteten Ansichten oft nicht.
export async function saveImage() {
  return { how: 'manual', platform: 'save' };
}

// ---- Profilbild mit Rahmen (Instagram, TikTok) ------------------------------------------
// Wachsender Glasbogen aus Milchglas in der Farbe der Klasse: Er beginnt links neben dem Stein
// (läuft dort schräg aus), unten sitzt der eigene Edelstein, und mit jeder erreichten Klasse
// wächst der Bogen weiter Richtung rechte Mitte. Ab Klasse 2 kommt pro Klasse ein
// Logo-Diamant in ihrer Farbe dazu. Alles liegt im Kreis, weil beide Apps rund zuschneiden.

const AVATAR = 1080;
const HOLO_RING = ['#ff9ad5', '#9fd0ff', '#fff3a8', '#b6ffd9', '#c6b6ff', '#ff9ad5'];
const RO = 99, RI = 88, RM = (RO + RI) / 2, BW = RO - RI; // Bogen ganz am Rand (Einheiten von 200)
const STEP = (Math.PI / 2 - 0.24 - 0.14) / 8;              // Abstand der Abzeichen
const TAIL = 0.72;                                          // Stück links neben dem Stein
const arcEnd = (cls) => (cls === 0 ? Math.PI / 2 - 0.3 : Math.PI / 2 - (0.24 + (cls - 1) * STEP + 0.14));

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(Math.max(0, Math.min(255, v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Regenbogen-Verlauf (konisch, sonst linear als Ersatz für ältere Browser)
function holoFill(g, cx, cy, r, alpha = 1) {
  const gr = g.createConicGradient ? g.createConicGradient(0, cx, cy) : g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  HOLO_RING.forEach((c, i) => gr.addColorStop(i / (HOLO_RING.length - 1), alpha < 1 ? hexA(c, alpha) : c));
  return gr;
}

// Weichzeichnen ohne ctx.filter (fehlt in manchen Safari-Versionen): klein rechnen und wieder vergrößern
// Ausschnitt des Fotos: view = { zoom (1 = füllt den Kreis), x, y (Verschiebung, Anteil der Bildgröße) }.
// Liefert die Zeichen-Position so, dass das Foto den Kreis immer ganz ausfüllt.
export function photoRect(photo, S, view = {}) {
  const zoom = Math.max(1, view.zoom || 1);
  const k = Math.max(S / photo.width, S / photo.height) * zoom;
  const w = photo.width * k, h = photo.height * k;
  const mx = (w - S) / 2, my = (h - S) / 2;
  const x = Math.max(-mx, Math.min(mx, (view.x || 0) * S));
  const y = Math.max(-my, Math.min(my, (view.y || 0) * S));
  return { x: (S - w) / 2 + x, y: (S - h) / 2 + y, w, h, mx: mx / S, my: my / S };
}

// Weichzeichnen ohne ctx.filter (fehlt in manchen Safari-Versionen): klein rechnen und wieder vergrößern
function softPhoto(photo, S, view) {
  const small = document.createElement('canvas');
  small.width = small.height = Math.round(S / 14);
  const r = photoRect(photo, small.width, { ...view, zoom: (view.zoom || 1) * 1.04 });
  small.getContext('2d').drawImage(photo, r.x, r.y, r.w, r.h);
  return small;
}

// Abzeichen im Design des Logo-Diamanten: Krone gefüllt, feine helle Facettenlinien, leichtes Leuchten
function logoBadge(g, x, y, r, color, holo, u) {
  const w = 2.3 * r, k = w / 48, ox = x - w / 2, oy = y - w * 0.43;
  const trace = (poly) => {
    g.beginPath();
    poly.forEach(([px, py], j) => (j ? g.lineTo(ox + px * k, oy + py * k) : g.moveTo(ox + px * k, oy + py * k)));
    g.closePath();
  };
  const fill = g.createLinearGradient(ox, oy, ox + w, oy + w);
  if (holo) HOLO_RING.forEach((c, j) => fill.addColorStop(j / (HOLO_RING.length - 1), c));
  else [[0, shade(color, 1.35)], [0.45, color], [1, shade(color, 0.85)]].forEach(([o, c]) => fill.addColorStop(o, c));
  g.save();
  g.shadowColor = hexA(holo ? '#ffffff' : color, 0.9);
  g.shadowBlur = 3 * u;
  g.fillStyle = fill;
  g.globalAlpha = 0.85;
  trace(DIA.outline); g.fill();
  g.globalAlpha = 1;
  trace(DIA.crown); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = Math.max(0.5, 1.1 * k);
  g.lineJoin = 'round';
  DIA.facets.forEach((f) => { trace(f); g.stroke(); });
  trace(DIA.outline);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1.2 * k;
  g.stroke();
}

// cls: Farbklasse (0..9), photo: geladenes Bild (wird mittig quadratisch zugeschnitten)
// gemImg (optional): freigestelltes Bild des eigenen Steins fürs Abzeichen
// view: Ausschnitt (siehe photoRect), size: Kantenlänge in Pixel (klein für die Live-Vorschau)
// Profilbild-Rahmen „Pavé-Fassung“ (V117): polierter Metallrand, Brillanten in Klassenfarbe wachsen mit der
// Klasse von unten nach oben (Mint: je 2 Steine links und rechts, Diamant-Holo: ganzer Ring), unten der eigene Stein
// in einer Krappenfassung. Metall: Silber (bis Saphir) → Roségold (Amethyst–Rubin) → Gold (Feuer, Gold) → Platin (Holo).
const AV_METALS = {
  silver: ['#ffffff', '#c9ced6', '#8a909b', '#eef1f5', '#6f7580', '#d9dde3'],
  rose: ['#fff0ea', '#f1b9a5', '#a0604f', '#ffd9cc', '#7d4436', '#e5a592'],
  gold: ['#fff7d6', '#f0cd6e', '#a5761b', '#ffe9a8', '#7a5410', '#e2b84f'],
  platinum: ['#ffffff', '#dfe3ea', '#9aa1ad', '#f7f8fb', '#7e8594', '#e9ecf2'],
};
const avMetal = (cls) => (cls >= CLASSES.length - 1 ? 'platinum' : cls >= 7 ? 'gold' : cls >= 4 ? 'rose' : 'silver');
function avMetalFill(g, x, y, metal, rot = 0) {
  const st = AV_METALS[metal];
  if (!g.createConicGradient) { const lg = g.createLinearGradient(x - 50, y - 50, x + 50, y + 50); st.forEach((c, i) => lg.addColorStop(i / (st.length - 1), c)); return lg; }
  const gr = g.createConicGradient(rot, x, y);
  for (let i = 0; i <= 12; i++) gr.addColorStop(i / 12, st[i % st.length]);
  return gr;
}
function avBrilliant(g, x, y, r, color, holo, seed) {
  g.save();
  g.translate(x, y);
  const body = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  if (holo) { body.addColorStop(0, '#ffffff'); body.addColorStop(0.5, `hsl(${(seed * 47) % 360},90%,85%)`); body.addColorStop(1, '#8b93b8'); }
  else { body.addColorStop(0, '#ffffff'); body.addColorStop(0.45, color); body.addColorStop(1, hexA('#000000', 0.55)); }
  g.fillStyle = holo ? body : color;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  if (!holo) { g.fillStyle = body; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1; }
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(0.4, r * 0.08);
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + seed; g.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.arc(-r * 0.35, -r * 0.35, r * 0.2, 0, Math.PI * 2); g.fill();
  g.restore();
}

export function renderAvatar(photo, cls, gemImg = null, view = {}, size = AVATAR) {
  const S = size, u = S / 300, C = S / 2;
  const holo = cls === CLASSES.length - 1;
  const color = holo ? '#dfe6ff' : CLASSES[cls].color;
  const metal = avMetal(cls);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const ro = C - 1 * u, ri = C - 21 * u, rm = C - 11 * u;

  // Foto rund, bis unter den Rand
  g.save();
  g.beginPath(); g.arc(C, C, ri + 1 * u, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#d9dee6';
  g.fillRect(0, 0, S, S);
  if (photo) { const r = photoRect(photo, S, view); g.drawImage(photo, r.x, r.y, r.w, r.h); }
  g.restore();

  // Polierter Metallrand
  g.beginPath(); g.arc(C, C, ro, 0, Math.PI * 2); g.arc(C, C, ri, 0, Math.PI * 2, true);
  g.fillStyle = avMetalFill(g, C, C, metal, 0.4);
  g.fill('evenodd');
  g.lineWidth = 1 * u;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(C, C, ro - 0.5 * u, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(C, C, ri + 0.5 * u, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.beginPath(); g.arc(C, C, ro - 2 * u, Math.PI * 1.05, Math.PI * 1.55); g.stroke();

  // Brillanten: je Klasse mehr, symmetrisch vom Stein unten nach oben (16 Plätze je Seite)
  const half = 16;
  const count = Math.max(1, Math.round(half * Math.max(1, cls) / (CLASSES.length - 1)));
  for (let j = 0; j < count; j++) {
    for (const side of [1, -1]) {
      const a = Math.PI / 2 + side * (0.42 + j * ((Math.PI - 0.42) / (half - 0.5)));
      avBrilliant(g, C + rm * Math.cos(a), C + rm * Math.sin(a), 6.2 * u, color, holo, j);
    }
  }

  // Eigener Stein unten in der Krappenfassung
  const r = 22 * u, bx = C, by = S - 30 * u;
  const mt = avMetalFill(g, bx, by, metal, 1);
  g.fillStyle = mt;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1 * u;
  for (const a of [-2.35, -0.8, 0.8, 2.35]) {
    g.beginPath(); g.ellipse(bx + Math.cos(a) * r * 1.02, by + Math.sin(a) * r * 1.02, r * 0.2, r * 0.14, a, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 4 * u;
  g.beginPath(); g.arc(bx, by, r * 1.08, 0, Math.PI * 2); g.fillStyle = mt; g.fill();
  g.restore();
  g.save();
  g.beginPath(); g.arc(bx, by, r * 0.94, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#050506';
  g.fillRect(bx - r, by - r, r * 2, r * 2);
  if (gemImg) {
    const box = r * 2 * 1.25, k = box / Math.max(gemImg.width, gemImg.height);
    g.drawImage(gemImg, bx - (gemImg.width * k) / 2, by - (gemImg.height * k) / 2, gemImg.width * k, gemImg.height * k);
  } else {
    drawDiamondGlyph(g, bx - 12 * u, by - 10 * u, 24 * u, 'rgba(255,255,255,0.85)', color);
  }
  g.restore();
  g.lineWidth = 1 * u;
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.beginPath(); g.arc(bx, by, r * 0.94, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  return cv;
}

export async function saveAvatar(cv, serial) {
  const blob = await toBlob(cv);
  const file = new File([blob], `fame-profilbild-${serial}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: APP_NAME });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  return 'manual';
}
