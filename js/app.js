// Fame – App-Shell, Router und Screens.

import {
  TIERS, GEM_COUNT, RARITIES, CLASSES, classFor, PIN_FROM, COUNTRIES, countryById, tierFor, nextTier, fmt, money,
  amountFromPos, posFromAmount, standings, groupTotals, makeSerial, lookupSerial, normalizeSerial, sampleSerial,
  MAX_AMOUNT, MIN_AMOUNT, CURRENCY, PLATFORMS, normalizeUser, mainAccount, cardAccounts, HOME_COUNTRY, regionName,
} from './data.js';
import { t, isEn, lang, LANGS, setLang } from './i18n.js';
import {
  APP_NAME, LOGO_TEXT, DIA, esc, logo, logoInline, hl, hero, button, backButton, diamondSvg,
  diamondShadowed, icons, platformIcon,
} from './ui.js';
import { tick, plink, stageTick, classDrop, buzz, unlockAudio, buildup, boost, startTension, revealMusic, startCelebration, themeReveal, themeLoop, themeJingle, isMuted, setMuted } from './fx.js';
import { createDiamond } from './diamond3d.js';
import { facetArt, facetMask, svgUrl, holoStrength } from './cardfx.js';
import { particles } from './particles.js';
import { isReady, connectRedirect, finishRedirect } from './connect.js';
import * as auth from './auth.js';
import {
  renderStory, renderSticker, shareToInstagramStory, shareToTikTok, shareToSnapchat, shareElsewhere, saveImage, renderAvatar, saveAvatar, photoRect,
} from './share.js';

// ---- Zustand (lokal gespeichert, bis ein Backend existiert) -----------------

const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('fame.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem('fame.' + key, JSON.stringify(value)); } catch { /* privat/blockiert */ }
  },
  remove(key) {
    try { localStorage.removeItem('fame.' + key); } catch { /* privat/blockiert */ }
  },
};

// Konto: Summe aller Einzahlungen. Jede Einzahlung stellt eine neue Fame-Card mit Seriennummer aus.
function loadAccount() {
  const acc = store.get('account');
  if (acc && Array.isArray(acc.deposits)) return acc;
  const old = store.get('donation'); // Stand aus der ersten Version übernehmen
  return old?.amount
    ? { total: old.amount, deposits: [{ amount: old.amount, at: old.at || Date.now() }], cards: [] }
    : { total: 0, deposits: [], cards: [] };
}

// Angemeldet ist, wer eine Supabase-Sitzung hat. Das Profil wird lokal zwischengespeichert, damit die
// App sofort (auch offline) startet; die Wahrheit liegt in der Tabelle "profiles".
const state = {
  user: auth.hasStoredSession() ? normalizeUser(store.get('user')) : null, // { accounts, verified, onCard, main, insta, ranking, done }
  session: null,                      // { id, email, provider } sobald die Sitzung geprüft ist
  regDraft: store.get('regdraft') || { accounts: {}, verified: {}, onCard: [] }, // Accounts beim Registrieren
  amount: store.get('amount', 100),   // gewählter Einzahlungsbetrag
  accepted: false,
  account: loadAccount(),
  after: null,                        // Ziel nach dem Login (z. B. zurück zum Einzahlen)
  rankView: {},                       // gewähltes Land/Bundesland im Ranking
};

// Profil und Konto speichern: lokal sofort, in Supabase kurz danach (gebündelt)
let syncTimer = 0;
function syncProfile() {
  if (!state.session || !state.user) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const r = await auth.saveProfile(state.session.id, { user: state.user, account: state.account });
    if (r.error) console.warn('Profil nicht gespeichert:', r.error);
  }, 600);
}
const saveAccount = () => { store.set('account', state.account); syncProfile(); };
function saveUser(u = state.user) {
  state.user = normalizeUser(u);
  store.set('user', state.user);
  syncProfile();
}
const saveDraft = () => store.set('regdraft', state.regDraft);

// Version (gleich wie der Cache-Name in sw.js) – klein unten auf der Startseite, zum Prüfen von Updates
export const APP_VERSION = '71';

// ---- Router -----------------------------------------------------------------

const app = document.getElementById('app');
let cleanup = null;

const routes = {
  '': splash,
  'intro/1': introStory,
  'intro/2': introStory,
  'intro/3': introStory,
  login: login,
  register: register,
  confirm: confirmPage,
  reset: resetPage,
  finish: finishPage,
  accounts: accountsPage,
  donate: donate,
  card: card,
  check: () => checkPage(''),
  terms: terms,
  ranking: () => rankingPage(state.user?.ranking?.region || state.user?.region ? 'region' : 'country'),
  'ranking/region': () => rankingPage('region'),
  'ranking/country': () => rankingPage('country'),
};

export const go = (path) => { location.hash = '#/' + path; };

// Ab Klasse Gold (500.000) bzw. Diamant-Holo (1 Mio.) bekommt die ganze App den Schwarz-Gold-Look
// mit Kristallglas. Drei Stufen haben stattdessen einen eigenen Hommage-Look (siehe HOMAGE).
// Nicht auf den Seiten vor dem Login.
const PLAIN = /^(intro\/|login|register|confirm|reset)/;
// Hommagen: Kristallhöhle (Amethyst), Neon-Nacht im Diamantenviertel (Black Opal), Tiefsee (Hope-Diamant)
const HOMAGE = { 14: 'cave', 76: 'neon', 98: 'ocean' };
// Stufe der zuletzt aufgedeckten Card: Ein Hommage-Thema erscheint erst, wenn die Card umgedreht
// wurde – sonst würde es verraten, welcher Stein unter der verdeckten Card liegt.
function shownStage() {
  const c = [...(state.account.cards || [])].reverse().find((x) => x.revealed !== false);
  if (!c) return 0;
  return c.stage || TIERS.find((x) => x.id === c.tier)?.stage || tierFor(c.total || 0).stage;
}
function luxClass() {
  if (!state.user || !state.account.total) return {};
  const stage = shownStage();
  if (HOMAGE[stage]) return { lux: 'holo', hom: HOMAGE[stage], stage };
  const cls = classFor(state.account.total);
  return cls >= 8 ? { lux: cls === 9 ? 'holo' : 'gold' } : {};
}
function luxify(el, path) {
  const { lux = '', hom = '', stage } = PLAIN.test(path) ? {} : luxClass();
  document.documentElement.dataset.lux = hom || lux;
  // alten Look entfernen (wichtig beim Umdrehen einer Card: dann wechselt das Thema sofort)
  el.classList.remove('lux', 'lux--gold', 'lux--holo', 'hom', ...[...el.classList].filter((c) => c.startsWith('hom--')));
  if (!lux) return;
  el.classList.add('lux', `lux--${lux}`);
  if (hom) {
    el.classList.add('hom', `hom--${hom}`);
    if (el.classList.contains('screen--welcome')) homDecor(el, hom, stage);
  }
  luxTilt();
}

// Deko der Startseite je Hommage – alles selbst gezeichnet, keine fremden Logos, Figuren oder Bilder
function homDecor(el, hom, stage) {
  const vault = el.querySelector('.welcome-vault');
  const logoBox = el.querySelector('.splash-logo');
  const add = (host, html) => host?.insertAdjacentHTML('beforeend', html);
  if (hom === 'cave') {
    add(el, `<div class="hom-achv" aria-hidden="true"><i></i><span><b>${t('Erfolg erzielt!')}</b>${t('Amethyst gefunden')}</span></div>
      <div class="hom-hotbar" aria-hidden="true"><span class="i-pick"></span><span class="sel i-gem"></span><span class="i-torch"></span>${'<span></span>'.repeat(6)}</div>`);
    add(vault, `<i class="hom-torch hom-torch--l" aria-hidden="true"></i><i class="hom-torch hom-torch--r" aria-hidden="true"></i>
      <i class="hom-pick" aria-hidden="true"></i><div class="hom-xp" aria-hidden="true"><i></i><b>${stage}</b></div>`);
  } else if (hom === 'neon') {
    add(el, '<span class="hom-neon hom-neon--top" aria-hidden="true">★ 47TH STREET · DIAMOND DISTRICT ★</span>');
    add(vault, `<div class="hom-cosmos" aria-hidden="true"></div>
      <span class="hom-neon hom-neon--a" aria-hidden="true">DIAMONDS</span><span class="hom-neon hom-neon--b" aria-hidden="true">WE BUY GOLD</span>
      <svg class="hom-fish" viewBox="0 0 96 52" aria-hidden="true"><path d="M8 26C20 6 56 2 74 22L92 8 88 26l4 18-18-14C56 50 20 46 8 26Z" fill="#8fa3ad" stroke="#334" stroke-width="1.5"/><path d="M8 26C20 6 56 2 74 22 56 14 30 14 8 26Z" fill="#b8c8d0"/><circle cx="20" cy="22" r="3" fill="#111"/><ellipse cx="44" cy="30" rx="11" ry="7" fill="#0c0e14"/><ellipse cx="41" cy="28" rx="3" ry="2" fill="#ff5fd2"/><ellipse cx="47" cy="31" rx="3" ry="2" fill="#35f0ff"/><ellipse cx="44" cy="33" rx="2.5" ry="1.5" fill="#9dff7a"/><ellipse cx="49" cy="27" rx="2" ry="1.4" fill="#ffb347"/></svg>
      <i class="hom-ball" aria-hidden="true"></i>
      <div class="hom-slip" aria-hidden="true"><b>PARLAY · 3 LEGS</b>WIN ✓<br>WIN ✓<br>OVER 1.5 …<br><s>ALL IN</s></div>
      <span class="hom-buzz" aria-hidden="true">BUZZ TO ENTER</span>`);
  } else if (hom === 'ocean') {
    add(el, `<div class="hom-water" aria-hidden="true"></div><div class="hom-stars" aria-hidden="true"></div>
      ${[[30, 52, 10, 0], [70, 47, 6, 2], [82, 60, 14, 4], [14, 66, 7, 1], [60, 30, 5, 3], [88, 22, 9, 5], [8, 35, 5, 6]]
    .map(([x, y, z, d]) => `<i class="hom-bubble" style="left:${x}%;top:${y}%;width:${z}px;height:${z}px;--d:${d}s" aria-hidden="true"></i>`).join('')}`);
    add(logoBox, `<svg class="hom-heart" viewBox="-37 -10 74 110" aria-hidden="true"><path d="M0 0v22" stroke="#e8eef6" stroke-width="1.4" stroke-dasharray="2 2"/><g transform="translate(0 54)"><path d="M0 22C-28 4-26-22-12-24-5-25 0-19 0-14c0-5 5-11 12-10 14 2 16 28-12 46Z" fill="#1d4fb8" stroke="#e8eef6" stroke-width="2.4"/><path d="M0 18-14-8 0-14 14-8ZM-14-8 0 4 14-8M0 4v14" fill="none" stroke="#8fc0ff" stroke-width=".8"/>${
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        const x = Math.sin(a) * 16 * Math.sqrt(Math.abs(Math.sin(a))) * 1.2;
        const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 1.25 - 2;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="#fff"/>`;
      }).join('')}</g></svg>`);
    add(vault, `<svg class="hom-bow" viewBox="0 0 150 110" aria-hidden="true"><path d="M0 46h118l28-6-18 64H0Z" fill="#081628" stroke="#9fc8ee"/><path d="M0 46h118l28-6M0 38h116l26-5" fill="none" stroke="#cfe6ff"/>${
      Array.from({ length: 13 }, (_, i) => `<path d="M${4 + i * 9.5} 38v8" stroke="#cfe6ff" stroke-width=".7"/>`).join('')
    }<g fill="#081628" stroke="#e8f3ff" stroke-width="1.1" stroke-linecap="round"><circle cx="128" cy="14" r="3"/><path d="M128 17v14m0-10-14-5m14 5 14-5m-14 15-3 9m3-9 3 9" fill="none"/><circle cx="121" cy="19" r="2.7"/><path d="M121 22v12m0-9-11-3m11 3 11-3m-11 12-2 6m2-6 2 6" fill="none"/></g></svg>
      <svg class="hom-berg" viewBox="0 0 96 70" aria-hidden="true"><path d="M8 70 30 22l12 12L56 6l18 34 14 30Z" fill="#dff1ff" fill-opacity=".85"/><path d="M56 6l6 64h26L74 40Z" fill="#9fc8ee" fill-opacity=".7"/></svg>`);
  }
}

// Glas schimmert je nachdem, wie man das Handy hält: Neigung -> --lx / --ly (-1 … 1) auf <html>
let tiltOn = false;
function luxTilt() {
  if (tiltOn) return;
  tiltOn = true;
  const root = document.documentElement.style;
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const step = () => {
    x += (tx - x) * 0.12; y += (ty - y) * 0.12;
    root.setProperty('--lx', x.toFixed(3)); root.setProperty('--ly', y.toFixed(3));
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
  };
  const aim = (nx, ny) => { tx = Math.max(-1, Math.min(1, nx)); ty = Math.max(-1, Math.min(1, ny)); raf ||= requestAnimationFrame(step); };
  window.addEventListener('deviceorientation', (e) => { if (e.gamma != null) aim(e.gamma / 30, (e.beta - 45) / 30); });
  // Ohne Lagesensor (Computer): dem Finger bzw. der Maus folgen
  window.addEventListener('pointermove', (e) => aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
  // iPhone: Bewegungssensor erst nach einer Berührung freigeben
  const ask = () => { window.DeviceOrientationEvent?.requestPermission?.().catch(() => {}); };
  window.addEventListener('pointerup', ask, { once: true });
}

function render() {
  const path = location.hash.replace(/^#\/?/, '');
  const screen = routes[path] || (path.startsWith('check/') ? () => checkPage(decodeURIComponent(path.slice(6))) : splash);
  cleanup?.();
  cleanup = null;
  const { html, mount } = screen();
  app.innerHTML = html;
  const el = app.firstElementChild;
  luxify(el, path);
  el.classList.add('is-entering');
  requestAnimationFrame(() => el.classList.remove('is-entering'));
  app.scrollTop = 0;
  cleanup = mount?.(el) || null;
}

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go],[data-back]');
  if (!t) return;
  if (t.hasAttribute('data-back')) {
    if (history.length > 1) history.back(); else go('');
  } else {
    go(t.getAttribute('data-go'));
  }
});

window.addEventListener('hashchange', render);
unlockAudio();

// ---- Kleine Helfer ----------------------------------------------------------

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 400);
  }, 2600);
}

const firstName = (name) => (name || '').trim().split(/\s+/)[0];
// Anzeigename: der Haupt-Account (Insta, TikTok oder Snapchat), sonst ein alter Vorname
const displayName = (u) => u?.insta || firstName(u?.name) || '';
const platformName = (id) => PLATFORMS.find((p) => p.id === id)?.name || id;
const cleanHandle = (h) => (h || '').trim().replace(/^@+/, '').replace(/\s+/g, '');
// Preisspanne einer Stufe: vom Mindestbetrag bis kurz vor die nächste Stufe
const priceRange = (g) => { const next = TIERS.find((x) => x.stage === g.stage + 1); return next ? `${money(g.min)} – ${money(next.min - 1)}` : t('ab {x}', { x: money(g.min) }); };
const shortMoney = (n) => (isEn
  ? (n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M` : n >= 10_000 ? `$${fmt(Math.round(n / 1000))}K` : money(n))
  : n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio. €`
    : n >= 10_000 ? `${fmt(Math.round(n / 1000))} Tsd. €` : money(n));

// Mittelpunkt eines Elements relativ zu einem Canvas (für Funken-Explosionen).
function centerIn(canvas, el) {
  const a = canvas.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return [b.left + b.width / 2 - a.left, b.top + b.height / 2 - a.top];
}

// Stufen aller bisher aufgedeckten Edelsteine.
function collectedStages() {
  return new Set((state.account.cards || []).filter((c) => c.stage && c.revealed !== false).map((c) => c.stage));
}

// Das eigene Konto als Eintrag fürs Ranking.
function meEntry() {
  const u = state.user;
  if (!u || !state.account.total || !u.ranking?.joined) return null;
  const pid = isLinked(u, u.ranking.platform) ? u.ranking.platform : linkedIds(u).find((id) => u.onCard?.includes(id)) || linkedIds(u)[0] || '';
  return {
    handle: u.accounts?.[pid] || displayName(u) || t('du'),
    platform: pid,
    amount: state.account.total,
    country: u.ranking.country || u.country || HOME_COUNTRY,
    region: u.ranking.region || u.region || '',
  };
}

// ---- Screens ----------------------------------------------------------------

// Testphase: alles auf diesem Gerät löschen und wieder bei 0 € anfangen
const hasData = () => !!(state.user || state.account.total || state.account.cards?.length);
const resetLink = () => (hasData() ? `<button class="link welcome-reset" type="button" data-reset>${t('Alles zurücksetzen')}</button>` : '');
function bindReset(el) {
  // Eigene Rückfrage statt confirm(): in eingebetteten Ansichten werden Browser-Dialoge oft blockiert
  let armed = 0;
  el.querySelector('[data-reset]')?.addEventListener('click', (e) => {
    const link = e.currentTarget;
    if (Date.now() - armed > 4000) {
      armed = Date.now();
      link.textContent = t('Wirklich alles löschen? Nochmal tippen');
      link.classList.add('is-armed');
      buzz(20);
      setTimeout(() => {
        if (Date.now() - armed >= 4000) { link.textContent = t('Alles zurücksetzen'); link.classList.remove('is-armed'); }
      }, 4100);
      return;
    }
    ['account', 'amount', 'donation'].forEach((k) => store.remove(k));
    if (!state.user) { store.remove('user'); store.remove('regdraft'); state.regDraft = { accounts: {}, verified: {}, onCard: [] }; }
    state.account = { total: 0, deposits: [], cards: [] };
    saveAccount();
    state.amount = 100;
    state.accepted = false;
    toast(t('Alles zurückgesetzt – du startest wieder bei {x}.', { x: money(0) }));
    render();
  });
}

// Echtheits-Siegel (Startseite, Code prüfen)
const SEAL_TXT = isEn ? 'REAL<br>FAM€' : 'ECHT<br>FAM€';
const SEAL = `<span class="seal" aria-hidden="true">${SEAL_TXT}</span>`;

// Sprache umschalten – nur auf der Startseite (abgemeldet) und beim Anmelden/Registrieren
const langSwitch = () => `<div class="lang-switch" role="group" aria-label="Sprache / Language">
  <span class="lang-globe" aria-hidden="true">🌐</span>${LANGS.map((l) => `<button type="button" class="${l.id === lang ? 'is-on' : ''}" data-lang="${l.id}" aria-pressed="${l.id === lang}" title="${l.name} · ${l.currency}">${l.id.toUpperCase()}</button>`).join('')}
</div>`;
function bindLang(el) {
  el.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { buzz(8); setLang(b.dataset.lang); }));
}

// Eingeloggt und schon eine Card: dann gibt es überall den schnellen Weg zur eigenen Card
const hasCard = () => !!state.user && !!state.account.cards?.length;

function splash() {
  // Eingeloggt: Übersicht statt direkt bezahlen – Card, Fame steigern, Ranking und Code prüfen auf einen Blick.
  // Weißer Grund, Akzente in der eigenen Farbklasse, eigener Stein im Tresor (vor der ersten Card verdeckt).
  if (state.user) {
    const acc = state.account;
    const own = hasCard();
    const cls = classFor(acc.total);
    const last = own ? acc.cards[acc.cards.length - 1] : null;
    const top = last ? TIERS.find((t) => t.id === last.tier) || tierFor(last.total || acc.total) : null;
    const open = !!last && last.revealed !== false;
    const hi = !own ? t('hol dir deine erste Card.') : open ? t('deine Card wartet.') : t('deine Card liegt noch verdeckt da.');
    const main = !own ? button(t('Erste Card holen'), 'data-go="donate"') : button(open ? t('Meine Card') : t('Card aufdecken'), 'data-go="card"');
    // Höchste Klasse: kleine Funkel-Sterne auf den Glas-Kacheln
    const sparkles = (n) => (cls === 9 ? Array.from({ length: n }, (_, i) => `<i class="sparkle" style="--d:${(i * 1.3).toFixed(1)}s" aria-hidden="true"></i>`).join('') : '');
    const tile = (go, icon, title, sub) => `<a class="hub-tile" href="#/${go}"><span class="hub-ico">${icon}</span><b>${title}</b><small>${sub}</small>${sparkles(1)}</a>`;
    return {
      html: `<section class="screen screen--splash screen--welcome cls-${cls}" style="--rar:${CLASSES[cls].color}">
        <div class="donate-aura" aria-hidden="true"></div>
        <canvas class="fx-canvas" data-fx aria-hidden="true"></canvas>
        <div class="sweep" aria-hidden="true"></div>
        <div class="splash-logo">${logo('lg')}</div>
        <div class="vault welcome-vault">
          <div class="vault-rays" aria-hidden="true"></div>
          <div class="vault-ring" aria-hidden="true"></div>
          <svg class="vault-runes" viewBox="0 0 200 200" aria-hidden="true"><defs><path id="welcomepath" d="M100 100m-84 0a84 84 0 1 1 168 0a84 84 0 1 1-168 0"/></defs>
            <text><textPath href="#welcomepath">FAM€ ✦ THEN THE OTHERS ✦ FAM€ ✦ THEN THE OTHERS ✦ FAM€ ✦ THEN THE OTHERS ✦</textPath></text></svg>
          <div class="vault-glow" aria-hidden="true"></div>
          <div class="stage3d" data-diamond></div>
        </div>
        <p class="welcome-hi">Hey ${esc(displayName(state.user) || t('du'))} – ${hi}</p>
        <p class="welcome-sub">${own ? `${t('Dein Fame-Wert')} <b>${money(acc.total)}</b> · ${t('Klasse')} <b>${CLASSES[cls].name}</b>` : t('Noch kein Fame-Wert')}</p>
        <div class="splash-login">${main}</div>
        <nav class="hub" aria-label="${t('Übersicht')}">
          ${tile('donate', icons.bill, own ? t('Fame steigern') : t('Einzahlen'), own ? t('Leg nach, steig auf') : t('Betrag wählen'))}
          ${tile('ranking', icons.goldTrophy, 'Ranking', t('Wer hat den meisten Fame?'))}
          ${tile('check', SEAL, t('Code prüfen'), t('Ist eine Card echt?'))}
        </nav>
        <a class="connect-cta" href="#/accounts">
          <span class="cc-ics" aria-hidden="true">${PLATFORMS.map((p) => `<span class="${isLinked(state.user, p.id) ? 'is-on' : ''}">${platformIcon(p.id)}</span>`).join('')}</span>
          <span class="cc-txt"><b>${t('Accounts verbinden')}</b><small>${t('Verbinde die Accounts, die auf deiner Card stehen sollen.')}</small><span class="cc-pill">${t('{n} von {m} verbunden', { n: linkedIds(state.user).length, m: PLATFORMS.length })}</span></span>
          <span class="cc-go" aria-hidden="true">→</span>${sparkles(2)}
        </a>
        ${resetLink()}
        <span class="app-version">Version ${APP_VERSION}</span>
        <button class="link welcome-logout" type="button" data-logout>${t('Abmelden')}</button>
      </section>`,
      mount(el) {
        bindReset(el);
        const dia = createDiamond(el.querySelector('[data-diamond]'), {
          gem: open ? top : null, mystery: !open, rim: CLASSES[cls].color, glow: 0.4 + cls * 0.06, interactive: true,
        });
        const fx = particles(el.querySelector('[data-fx]'), { color: CLASSES[cls].color, mode: 'embers', density: 0.25 + cls * 0.15 });
        const hom = HOMAGE[shownStage()];
        const t = setTimeout(() => { dia.pulse(); if (own) (hom ? themeJingle(hom) : classDrop(cls)); }, 900);
        el.querySelector('[data-logout]').addEventListener('click', logout);
        return () => { clearTimeout(t); dia.dispose(); fx.dispose(); };
      },
    };
  }
  return {
    html: `<section class="screen screen--splash">
      <div class="sweep" aria-hidden="true"></div>
      ${langSwitch()}
      <div class="splash-logo">${logo('xl')}</div>
      <div class="splash-space"></div>
      <a class="newhere" href="#/intro/1">
        <span class="newhere-q">${t('Neu hier?')}</span>
        <span class="newhere-go">${t('Zeig mir mehr')} <span aria-hidden="true">→</span></span>
      </a>
      <div class="splash-space splash-space--mid"></div>
      ${checkTeaser()}
      <div class="splash-space splash-space--mid"></div>
      <div class="splash-login">${button('Login', 'data-go="login"')}</div>
      ${resetLink()}
      <span class="app-version">Version ${APP_VERSION}</span>
    </section>`,
    mount(el) { bindReset(el); bindLang(el); },
  };
}

// Kasten auf der Startseite: Echtheit einer Fame-Card prüfen
const checkTeaser = () => `<a class="check-teaser" href="#/check">
  ${SEAL}
  <span class="check-teaser-text"><b>${t('Code prüfen')}</b>${t('Ist eine Fame-Card echt? Seriennummer eingeben.')}</span>
  <span class="check-teaser-go" aria-hidden="true">→</span>
</a>`;

// Code-Prüfung: Seriennummer eingeben, Prüfzeichen und Verzeichnis prüfen, Besitzer anzeigen.
function checkPage(initial) {
  const fmtDate = (d) => new Date(d).toLocaleDateString(isEn ? 'en-US' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return {
    html: `<section class="screen screen--dark screen--check" style="--rar:#3dfa74">
      ${backButton('back--dark')}
      <header class="check-head">
        <span class="seal check-seal" aria-hidden="true">${SEAL_TXT}</span>
        <h1 class="check-title">${t('Code prüfen')}</h1>
        <p class="check-sub">${t('Jede Fame-Card hat oben rechts eine Seriennummer. Gib sie ein und prüf, ob die Card echt ist und wem sie gehört.')}</p>
      </header>
      <form class="check-form" data-form autocomplete="off">
        <label class="check-field">
          <span class="sr-only">${t('Seriennummer')}</span>
          <input data-code inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="FM-XXXX-XXXX-X" maxlength="20" value="${esc(initial)}">
        </label>
        ${button(t('Prüfen'), 'type="submit" data-submit')}
        <button class="link check-sample" type="button" data-sample>${t('Beispiel-Code ausprobieren')}</button>
      </form>
      <div class="check-result" data-result aria-live="polite"></div>
      <p class="check-note">${t('Prototyp: Geprüft werden die Prüfziffer und das Verzeichnis dieses Geräts (deine Cards und die Ranking-Spieler). In der fertigen App fragt Fame den Code beim Fame-Server ab.')}</p>
    </section>`,
    mount(el) {
      const input = el.querySelector('[data-code]');
      const out = el.querySelector('[data-result]');
      const show = (res) => {
        out.className = `check-result is-${res.status}`;
        out.style.removeProperty('--c');
        if (res.status === 'invalid') {
          buzz([30, 40, 30]);
          out.innerHTML = `<div class="check-badge">✕</div><h2>${t('Kein gültiger Code')}</h2>
            <p>${t('{serial} ist keine Fame-Seriennummer. Prüf die Schreibweise: FM-XXXX-XXXX-X. Ist sie richtig abgeschrieben, ist die Card nicht echt.', { serial: `<b>${esc(res.serial || '–')}</b>` })}</p>`;
          return;
        }
        if (res.status === 'unknown') {
          buzz(20);
          out.innerHTML = `<div class="check-badge">?</div><h2>${t('Nicht im Verzeichnis')}</h2>
            <p>${t('{serial} hat ein gültiges Format, ist aber keiner Card zugeordnet. Vorsicht – das kann eine nachgemachte Card sein.', { serial: `<b>${esc(res.serial)}</b>` })}</p>`;
          return;
        }
        const g = res.tier;
        const cls = classFor(res.amount);
        const c = countryById(res.owner.country);
        classDrop(cls);
        out.style.setProperty('--c', CLASSES[cls].color);
        out.innerHTML = `<div class="check-badge">✓</div><h2>${t('Echt – verifizierte Fame-Card')}</h2>
          <dl class="check-facts">
            <div><dt>${t('Gehört zu')}</dt><dd>@${esc(res.owner.handle)}${res.owner.verified ? ` <i class="verified" title="${t('Account bestätigt')}">✓</i>` : ''}${res.own ? ` <small>${t('(dein Account)')}</small>` : ''}</dd></div>
            <div><dt>${t('Edelstein')}</dt><dd class="gemline"><span><small>${t('Stufe {n}', { n: g.stage })}</small> ${res.revealed ? esc(g.name) : t('noch verdeckt')}</span><span class="gemline-price">${priceRange(g)}</span></dd></div>
            <div><dt>${t('Klasse')}</dt><dd><i class="check-dot"></i>${CLASSES[cls].name}</dd></div>
            <div><dt>${t('Herkunft')}</dt><dd>${c ? `${c.flag} ` : ''}${esc(res.owner.region ? regionName(res.owner.region) : c?.name || '')}</dd></div>
            <div><dt>${t('Ausgestellt')}</dt><dd>${fmtDate(res.at)}</dd></div>
            <div><dt>${t('Seriennummer')}</dt><dd class="mono">${esc(res.serial)}</dd></div>
          </dl>`;
      };
      const run = () => {
        const v = normalizeSerial(input.value);
        input.value = v;
        if (!v) { input.focus(); return; }
        show(lookupSerial(v, { account: state.account, user: state.user }));
      };
      el.querySelector('[data-form]').addEventListener('submit', (e) => { e.preventDefault(); run(); });
      el.querySelector('[data-submit]').addEventListener('click', (e) => { e.preventDefault(); run(); });
      el.querySelector('[data-sample]').addEventListener('click', () => { input.value = sampleSerial(); run(); });
      input.addEventListener('blur', () => { if (input.value) input.value = normalizeSerial(input.value); });
      if (initial) run();
    },
  };
}

// Schneller Weg zur eigenen Card (zum Posten), sobald man einmal eingezahlt hat
const myCardButton = () => (hasCard()
  ? `<button class="mycard-btn" type="button" data-go="card">${icons.share}<span>${t('Meine Card')}</span></button>`
  : '');

// „Zeig mir mehr“: 6 Story-Slides zum Durchtippen wie eine Instagram-Story. Jede Slide hat eine
// Klassenfarbe – beim Durchtippen steigt man von Kiesel bis Diamant-Holo auf. Kein Stein ist sichtbar:
// welcher es wird, zeigt erst die eigene Card.
const STORY_DE = [
  { cls: 0, tag: 'Real Talk', h: `Reden kann ${hl('jeder.')}`,
    p: `Jeder ist plötzlich rich. Jeder hat die Uhr, den Wagen, das Leben. ${hl('Aber mal ehrlich:')} Wie viel davon ist real und wie viel nur Fake-Flex?` },
  { cls: 2, tag: 'Beweis statt Bluff', h: 'Ab jetzt zählt, was du <span class="g">beweisen</span> kannst.',
    p: `Mit Fame zeigst du schwarz auf weiß, wie groß dein Flex wirklich ist. Kein Gelaber. Keine Mietwagen-Story. Nur dein ${hl('echter Status')}.` },
  { cls: 4, tag: 'Dein Level', h: 'Deine Card.<br>Dein Level.', extra: 'cardback',
    p: 'Welcher Stein es wird, hängt von deinem Geldbeutel ab. Du entscheidest, wie hoch du gehst. Jede Card ein Unikat.' },
  { cls: 5, tag: 'Für immer', h: 'Einmal Fame,<br><span class="g">immer Fame.</span>', extra: 'ladder',
    p: 'Dein Status bleibt. Für immer. Leg nach, steig auf, schalte eine neue Stufe und Abzeichen frei. Runter geht’s nie wieder.' },
  { cls: 6, tag: 'Echtheit', h: `<span class="st-big">Fake?</span><br>${hl('Nicht mit uns.')}`,
    p: `Jemand prahlt mit seinem Level? Check die ${hl('Seriennummer')} und du weißt in Sekunden, ob die Card ${hl('echt ist')} – oder ob da nur einer blufft.` },
  { cls: 8, tag: 'Erst Fame', h: 'Die anderen reden.<br><span class="g">Du hast Fame.</span>', p: '' },
  { cls: 9, tag: 'Der Vergleich', h: '#Real_story, BRO', extra: 'story', p: '' },
];
const STORY_EN = [
  { cls: 0, tag: 'Real Talk', h: `Talk is ${hl('cheap.')}`,
    p: `Suddenly everyone’s rich. Everyone’s got the watch, the whip, the life. ${hl('But real talk:')} how much of it is real – and how much is just fake flex?` },
  { cls: 2, tag: 'Proof, not bluff', h: 'From now on, what counts is what you can <span class="g">prove</span>.',
    p: `With Fame you show in black and white how big your flex really is. No cap. No rental-car story. Just your ${hl('real status')}.` },
  { cls: 4, tag: 'Your level', h: 'Your card.<br>Your level.', extra: 'cardback',
    p: 'Which stone you get depends on your wallet. You decide how high you go. Every card is one of a kind.' },
  { cls: 5, tag: 'Forever', h: 'Once Fame,<br><span class="g">always Fame.</span>', extra: 'ladder',
    p: 'Your status stays. Forever. Stack up, level up, unlock new levels and badges. There’s no going down.' },
  { cls: 6, tag: 'Real deal', h: `<span class="st-big">Fake?</span><br>${hl('Not with us.')}`,
    p: `Someone’s bragging about their level? Check the ${hl('serial number')} and you’ll know in seconds if the card is ${hl('real')} – or if they’re just bluffing.` },
  { cls: 8, tag: 'Fame first', h: 'The others talk.<br><span class="g">You’ve got Fame.</span>', p: '' },
  { cls: 9, tag: 'The comparison', h: '#Real_story, BRO', extra: 'story', p: '' },
];
const STORY = isEn ? STORY_EN : STORY_DE;

// Letzte Slide: der Vergleich Club-Flasche gegen Fame
const storyQuote = () => (isEn ? `<blockquote class="st-quote">
  <p class="st-old">A bottle of Belvedere at the club costs <b class="nowrap">$300 – $3,000</b>,</p>
  <p class="st-old">the ${hl('Fame')} lasts <b>one night</b> max,</p>
  <p class="st-old">and the reach ends at the club door.</p>
  <span class="st-divider" aria-hidden="true"></span>
  <p class="st-new">With ${logoInline()} you set your price,</p>
  <p class="st-new">the ${hl('Fame')} lasts your ${hl('whole life')}</p>
  <p class="st-new">and the reach is <b class="o">limitless</b>.</p>
</blockquote>` : `<blockquote class="st-quote">
  <p class="st-old">Eine Belvedere Flasche kostet im Club <b class="nowrap">300€ – 3.000€</b>,</p>
  <p class="st-old">der ${hl('Fame')} hält maximal <b>einen Abend</b>,</p>
  <p class="st-old">die Reichweite begrenzt sich auf den Club.</p>
  <span class="st-divider" aria-hidden="true"></span>
  <p class="st-new">Bei ${logoInline()} bestimmst du deine Kosten,</p>
  <p class="st-new">der ${hl('Fame')} hält dein ${hl('Leben lang')}</p>
  <p class="st-new">und die Reichweite ist <b class="o">grenzenlos</b>.</p>
</blockquote>`);

// Farbleiter: der Logo-Diamant in allen 10 Klassenfarben, von links nach rechts größer
function classLadder() {
  const path = (poly) => `M${poly.map((q) => q.join(' ')).join('L')}Z`;
  const outline = path(DIA.outline), crown = path(DIA.crown), facets = DIA.facets.map(path).join(' ');
  const HOLO = ['#ff9ad5', '#9fd0ff', '#fff3a8', '#b6ffd9', '#c6b6ff'];
  return `<div class="st-ladder" aria-hidden="true">${CLASSES.map((k, i) => {
    const id = `stl${i}`, w = 20 + i * 2.4, holo = i === CLASSES.length - 1;
    const stops = holo
      ? HOLO.map((h, j) => `<stop offset="${j / (HOLO.length - 1)}" stop-color="${h}"/>`).join('')
      : `<stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${k.color}"/><stop offset="1" stop-color="${k.color}" stop-opacity=".55"/>`;
    return `<svg viewBox="0 0 48 40" style="--c:${holo ? '#c6b6ff' : k.color};width:${w}px;height:${(w * 0.84).toFixed(1)}px">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>
      <path d="${outline}" fill="url(#${id})" fill-opacity=".55"/><path d="${crown}" fill="url(#${id})"/>
      <path d="${facets}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }).join('')}</div>`;
}

// verdeckte Card: Rückseite mit Muster, Stein-Silhouette und „?“
const storyCardBack = () => `<div class="st-cardback" aria-hidden="true">
  <b>${LOGO_TEXT}</b><span class="st-cardback-q">${diamondSvg({ cls: 'st-cardback-dia' })}<i>?</i></span><small>${t('Welcher Stein? Deiner.')}</small>
</div>`;

function introStory() {
  const n = STORY.length;
  return {
    html: `<section class="screen screen--dark screen--slides" style="--rar:${CLASSES[0].color}">
      <div class="st-rays" aria-hidden="true"></div>
      <canvas class="fx-canvas" data-fx aria-hidden="true"></canvas>
      <div class="st-bars" aria-hidden="true">${STORY.map(() => '<i><b></b></i>').join('')}</div>
      <div class="st-top"><span class="st-logo">${LOGO_TEXT}</span><span class="st-num" data-num>1/${n}</span>
        <button class="st-close" type="button" data-back aria-label="${t('Schließen')}">×</button></div>
      <div class="st-stack" data-stack>
        ${STORY.map((s, i) => `<article class="st-slide${i === 0 ? ' is-on' : ''}" data-slide="${i}" style="--c:${CLASSES[s.cls].color}" aria-hidden="${i !== 0}">
          <span class="st-tag">${s.tag}</span>
          <h1 class="st-h">${s.h}</h1>
          ${s.p ? `<p class="st-p">${s.p}</p>` : ''}
          ${s.extra === 'cardback' ? storyCardBack() : ''}${s.extra === 'ladder' ? classLadder() : ''}${s.extra === 'story' ? storyQuote() : ''}
        </article>`).join('')}
      </div>
      <div class="st-foot">
        <span class="st-tap" data-tap>${t('Tippen für weiter →')}</span>
        <div class="st-cta" data-cta hidden>${button(t('Fang an – JETZT'), 'data-go="login"')}</div>
      </div>
    </section>`,
    mount(el) {
      const slides = [...el.querySelectorAll('[data-slide]')];
      const bars = [...el.querySelectorAll('.st-bars i')];
      const fx = particles(el.querySelector('[data-fx]'), { color: CLASSES[0].color, mode: 'dust', density: 0.4 });
      let idx = 0;
      const show = (i, sound = true) => {
        idx = Math.max(0, Math.min(n - 1, i));
        const s = STORY[idx], color = CLASSES[s.cls].color;
        slides.forEach((sl, j) => { sl.classList.toggle('is-on', j === idx); sl.setAttribute('aria-hidden', String(j !== idx)); });
        bars.forEach((b, j) => b.classList.toggle('is-done', j <= idx));
        el.style.setProperty('--rar', color);
        el.querySelector('[data-num]').textContent = `${idx + 1}/${n}`;
        const last = idx === n - 1;
        el.querySelector('[data-tap]').hidden = last;
        el.querySelector('[data-cta]').hidden = !last;
        fx.setColor(s.cls === CLASSES.length - 1 ? '#ffffff' : color);
        fx.setDensity(0.4 + s.cls * 0.12);
        if (sound) classDrop(s.cls);
      };
      // Tippen: rechte Seite weiter, linke Seite zurück (wie bei Instagram); Wischen ebenso
      let sx = null;
      const stack = el.querySelector('[data-stack]');
      el.addEventListener('pointerdown', (e) => { sx = e.clientX; });
      el.addEventListener('pointerup', (e) => {
        if (sx == null || e.target.closest('button, a')) { sx = null; return; }
        const dx = e.clientX - sx;
        sx = null;
        if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
        else show(idx + (e.clientX < el.clientWidth * 0.3 ? -1 : 1));
      });
      const onKey = (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(idx + 1); }
        if (e.key === 'ArrowLeft') show(idx - 1);
      };
      document.addEventListener('keydown', onKey);
      stack.setAttribute('aria-live', 'polite');
      show(0, false);
      return () => { document.removeEventListener('keydown', onKey); fx.dispose(); };
    },
  };
}

function regionOptions(countryId, selected) {
  return countryById(countryId).regions
    .map((r) => `<option value="${esc(r)}"${r === selected ? ' selected' : ''}>${esc(regionName(r))}</option>`).join('');
}

// ---- Accounts verbinden ---------------------------------------------------------------------
// Eine Liste für Registrieren, „Fast geschafft“, die Accounts-Seite und das Ranking-Fenster.
// Verbunden zählt: über die Plattform bestätigt – oder selbst eingetragen, solange die Verbindung
// zu dieser Plattform noch nicht eingerichtet ist (js/config.js).

const isLinked = (u, id) => !!u?.accounts?.[id] && (!!u.verified?.[id] || !isReady(id));
const linkedIds = (u) => PLATFORMS.filter((p) => isLinked(u, p.id)).map((p) => p.id);
const platIcon = (id) => (id ? `<span class="plat" title="${platformName(id)}">${platformIcon(id)}</span>` : '');

function connectError(id, r) {
  const n = platformName(id);
  toast(r.error === 'setup' ? t('Die {n}-Verbindung ist noch nicht eingerichtet – trag deinen Namen solange selbst ein.', { n })
    : r.error === 'denied' ? t('{n}: Anmeldung abgebrochen.', { n }) : t('{n} ist gerade nicht erreichbar. Versuch es gleich nochmal.', { n }));
}

function connectRows(u, { card, pickMode, picked, focus }) {
  return PLATFORMS.map((p) => {
    const on = isLinked(u, p.id);
    const ver = u.verified?.[p.id];
    const shown = ver?.name && p.id === 'sc' && ver.handleSet && ver.name !== u.accounts[p.id] ? ` · ${t('Anzeigename')} „${esc(ver.name)}“` : '';
    const sub = on ? `@${esc(u.accounts[p.id])}${ver ? shown : ` · ${t('selbst eingetragen')}`}` : t('Noch nicht verbunden');
    // Snapchat liefert nur den Anzeigenamen: einmal nach dem @Benutzernamen fragen
    const askSnap = p.id === 'sc' && on && ver && !ver.handleSet;
    const isPicked = pickMode && on && picked === p.id;
    const right = !on
      ? `<button type="button" class="pf-go" data-link="${p.id}">${t('Verbinden')}</button>`
      : pickMode ? `<span class="pf-ok">${isPicked ? t('✓ Im Ranking') : t('Antippen')}</span>`
        : `<span class="pf-ok">${t('✓ Verbunden')}</span><button type="button" class="pf-change" data-unlink="${p.id}" aria-label="${t('{n} entfernen', { n: p.name })}">${t('Entfernen')}</button>`;
    return `<div class="pf${on ? ' is-on' : ''}${isPicked ? ' is-picked' : ''}${focus === p.id ? ' is-focus' : ''}" data-pf="${p.id}"${pickMode && on ? ' data-pick role="button" tabindex="0"' : ''}>
        <span class="pf-ic">${platformIcon(p.id)}</span>
        <span class="pf-nm">${p.name}<small>${sub}</small></span>
        ${right}
      </div>
      ${askSnap ? `<div class="sc-ask" data-scask>
        <b>${t('Snapchat verbunden ✓ – wie lautet dein Benutzername?')}</b>
        <p>${t('Snapchat gibt uns nur deinen Anzeigenamen („{name}“). Damit dich alle finden, trag deinen @Benutzernamen ein.', { name: esc(ver.name || u.accounts.sc) })}</p>
        <div class="sc-ask-row"><input name="h" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" value="${esc(u.accounts.sc)}" aria-label="${t('Snapchat-Benutzername')}"><button type="button" data-scaskok>OK</button></div>
      </div>` : ''}
      ${on ? '' : `<div class="pf-manual" data-manual="${p.id}" role="group" hidden><input name="h" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="${t('@dein {n}-Name', { n: p.name })}" aria-label="${t('{n}-Name', { n: p.name })}"><button type="button" data-manualok>OK</button></div>`}
      ${on && card ? `<label class="check pf-card"><input type="checkbox" data-oncard="${p.id}"${u.onCard?.includes(p.id) ? ' checked' : ''}><span class="check-box"></span><span>${t('Steht auf meiner Card')}</span></label>` : ''}`;
  }).join('');
}

// get/set lesen und schreiben das Profil (oder beim Registrieren den Entwurf).
// pickMode: verbundene Zeilen lassen sich antippen (Name fürs Ranking).
function mountConnect(host, { get, set, card = true, pickMode = false, pick = null, focus = null, back, onChange }) {
  let picked = pick;
  const fix = () => {
    if (!pickMode) return;
    const ids = linkedIds(get());
    if (!ids.includes(picked)) picked = ids.find((id) => get().onCard?.includes(id)) || ids[0] || null;
  };
  const update = (fn) => {
    const u = structuredClone(get() || {});
    u.accounts ||= {}; u.verified ||= {}; u.onCard ||= [];
    fn(u);
    set(u);
    draw();
  };
  function bind() {
    host.querySelectorAll('[data-link]').forEach((b) => {
      const id = b.dataset.link;
      b.addEventListener('click', () => {
        if (isReady(id)) { connectRedirect(id, get(), back); return; }
        const f = host.querySelector(`[data-manual="${id}"]`);
        f.hidden = false;
        f.querySelector('input').focus();
        connectError(id, { error: 'setup' });
      });
    });
    // Selbst eintragen (kein eigenes <form>, die Liste steckt oft schon in einem Formular)
    host.querySelectorAll('[data-manual]').forEach((f) => {
      const input = f.querySelector('input');
      const save = () => {
        const id = f.dataset.manual;
        const h = cleanHandle(input.value);
        if (!h) { input.focus(); buzz(30); return; }
        update((u) => { u.accounts[id] = h; delete u.verified[id]; if (!u.onCard.length) u.onCard.push(id); });
        buzz([10, 40, 10]);
        toast(t('{n} eingetragen ✓', { n: platformName(id) }));
      };
      f.querySelector('[data-manualok]').addEventListener('click', save);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });
    host.querySelectorAll('[data-scask]').forEach((box) => {
      const input = box.querySelector('input');
      const save = () => {
        const h = cleanHandle(input.value);
        if (!h) { input.focus(); buzz(30); return; }
        update((u) => { u.accounts.sc = h; u.verified.sc = { ...u.verified.sc, handleSet: true }; });
        buzz([10, 40, 10]);
        toast(t('Snapchat: @{h} gespeichert ✓', { h }));
      };
      box.querySelector('[data-scaskok]').addEventListener('click', save);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });
    host.querySelectorAll('[data-unlink]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.unlink;
      update((u) => { delete u.accounts[id]; delete u.verified[id]; u.onCard = u.onCard.filter((x) => x !== id); });
      buzz(8);
    }));
    host.querySelectorAll('[data-oncard]').forEach((c) => c.addEventListener('change', () => {
      const id = c.dataset.oncard;
      update((u) => { u.onCard = c.checked ? [...new Set([...u.onCard, id])] : u.onCard.filter((x) => x !== id); });
      buzz(8);
    }));
    host.querySelectorAll('[data-pick]').forEach((r) => {
      const choose = () => { picked = r.dataset.pf; buzz(8); draw(); };
      r.addEventListener('click', choose);
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    });
  }
  function draw() {
    fix();
    host.innerHTML = connectRows(get() || {}, { card, pickMode, picked, focus });
    bind();
    onChange?.(picked);
  }
  draw();
  return { get picked() { return picked; } };
}

// ---- Anmelden und Registrieren ----------------------------------------------------------------

const authHero = () => hero('<div class="stage3d" data-diamond></div>', { cls: 'hero--tall' });
const authDiamond = (el) => createDiamond(el.querySelector('[data-diamond]'), { level: 4, glow: 0.6, rim: '#3dfa74' });
const ssoButtons = (verb) => `<button class="sso sso--apple" type="button" data-sso="apple">${icons.apple}<span>${t(`${verb} mit Apple`)}</span></button>
  <button class="sso sso--google" type="button" data-sso="google">${icons.google}<span>${t(`${verb} mit Google`)}</span></button>`;
const pwField = (label, name, ac) => `<label class="field"><span>${label}</span><span class="pw"><input name="${name}" type="password" autocomplete="${ac}" minlength="8" required><button type="button" class="pw-eye" data-eye aria-label="${t('Passwort zeigen')}">${icons.eye}</button></span></label>`;
const emptyScreen = (to) => { queueMicrotask(() => go(to)); return { html: '<section class="screen"></section>' }; };
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function bindAuthBits(el) {
  bindLang(el);
  el.querySelectorAll('[data-sso]').forEach((b) => b.addEventListener('click', async () => {
    if (b.classList.contains('is-busy')) return;
    b.classList.add('is-busy');
    const p = b.dataset.sso;
    const r = await auth.signInWith(p);
    if (r.pending) return; // weiter zu Apple/Google
    b.classList.remove('is-busy');
    toast(r.error === 'setup' ? t('Anmelden mit {p} ist noch nicht eingerichtet – nimm solange deine E-Mail.', { p: p === 'apple' ? 'Apple' : 'Google' }) : r.error);
  }));
  el.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
    const i = b.previousElementSibling;
    i.type = i.type === 'password' ? 'text' : 'password';
    b.classList.toggle('is-on', i.type === 'text');
  }));
}

// Fehler unter dem Formular zeigen (und das Feld markieren)
function formError(form, msg, field) {
  const box = form.querySelector('[data-err]');
  box.textContent = msg;
  box.hidden = !msg;
  form.querySelectorAll('.is-error').forEach((f) => f.classList.remove('is-error'));
  if (field) { field.closest('.field')?.classList.add('is-error'); field.focus(); }
  if (msg) buzz(30);
}
async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('is-busy');
  try { await fn(); } finally { btn.disabled = false; btn.classList.remove('is-busy'); }
}
const markAlive = () => { try { sessionStorage.setItem('fame.alive', '1'); } catch { /* privat */ } };

// Bedingungen + Datenschutz (Registrieren, „Fast geschafft“)
const TERMS_LABEL = () => t('Ich akzeptiere die {terms} und habe die {privacy} gelesen.', {
  terms: `<a href="#/terms">${t('Bedingungen')}</a>`,
  privacy: `<a href="${isEn ? 'privacy.html' : 'datenschutz.html'}" target="_blank" rel="noopener">${t('Datenschutzerklärung')}</a>`,
});

function login() {
  if (state.user) return emptyScreen(state.after || '');
  return {
    html: `<section class="screen screen--login">
      ${authHero()}
      ${langSwitch()}
      <form class="login-form auth-form" novalidate>
        <div class="login-icon">${diamondShadowed()}</div>
        <h1 class="headline">Login</h1>
        <p class="sub">${t('Schön, dass du wieder da bist.')}</p>
        ${ssoButtons('Anmelden')}
        <div class="or">${t('oder mit E-Mail')}</div>
        <label class="field"><span>${t('E-Mail')}</span><input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="${t('du@beispiel.de')}" required value="${esc(state.pendingEmail || '')}"></label>
        ${pwField(t('Passwort'), 'pw', 'current-password')}
        <div class="row-between">
          <label class="check"><input type="checkbox" name="keep"${store.get('keep') === false ? '' : ' checked'}><span class="check-box"></span><span>${t('Angemeldet bleiben')}</span></label>
          <button class="link" type="button" data-forgot>${t('Passwort vergessen?')}</button>
        </div>
        <p class="form-error" data-err hidden></p>
        <div class="screen-foot"><button class="btn" type="submit"><span>Login</span></button></div>
        <div class="or">${t('Noch kein Account?')}</div>
        <div class="screen-foot"><button class="btn btn--ghost" type="button" data-go="register"><span>${t('Registrieren')}</span></button></div>
      </form>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      const form = el.querySelector('form');
      bindAuthBits(el);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = form.email.value.trim();
        const pw = form.pw.value;
        if (!validEmail(email)) { formError(form, t('Gib deine E-Mail-Adresse ein.'), form.email); return; }
        if (!pw) { formError(form, t('Gib dein Passwort ein.'), form.pw); return; }
        busy(form.querySelector('[type="submit"]'), async () => {
          const r = await auth.signIn(email, pw);
          if (r.error) { formError(form, r.error); return; }
          store.set('keep', form.keep.checked);
          markAlive();
          await startSession(r.session);
          state.pendingEmail = '';
          toast(t('Angemeldet ✓'));
          afterAuth();
        });
      });
      el.querySelector('[data-forgot]').addEventListener('click', (e) => {
        const email = form.email.value.trim();
        if (!validEmail(email)) { formError(form, t('Gib zuerst deine E-Mail ein – dann schicken wir dir einen Link.'), form.email); return; }
        busy(e.currentTarget, async () => {
          const r = await auth.resetPassword(email);
          if (r.error) { formError(form, r.error); return; }
          formError(form, '');
          toast(t('Link ist unterwegs – schau in dein Postfach.'));
        });
      });
      return () => dia.dispose();
    },
  };
}

function register() {
  if (state.user) return emptyScreen('');
  return {
    html: `<section class="screen screen--login">
      ${authHero()}
      ${langSwitch()}
      <form class="login-form auth-form" novalidate>
        <div class="login-icon">${diamondShadowed()}</div>
        <h1 class="headline">${t('Registrieren')}</h1>
        <p class="sub">${t('Leg deinen {app}-Account an – dauert 1 Minute.', { app: LOGO_TEXT })}</p>
        <div class="sec">${t('1 · Dein Login')}<small>${t('Am schnellsten mit Apple (iCloud) oder Google – ohne neues Passwort. 🔒 Deine E-Mail taucht nirgendwo auf.')}</small></div>
        ${ssoButtons('Weiter')}
        <div class="or">${t('oder mit E-Mail')}</div>
        <label class="field"><span>${t('E-Mail')}</span><input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="${t('du@beispiel.de')}" required></label>
        <p class="hint">${t('🔒 Deine E-Mail taucht nirgendwo auf – nicht auf der Card, nicht im Ranking.')}</p>
        ${pwField(`${t('Passwort')} <small>${t('(mind. 8 Zeichen)')}</small>`, 'pw', 'new-password')}
        ${pwField(t('Passwort wiederholen'), 'pw2', 'new-password')}
        <div class="sec">${t('2 · Accounts verbinden')}<small>${t('Verbinde die Accounts, die auf deiner Card stehen sollen. Dein Name kommt direkt von Insta, TikTok oder Snapchat.')}</small></div>
        <div data-connect></div>
        <p class="note">${t('Geht auch später – über „Accounts verbinden“ auf der Startseite.')}</p>
        <div class="sec">${t('3 · Fertig')}</div>
        <label class="check terms-check"><input type="checkbox" name="terms"><span class="check-box"></span><span>${TERMS_LABEL()}</span></label>
        <p class="form-error" data-err hidden></p>
        <div class="screen-foot"><button class="btn" type="submit"><span>${t('Registrierung abschließen')}</span></button></div>
        <div class="or">${t('Schon einen Account?')}</div>
        <div class="screen-foot"><button class="link" type="button" data-go="login">${t('Zum Login')}</button></div>
      </form>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      const form = el.querySelector('form');
      bindAuthBits(el);
      mountConnect(el.querySelector('[data-connect]'), {
        get: () => state.regDraft, set: (u) => { state.regDraft = u; saveDraft(); }, back: 'register',
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = form.email.value.trim();
        if (!validEmail(email)) { formError(form, t('Die E-Mail-Adresse stimmt nicht.'), form.email); return; }
        if (form.pw.value.length < 8) { formError(form, t('Das Passwort braucht mindestens 8 Zeichen.'), form.pw); return; }
        if (form.pw.value !== form.pw2.value) { formError(form, t('Die beiden Passwörter sind nicht gleich.'), form.pw2); return; }
        if (!form.terms.checked) { formError(form, t('Bitte akzeptiere die Bedingungen.')); return; }
        busy(form.querySelector('[type="submit"]'), async () => {
          const d = state.regDraft;
          const r = await auth.signUp(email, form.pw.value, {
            fame: { accounts: d.accounts || {}, verified: d.verified || {}, onCard: d.onCard || [], termsAt: Date.now() },
          });
          if (r.error) { formError(form, r.error); return; }
          if (!r.session) { state.pendingEmail = email; go('confirm'); return; } // erst die Mail bestätigen
          store.set('keep', true);
          markAlive();
          await startSession(r.session);
          toast(t('Account erstellt ✓ Willkommen!'));
          afterAuth();
        });
      });
      return () => dia.dispose();
    },
  };
}

// Nach dem Registrieren: Link in der Mail bestätigen
function confirmPage() {
  const email = state.pendingEmail || '';
  return {
    html: `<section class="screen screen--login">
      ${authHero()}
      <div class="login-form auth-form">
        <div class="login-icon">${diamondShadowed()}</div>
        <h1 class="headline">${t('Check dein Postfach')}</h1>
        <p class="sub">${email ? t('Wir haben dir an {email} einen Link geschickt. Tipp darauf – dann ist dein Account fertig.', { email: `<b>${esc(email)}</b>` }) : t('Wir haben dir einen Link geschickt. Tipp darauf – dann ist dein Account fertig.')}</p>
        <p class="note">${t('Keine Mail da? Schau auch im Spam-Ordner nach.')}</p>
        <div class="screen-foot">${email ? `<button class="btn btn--ghost" type="button" data-resend><span>${t('Mail nochmal senden')}</span></button>` : ''}</div>
        <div class="screen-foot"><button class="link" type="button" data-go="login">${t('Zum Login')}</button></div>
      </div>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      el.querySelector('[data-resend]')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
        const r = await auth.resendConfirm(email);
        toast(r.error || t('Neue Mail ist unterwegs.'));
      }));
      return () => dia.dispose();
    },
  };
}

// Link aus „Passwort vergessen“: neues Passwort setzen
function resetPage() {
  const ok = auth.hasStoredSession();
  return {
    html: `<section class="screen screen--login">
      ${authHero()}
      <form class="login-form auth-form" novalidate>
        <div class="login-icon">${diamondShadowed()}</div>
        <h1 class="headline">${t('Neues Passwort')}</h1>
        ${ok ? `<p class="sub">${t('Wähl ein neues Passwort für deinen {app}-Account.', { app: LOGO_TEXT })}</p>
          ${pwField(`${t('Neues Passwort')} <small>${t('(mind. 8 Zeichen)')}</small>`, 'pw', 'new-password')}
          ${pwField(t('Passwort wiederholen'), 'pw2', 'new-password')}
          <p class="form-error" data-err hidden></p>
          <div class="screen-foot"><button class="btn" type="submit"><span>${t('Passwort speichern')}</span></button></div>`
    : `<p class="sub">${t('Der Link ist abgelaufen oder wurde schon benutzt. Fordere beim Login einfach einen neuen an.')}</p>
          <div class="screen-foot"><button class="btn" type="button" data-go="login"><span>${t('Zum Login')}</span></button></div>`}
      </form>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      bindAuthBits(el);
      const form = el.querySelector('form');
      if (ok) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (form.pw.value.length < 8) { formError(form, t('Das Passwort braucht mindestens 8 Zeichen.'), form.pw); return; }
          if (form.pw.value !== form.pw2.value) { formError(form, t('Die beiden Passwörter sind nicht gleich.'), form.pw2); return; }
          busy(form.querySelector('[type="submit"]'), async () => {
            const r = await auth.updatePassword(form.pw.value);
            if (r.error) { formError(form, r.error); return; }
            toast(t('Passwort geändert ✓'));
            go(state.user && !state.user.done ? 'finish' : '');
          });
        });
      }
      return () => dia.dispose();
    },
  };
}

// Nach Apple/Google (und für alle, die noch nicht fertig sind): Accounts verbinden, Bedingungen
function finishPage() {
  if (!state.user) return emptyScreen('login');
  const prov = state.session?.provider || 'email';
  const via = { apple: ['Apple', icons.apple], google: ['Google', icons.google] }[prov] || ['E-Mail', icons.mail];
  return {
    html: `<section class="screen screen--login">
      ${authHero()}
      <form class="login-form auth-form" novalidate>
        <div class="login-icon">${diamondShadowed()}</div>
        <h1 class="headline">${t('Fast geschafft')}</h1>
        <p class="sub">${t('Noch 2 kurze Schritte, dann ist dein Account fertig.')}</p>
        <div class="signed">${via[1]}<span>${t('Angemeldet mit {p}', { p: via[0] })}</span>${prov === 'email' ? '' : `<small>${t('✓ ohne Passwort')}</small>`}</div>
        <p class="hint">${t('🔒 Deine E-Mail taucht nirgendwo auf.')}</p>
        <div class="sec">${t('1 · Accounts verbinden')}<small>${t('Verbinde die Accounts, die auf deiner Card stehen sollen.')}</small></div>
        <div data-connect></div>
        <div class="sec">${t('2 · Fertig')}</div>
        <label class="check terms-check"><input type="checkbox" name="terms"${state.user.termsAt ? ' checked' : ''}><span class="check-box"></span><span>${TERMS_LABEL()}</span></label>
        <p class="form-error" data-err hidden></p>
        <div class="screen-foot"><button class="btn" type="submit"><span>${t('Account fertig')}</span></button></div>
      </form>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      const form = el.querySelector('form');
      mountConnect(el.querySelector('[data-connect]'), { get: () => state.user, set: saveUser, back: 'finish' });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.terms.checked) { formError(form, t('Bitte akzeptiere die Bedingungen.')); return; }
        saveUser({ ...state.user, done: true, termsAt: state.user.termsAt || Date.now() });
        toast(t('Account fertig ✓ Willkommen!'));
        afterAuth();
      });
      return () => dia.dispose();
    },
  };
}

// „Accounts verbinden“ von der Startseite (oder von der Card, wenn zum Posten etwas fehlt)
function accountsPage() {
  if (!state.user) { state.after = 'accounts'; return emptyScreen('login'); }
  const focus = state.focusPlatform;
  return {
    html: `<section class="screen screen--login">
      ${authHero()}
      <div class="login-form auth-form">
        <h1 class="headline">${t('Accounts verbinden')}</h1>
        <p class="sub">${focus ? t('Verbinde {n}, dann kannst du deine Card direkt posten.', { n: platformName(focus) }) : t('Verbinde die Accounts, die auf deiner Card stehen sollen. Mehrere möglich.')}</p>
        <div data-connect></div>
        <p class="note">${t('Verbunden heißt: Dein echter Name steht auf der Card und du kannst deine Story direkt posten.')}</p>
        <div class="screen-foot"><button class="btn" type="button" data-done><span>${state.after === 'card' ? t('Zurück zur Card') : t('Fertig')}</span></button></div>
      </div>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      mountConnect(el.querySelector('[data-connect]'), { get: () => state.user, set: saveUser, focus, back: 'accounts' });
      el.querySelector('[data-done]').addEventListener('click', () => {
        const next = state.after || '';
        state.after = null;
        state.focusPlatform = null;
        go(next);
      });
      el.querySelector('.is-focus')?.scrollIntoView({ block: 'center' });
      return () => dia.dispose();
    },
  };
}

// Nach dem Anmelden: erst „Fast geschafft“, sonst dorthin, wo man hinwollte
function afterAuth() {
  if (!state.user?.done) { go('finish'); return; }
  const next = state.after || '';
  state.after = null;
  goOrRender(next);
}

// go() ändert nichts, wenn man schon auf der Seite ist – dann neu zeichnen
const goOrRender = (path) => { if (location.hash.replace(/^#\/?/, '') === path) render(); else go(path); };

// ---- Sitzung -----------------------------------------------------------------------------------

// Profil nach dem Anmelden laden. Neu angelegt wird es aus der Registrierung (E-Mail),
// dem Entwurf auf diesem Gerät oder – einmalig – aus den alten Daten vor dem Login-Umbau.
async function startSession(session) {
  const info = auth.sessionInfo(session);
  if (!info) return false;
  state.session = info;
  const r = await auth.loadProfile(info.id);
  if (r.data?.user) {
    state.user = normalizeUser(r.data.user);
    if (r.data.account) state.account = r.data.account;
    store.set('user', state.user);
    store.set('account', state.account);
    return true;
  }
  if (r.error) console.warn('Profil nicht geladen:', r.error);
  if (r.error && state.user) return true; // offline o. ä.: lokaler Stand bleibt
  const meta = info.meta?.fame || {};
  const has = (o) => (o && Object.keys(o.accounts || {}).length ? o : null);
  const src = has(meta) || has(state.regDraft) || has(store.get('user')) || {};
  state.user = normalizeUser({
    accounts: src.accounts || {}, verified: src.verified || {}, onCard: src.onCard || [],
    done: !!meta.termsAt, termsAt: meta.termsAt || null, created: Date.now(),
  });
  store.set('user', state.user);
  state.regDraft = { accounts: {}, verified: {}, onCard: [] };
  store.remove('regdraft');
  if (!r.error) {
    const w = await auth.saveProfile(info.id, { user: state.user, account: state.account });
    if (w.error) console.warn('Profil nicht gespeichert:', w.error);
  }
  return true;
}

function clearLocal() {
  state.user = null;
  state.session = null;
  state.account = { total: 0, deposits: [], cards: [] };
  ['user', 'account'].forEach((k) => store.remove(k));
}

async function logout() {
  await auth.signOut();
  clearLocal();
  toast('Du bist abgemeldet.');
  goOrRender('');
}

// Bedingungen: Platzhalter, der Text folgt
function terms() {
  return {
    html: `<section class="screen screen--dark screen--terms" style="--rar:#3dfa74">
      ${backButton('back--dark')}
      <h1 class="terms-title">${t('Bedingungen')}</h1>
      <p class="terms-text">${t('Hier stehen bald die Teilnahmebedingungen von {app}.', { app: LOGO_TEXT })}</p>
      <p class="terms-text"><a href="${isEn ? 'privacy.html' : 'datenschutz.html'}" target="_blank" rel="noopener">${t('Datenschutzerklärung')}</a></p>
    </section>`,
  };
}

// Schrittweite für +/- je nach Größenordnung (1, 5, 50, 500 …).
function stepFor(amount, dir) {
  const base = amount < 10 ? 1 : 5 * 10 ** (Math.floor(Math.log10(dir > 0 ? amount : amount - 1)) - 1);
  return Math.max(1, base);
}

// Einzahlen: Wie ein Diamant aussieht, sieht nur, wer ihn besitzt. Alle anderen sehen nur
// seine leuchtenden Umrisse – das macht neugierig.
function donate() {
  const acc = state.account;
  // Sammlung: alle Steine, die man schon auf einer Card aufgedeckt hat
  const collected = collectedStages();
  const start = tierFor(acc.total + state.amount);
  return {
    html: `<section class="screen screen--dark screen--donate cls-${start.cls}" style="--rar:${start.css}">
      <div class="donate-aura" aria-hidden="true"></div>
      <canvas class="fx-canvas" data-fx aria-hidden="true"></canvas>
      ${backButton('back--dark')}
      ${myCardButton()}
      <div class="vault">
        <div class="vault-rays" aria-hidden="true"></div>
        <div class="vault-ring" aria-hidden="true"></div>
        <svg class="vault-runes" viewBox="0 0 200 200" aria-hidden="true"><defs><path id="vaultpath" d="M100 100m-84 0a84 84 0 1 1 168 0a84 84 0 1 1-168 0"/></defs>
          <text><textPath href="#vaultpath">FAM€ ✦ THEN THE OTHERS ✦ FAM€ ✦ THEN THE OTHERS ✦ FAM€ ✦ THEN THE OTHERS ✦</textPath></text></svg>
        <div class="vault-glow" aria-hidden="true"></div>
        <div class="stage3d" data-diamond></div>
        <div class="vault-q" aria-hidden="true">?</div>
        <div class="rarity-flash" data-flash aria-hidden="true"></div>
      </div>
      <div class="vault-info">
        <h1 class="vault-name" data-tier></h1>
        <p class="vault-teaser" data-teaser></p>
      </div>
      <div class="collection" aria-label="${t('Deine Sammlung')}">
        <div class="gem-grid">
          ${TIERS.map((t) => `<i class="gcell${collected.has(t.stage) ? ' is-found' : ''}" data-cell="${t.stage}" style="--c:${t.css}"></i>`).join('')}
        </div>
      </div>
      <div class="donate-body">
        ${acc.total ? `<div class="account">${t('Dein Fame-Wert')} <b>${money(acc.total)}</b> → ${t('danach')} <b data-after></b></div>` : ''}
        <div class="amount-box">
          <button class="stepper" type="button" data-step="-1" aria-label="${t('Weniger')}">−</button>
          <label class="amount-field${isEn ? ' amount-field--pre' : ''}">
            <span class="sr-only">${t('Betrag in Euro')}</span>
            ${isEn ? `<span class="amount-cur" aria-hidden="true">${CURRENCY}</span>` : ''}
            <input id="donate-amount" data-amount inputmode="numeric" autocomplete="off" enterkeyhint="done">
            ${isEn ? '' : `<span class="amount-cur" aria-hidden="true">${CURRENCY}</span>`}
          </label>
          <button class="stepper" type="button" data-step="1" aria-label="${t('Mehr')}">+</button>
        </div>
        <p class="amount-hint">${t('Betrag antippen zum Eintippen – oder Regler ziehen')}</p>
        <div class="arc" data-arc role="slider" tabindex="0" aria-label="${t('Betrag einstellen')}"
          aria-valuemin="${MIN_AMOUNT}" aria-valuemax="${MAX_AMOUNT}">
          <svg viewBox="0 0 300 108" aria-hidden="true">
            <path class="arc-track" d="M20 16 Q150 168 280 16" pathLength="1"/>
            <path class="arc-fill" d="M20 16 Q150 168 280 16" pathLength="1" data-arcfill/>
            <g data-knob><circle class="knob-shadow" r="13" cx="3" cy="4"/><circle class="knob" r="13"/><circle class="knob-dot" r="4"/></g>
          </svg>
        </div>
        <button class="nudge" type="button" data-nudge></button>
        <label class="check">
          <input id="donate-accept" type="checkbox" data-accept ${state.accepted ? 'checked' : ''}>
          <span class="check-box" aria-hidden="true"></span>
          <span>${t('Ich akzeptiere die {terms}', { terms: `<a href="#/terms">${t('Bedingungen')}</a>` })}</span>
        </label>
        <div class="screen-foot">
          ${button('I´m awesome', 'data-awesome')}
        </div>
      </div>
    </section>`,
    mount(el) {
      const $ = (s) => el.querySelector(s);
      // Bekannte Steine zeigen sich, unbekannte nur als Silhouette
      const known = (t) => collected.has(t.stage);
      const dia = createDiamond($('[data-diamond]'), {
        gem: known(start) ? start : null, rim: start.css, mystery: !known(start), glow: 0.6,
      });
      const canvas = $('[data-fx]');
      const fx = particles(canvas, { color: start.css, mode: 'embers', density: 0.3 + start.cls * 0.15 });
      const input = $('[data-amount]');
      const arc = $('[data-arc]');
      const fill = $('[data-arcfill]');
      const knob = $('[data-knob]');
      const btn = $('[data-awesome]');
      const accept = $('[data-accept]');
      const flash = $('[data-flash]');
      const nudge = $('[data-nudge]');
      let cls = start.cls;
      let stage = start.stage;
      let amount = state.amount;
      let nudgeTarget = 0;

      const tierChanged = (tier, up) => {
        classDrop(tier.cls);
        dia.pulse();
        flash.classList.remove('is-on');
        void flash.offsetWidth;
        flash.classList.add('is-on');
        if (up) {
          const [x, y] = centerIn(canvas, $('[data-diamond]'));
          fx.burst(x, y, 20 + tier.level * 20, tier.css);
        }
      };

      const update = (next, { sound = false } = {}) => {
        const prev = amount;
        amount = Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.round(next)));
        state.amount = amount;
        const after = acc.total + amount;
        const pos = posFromAmount(amount);
        const tier = tierFor(after);
        const locked = !known(tier);

        knob.setAttribute('transform', `translate(${20 + 260 * pos} ${16 + 304 * pos * (1 - pos)})`);
        fill.style.strokeDasharray = `${pos} 1`;
        arc.setAttribute('aria-valuenow', amount);
        arc.setAttribute('aria-valuetext', `${money(amount)}, ${t('danach')} ${tier.name}`);
        if (document.activeElement !== input) input.value = fmt(amount);
        input.parentElement.classList.toggle('is-long', amount >= 1_000_000);
        const afterEl = $('[data-after]');
        if (afterEl) afterEl.textContent = money(after);

        $('[data-tier]').textContent = t('Edelstein');
        $('[data-teaser]').textContent = locked
          ? t('Welcher es ist, zeigt dir erst deine Card.')
          : t('Den hast du schon in deiner Sammlung.');
        el.classList.toggle('is-locked', locked);
        el.querySelectorAll('[data-cell]').forEach((c) => c.classList.toggle('is-target', +c.dataset.cell === tier.stage));
        el.style.setProperty('--rar', tier.css);
        // Farbklasse: je höher, desto wertiger die Seite (Strahlen, Ring, Runen, Glanz)
        if (tier.cls !== cls) el.classList.replace(`cls-${cls}`, `cls-${tier.cls}`);
        el.style.setProperty('--glow', (0.3 + posFromAmount(after) * 0.7).toFixed(3));
        dia.setGlow(posFromAmount(after));

        // Anreiz: wie viel fehlt bis zum nächsten Edelstein?
        const nx = nextTier(after);
        if (nx) {
          nudgeTarget = nx.min - acc.total;
          nudge.hidden = false;
          nudge.style.setProperty('--c', nx.css);
          nudge.innerHTML = `<span>${t('Nur noch {x} bis {lvl}', { x: `<b>${money(nx.min - after)}</b>`, lvl: `<b>${t('Stufe {n}', { n: nx.stage })}</b>` })}</span><span class="nudge-go">${t('Nächster Edelstein →')}</span>`;
        } else {
          nudge.hidden = true;
        }

        if (tier.stage !== stage) {
          // neuer Edelstein: unbekannt -> Silhouette, bekannt -> echter Stein
          dia.setGem(locked ? null : tier);
          dia.setMystery(locked, tier.css);
          dia.setRim(tier.css);
          if (tier.cls !== cls) {
            // neue Farbklasse: Farbe, Funken und der Sound der Klasse
            fx.setColor(tier.css);
            fx.setDensity(0.3 + tier.cls * 0.15);
            if (sound) tierChanged(tier, tier.cls > cls);
            cls = tier.cls;
          } else if (sound) {
            stageTick(tier.stage, tier.stage > stage);
            dia.pulse();
          }
          stage = tier.stage;
        } else if (sound && amount !== prev) {
          tick(pos, amount > prev);
        }
        store.set('amount', amount);
      };

      // Regler
      const svg = arc.querySelector('svg');
      const fromPointer = (e) => {
        const r = svg.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 300;
        return Math.min(1, Math.max(0, (x - 20) / 260));
      };
      let dragging = false;
      arc.addEventListener('pointerdown', (e) => {
        dragging = true;
        arc.setPointerCapture?.(e.pointerId);
        update(amountFromPos(fromPointer(e)), { sound: true });
      });
      arc.addEventListener('pointermove', (e) => { if (dragging) update(amountFromPos(fromPointer(e)), { sound: true }); });
      const stop = () => { dragging = false; };
      arc.addEventListener('pointerup', stop);
      arc.addEventListener('pointercancel', stop);
      arc.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        update(amountFromPos(Math.min(1, Math.max(0, posFromAmount(amount) + d * 0.01))), { sound: true });
      });

      // Betrag direkt eintippen: beim Antippen wird alles markiert, Eingabe wird live übernommen.
      input.addEventListener('focus', () => { input.value = String(amount); requestAnimationFrame(() => input.select()); });
      input.addEventListener('input', () => {
        const n = parseInt(input.value.replace(/\D/g, ''), 10);
        if (n) update(n, { sound: true });
      });
      input.addEventListener('blur', () => { input.value = fmt(amount); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

      // Plus / Minus
      el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        const d = +b.dataset.step;
        const step = stepFor(amount, d);
        update(d > 0 ? Math.floor(amount / step) * step + step : Math.ceil(amount / step) * step - step, { sound: true });
      }));

      nudge.addEventListener('click', () => { if (nudgeTarget > 0) update(nudgeTarget, { sound: true }); });

      const syncBtn = () => { btn.disabled = !accept.checked; };
      accept.addEventListener('change', () => { state.accepted = accept.checked; syncBtn(); buzz(8); });

      btn.addEventListener('click', async () => {
        if (!accept.checked) return;
        if (!state.user) {
          state.after = 'donate';
          toast(t('Log dich ein, damit der Betrag deinem Fame-Wert gutgeschrieben wird.'));
          go('login');
          return;
        }
        try { await window.DeviceOrientationEvent?.requestPermission?.(); } catch { /* abgelehnt */ }
        // Prototyp: die Zahlung wird simuliert und direkt dem Konto gutgeschrieben.
        const at = Date.now();
        acc.total += amount;
        acc.deposits.push({ amount, at });
        const tier = tierFor(acc.total);
        acc.cards.push({
          tier: tier.id, stage: tier.stage, total: acc.total, at, revealed: false,
          serial: makeSerial(`${state.session?.id || state.user.name}|${state.user.insta}|${acc.total}|${at}`),
        });
        saveAccount();
        go('card');
      });

      update(amount);
      syncBtn();
      return () => { fx.dispose(); dia.dispose(); };
    },
  };
}

// Fame-Card: liegt verdeckt da. Antippen baut Spannung auf, dann dreht sie sich mit Licht und Sound.
// Je höher die Stufe, desto länger die Spannung und desto größer der Gewinn-Moment.
function card() {
  const acc = state.account;
  const c = acc.cards?.[acc.cards.length - 1];
  if (!acc.total || !c) {
    queueMicrotask(() => go('donate'));
    return { html: '<section class="screen"></section>' };
  }
  const tier = TIERS.find((t) => t.id === c.tier) || TIERS[c.stage - 1] || tierFor(c.total || acc.total);
  // Akzentfarbe aus dem Stein selbst – Card, Licht und Funken passen zum Edelstein
  // Seite in der Farbe der Klasse (Kontostand), Funken und Licht im Ton des Steins
  const rarity = { ...tier.rarity, color: tier.tone };
  const clsColor = CLASSES[tier.cls].color;
  const onCard = cardAccounts(state.user);
  const myAccts = PLATFORMS.map((p) => mainAccount(state.user, p.id)).filter(Boolean);
  const hidden = c.revealed === false;
  // Aufstieg in eine neue Farbklasse mit dieser Card? (Vergleich mit der Card davor)
  const prevCard = acc.cards.length > 1 ? acc.cards[acc.cards.length - 2] : null;
  const classUp = !!prevCard && classFor(prevCard.total || 0) < tier.cls;
  return {
    html: `<section class="screen screen--dark screen--card lvl-${tier.level} cls-${tier.cls}${hidden ? ' is-hidden' : ' is-open'}" style="--rar:${clsColor}">
      <div class="loot-bg" aria-hidden="true">
        <div class="loot-rays"></div>
        <svg class="loot-runes" viewBox="0 0 200 200"><defs><path id="runepath" d="M100 100m-80 0a80 80 0 1 1 160 0a80 80 0 1 1-160 0"/></defs>
          <circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="68"/>
          <text><textPath href="#runepath">FAM€ ✦ THEN THE OTHERS ✦ FAM€ ✦ THEN THE OTHERS ✦ FAM€ ✦</textPath></text></svg>
        <div class="loot-pillar"></div>
        <div class="loot-beam"><i></i></div>
        <div class="loot-ground"></div>
      </div>
      <div class="reveal-flash" data-flash aria-hidden="true"></div>
      <div class="reveal-streak" aria-hidden="true"></div>
      <canvas class="fx-canvas" data-fx aria-hidden="true"></canvas>
      ${backButton('back--dark')}
      <button class="home-btn" type="button" data-go="" aria-label="${t('Zur Startseite')}">${icons.home}</button>
      <button class="sound-btn${isMuted() ? ' is-muted' : ''}" type="button" data-sound aria-label="${t('Ton an/aus')}" aria-pressed="${!isMuted()}">${icons.sound}</button>
      <div class="card-wrap" data-tiltwrap>
        <div class="flip" data-flip role="button" tabindex="0" aria-label="${hidden ? t('Karte aufdecken') : tier.name}">
          <article class="famecard metal-${tier.metal}${tier.legend ? ' is-legend' : ''} flip-front" data-card style="--gem:${tier.tone}">
            <div class="famecard-ring" aria-hidden="true"></div>
            <div class="famecard-inner" style="--holo:${holoStrength(tier.cls)}">
              <div class="famecard-facets" aria-hidden="true">${facetArt(tier.cls, `fc${tier.cls}_`)}</div>
              <div class="famecard-holo" aria-hidden="true" style="-webkit-mask-image:url('${svgUrl(facetMask(tier.cls))}');mask-image:url('${svgUrl(facetMask(tier.cls))}')"></div>
              <div class="famecard-glint" aria-hidden="true" style="-webkit-mask-image:url('${svgUrl(facetMask(tier.cls))}');mask-image:url('${svgUrl(facetMask(tier.cls))}')"></div>
              <div class="famecard-photo"><div class="stage3d" data-diamond></div></div>
              <div class="famecard-shine" data-shine></div>
              <div class="famecard-top">
                <span class="famecard-brand">${LOGO_TEXT}${diamondSvg({ filled: true, cls: 'dia-inline' })}</span>
                <span class="famecard-serial" title="${t('Seriennummer')}">${t('Nr.')} ${c.serial}</span>
              </div>
              <div class="famecard-plate">
                <h2 class="famecard-name">${tier.name}</h2>
                <div class="famecard-rule" aria-hidden="true"><i></i>${diamondSvg({ filled: true })}<i></i></div>
                <p class="famecard-flavor">${tier.flavor}</p>
              </div>
              <div class="famecard-foot">
                ${onCard.length
                  ? `<div class="famecard-accts${onCard.length > 1 ? ' is-multi' : ''}">${onCard.map((a) => `<span class="famecard-insta">${platformIcon(a.id)}<span>${esc(a.handle)}</span></span>`).join('')}</div>`
                  : `<div class="famecard-insta">${icons.insta}<input id="card-insta" data-insta placeholder="${t('dein Instagram')}" autocomplete="off" autocapitalize="off" aria-label="${t('Instagram-Name')}"></div>`}
                <span class="seal" title="${t('Echtheitssiegel')}">${SEAL_TXT}</span>
              </div>
            </div>
          </article>
          <div class="cardback flip-back" aria-hidden="true">
            <div class="cardback-pattern"></div>
            <div class="cardback-logo">${logo('md')}</div>
            <div class="cardback-q">?</div>
            <div class="cardback-tap">${t('Tippen zum Aufdecken')}</div>
          </div>
        </div>
      </div>
      <div class="screen-foot card-actions">
        <button class="frame-nudge" type="button" data-framenudge hidden>
          <span class="frame-nudge-ring" aria-hidden="true"></span>
          <span class="frame-nudge-text"><b>${t('Neue Klasse: {c}!', { c: CLASSES[tier.cls].name })}</b>${t('Hol dir deinen neuen Profilbild-Rahmen')}</span>
          <span class="frame-nudge-go" aria-hidden="true">→</span>
        </button>
        <div class="quick-share">
          <button class="qs qs--ig" type="button" data-share="ig">${icons.insta}<span>Story</span></button>
          <button class="qs qs--tt" type="button" data-share="tt">${icons.tiktok}<span>TikTok</span></button>
          <button class="qs qs--sc" type="button" data-share="sc">${icons.snap}<span>Snap</span></button>
          <button class="qs" type="button" data-open-sheet>${icons.share}<span>${t('Mehr')}</span></button>
        </div>
        <div class="foot-links">
          <a class="link" href="#/donate">${t('Fame steigern')}</a>
          <a class="link" href="#/ranking">Ranking</a>
        </div>
      </div>
      <div class="sheet" data-sheet hidden>
        <div class="sheet-backdrop" data-close-sheet></div>
        <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${t('Card teilen')}">
          <div class="sheet-grip" aria-hidden="true"></div>
          <h2 class="sheet-title">${t('Zeig´s der Welt')}</h2>
          ${myAccts.length > 1 ? `<div class="acc-switch" aria-label="${t('Accounts auf dem Bild')}">${myAccts.map((a) => { const on = onCard.some((x) => x.id === a.id); return `<button type="button" class="acc-chip${on ? ' is-on' : ''}" data-acct="${a.id}" aria-pressed="${on}">${platformIcon(a.id)}<span>@${esc(a.handle)}</span></button>`; }).join('')}</div>` : ''}
          <div class="sheet-preview"><img data-preview alt="${t('Vorschau deiner Story')}"><span class="sheet-loading" data-loading>${t('Story wird gebaut…')}</span></div>
          <div class="sheet-actions">
            <button class="share-btn share-btn--ig" type="button" data-share="ig">${icons.insta}<span>Instagram Story</span></button>
            <button class="share-btn share-btn--tt" type="button" data-share="tt">${icons.tiktok}<span>TikTok</span></button>
            <button class="share-btn share-btn--sc" type="button" data-share="sc">${icons.snap}<span>Snapchat</span></button>
            <button class="share-btn" type="button" data-share="more">${icons.whatsapp}<span>${t('WhatsApp &amp; mehr')}</span></button>
            <button class="share-btn" type="button" data-share="save">${icons.download}<span>${t('Bild speichern')}</span></button>
            <button class="share-btn share-btn--avatar" type="button" data-avatar>${icons.user}<span>${t('Profilbild-Rahmen')}</span></button>
          </div>
          <p class="sheet-note">${t('Format 9:16 – passt für Instagram Story, TikTok, Snapchat und WhatsApp-Status.')}</p>
        </div>
      </div>
      <div class="msheet" data-needlink hidden>
        <div class="msheet-bg" data-needclose></div>
        <div class="msheet-pnl" role="dialog" aria-modal="true" aria-labelledby="needtitle">
          <div class="msheet-grip" aria-hidden="true"></div>
          <div class="msheet-big" data-needicon></div>
          <h3 id="needtitle" data-needtitle></h3>
          <p data-needtext></p>
          <button class="btn" type="button" data-needgo><span></span></button>
          <button class="link" type="button" data-needclose>${t('Abbrechen')}</button>
        </div>
      </div>
      <div class="imgview" data-imgview hidden role="dialog" aria-modal="true" aria-label="${t('Bild speichern')}">
        <button class="imgview-close" type="button" data-imgclose aria-label="${t('Schließen')}">×</button>
        <h2 class="imgview-title" data-imgtitle></h2>
        <div class="imgview-pic"><img data-imgpic alt="${t('Dein Fame-Bild')}"></div>
        <ol class="imgview-steps" data-imgsteps></ol>
        <div class="imgview-actions">
          <button class="share-btn" type="button" data-imgshare hidden>${icons.share}<span>${t('Teilen …')}</span></button>
          <a class="share-btn" data-imgdl download="fame.png">${icons.download}<span>${t('Herunterladen')}</span></a>
        </div>
      </div>
      <div class="sheet avatar-sheet" data-avsheet hidden>
        <div class="sheet-backdrop" data-close-av></div>
        <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${t('Profilbild mit Rahmen')}">
          <div class="sheet-grip" aria-hidden="true"></div>
          <h2 class="sheet-title">${t('Dein Profilbild')}</h2>
          <p class="avatar-hint">${t('Wähl ein Foto – wir legen den Rahmen deiner Klasse darüber. Danach in Instagram, TikTok oder Snapchat als Profilbild einstellen.')}</p>
          <div class="avatar-preview"><canvas data-avimg width="600" height="600" role="img" aria-label="${t('Profilbild mit Rahmen – ziehen zum Verschieben, Zoom mit zwei Fingern oder Regler')}"></canvas></div>
          <div class="avatar-zoom" data-avzoomrow hidden>
            <span aria-hidden="true">−</span>
            <input type="range" min="1" max="4" step="0.01" value="1" data-avzoom aria-label="Zoom">
            <span aria-hidden="true">+</span>
            <button class="link" type="button" data-avreset>${t('Zurücksetzen')}</button>
          </div>
          <p class="avatar-tip" data-avtip hidden>${t('Ziehen zum Verschieben · zwei Finger oder Regler zum Zoomen')}</p>
          <input type="file" accept="image/*" data-avfile hidden>
          <div class="sheet-actions">
            <button class="share-btn" type="button" data-avpick>${icons.download}<span>${t('Foto wählen')}</span></button>
            <button class="share-btn share-btn--ig" type="button" data-avsave disabled>${icons.share}<span>${t('Speichern / Teilen')}</span></button>
          </div>
        </div>
      </div>
    </section>`,
    mount(el) {
      // Foto-Look: der Stein liegt auf einem dunklen Tisch, mit Spiegelung und Bokeh
      const dia = createDiamond(el.querySelector('[data-diamond]'), {
        gem: tier, rim: rarity.color, glow: 0.3, interactive: false, photo: true,
      });
      const canvas = el.querySelector('[data-fx]');
      const fx = particles(canvas, {
        color: clsColor,
        mode: tier.level >= 2 && !hidden ? 'embers' : 'dust',
        density: hidden ? 0.5 : 0.4 + tier.level * 0.45,
      });
      const flip = el.querySelector('[data-flip]');
      const shine = el.querySelector('[data-shine]');
      const cardEl = el.querySelector('[data-card]');
      const flash = el.querySelector('[data-flash]');
      const instaInput = el.querySelector('[data-insta]');
      const timers = [];

      // Drehwinkel der Karte: 180° = verdeckt, 0° = offen. Dazu Kippen und Wackeln.
      let angle = hidden ? 180 : 0, target = angle, shake = 0, phase = hidden ? 'hidden' : 'open';
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, idle = 0;
      const setTarget = (x, y) => { tx = Math.max(-1, Math.min(1, x)); ty = Math.max(-1, Math.min(1, y)); idle = 0; };
      const loop = (now) => {
        idle += 1;
        const ax = idle > 90 ? Math.sin(now / 1300) * 0.45 : tx;
        const ay = idle > 90 ? Math.cos(now / 1700) * 0.3 : ty;
        cx += (ax - cx) * 0.08;
        cy += (ay - cy) * 0.08;
        angle += (target - angle) * 0.14;
        const jitter = shake ? (Math.random() - 0.5) * shake : 0;
        flip.style.transform = `rotateY(${angle + cx * 12 + jitter * 3}deg) rotateX(${-cy * 12}deg) translateX(${jitter}px)`;
        shine.style.setProperty('--sx', `${50 + cx * 40}%`);
        shine.style.setProperty('--sy', `${50 + cy * 40}%`);
        // Prisma-Facetten: Regenbogen und Lichtband folgen der Neigung (wie eine Holo-Karte)
        cardEl.style.setProperty('--tx', cx.toFixed(3));
        cardEl.style.setProperty('--ty', cy.toFixed(3));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const open = () => {
        if (phase !== 'hidden') return;
        phase = 'charging';
        el.classList.add('is-charging');
        fx.setColor(clsColor);
        fx.setDensity(2 + tier.level);
        stopMusic();
        const dur = buildup(boost(tier.cls) * 0.45);
        // Wackeln wird immer stärker
        const t0 = performance.now();
        const grow = setInterval(() => {
          const p = Math.min(1, (performance.now() - t0) / (dur * 1000));
          shake = 1 + p * (4 + tier.level * 2);
          el.style.setProperty('--charge', p.toFixed(2));
        }, 30);
        timers.push(grow);
        timers.push(setTimeout(() => {
          clearInterval(grow);
          shake = 0;
          phase = 'open';
          target = 0;
          el.classList.remove('is-charging', 'is-hidden');
          el.classList.add('is-open', 'is-revealing');
          flash.classList.add('is-on');
          stopMusic = HOMAGE[tier.stage] ? themeReveal(HOMAGE[tier.stage]) : revealMusic(tier.cls);
          dia.pulse();
          const [x, y] = centerIn(canvas, flip);
          fx.burst(x, y, 40 + tier.level * 40, rarity.color);
          if (tier.level >= 3) timers.push(setTimeout(() => fx.burst(x, y - 60, 60, '#ffffff'), 350));
          fx.setDensity(0.4 + tier.level * 0.45);
          c.revealed = true;
          c.stage = tier.stage;
          saveAccount();
          // Look sofort auf die neue Stufe umstellen: Hommage-Thema erst jetzt (Stein ist aufgedeckt),
          // und nach einer Hommage-Stufe zurück zum normalen Look der Klasse
          luxify(el, 'card');
          flip.setAttribute('aria-label', tier.name);
          if (needsFrame()) timers.push(setTimeout(showFrameNudge, 1800));
        }, dur * 1000));
      };
      flip.addEventListener('click', open);

      // Musik: verdeckt eine Spannungsschleife, aufgedeckt die Gewinn-Schleife – solange die Seite offen ist
      let stopMusic = () => {};
      const playMusic = () => {
        stopMusic();
        if (phase === 'hidden') stopMusic = startTension(tier.cls);
        else if (phase === 'open') stopMusic = HOMAGE[tier.stage] ? themeLoop(HOMAGE[tier.stage]) : startCelebration(tier.cls);
      };
      playMusic();
      const soundBtn = el.querySelector('[data-sound]');
      soundBtn.addEventListener('click', () => {
        setMuted(!isMuted());
        soundBtn.classList.toggle('is-muted', isMuted());
        soundBtn.setAttribute('aria-pressed', String(!isMuted()));
        if (isMuted()) stopMusic(); else playMusic();
      });
      const onVisible = () => { if (document.hidden) stopMusic(); else if (phase !== 'charging') playMusic(); };
      document.addEventListener('visibilitychange', onVisible);

      flip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });

      instaInput?.addEventListener('change', () => {
        if (state.user) {
          const h = cleanHandle(instaInput.value);
          saveUser({ ...state.user, accounts: { ...state.user.accounts, ig: h }, onCard: h ? ['ig'] : state.user.onCard });
        }
      });

      const onOrient = (e) => {
        if (e.gamma == null) return;
        setTarget(e.gamma / 30, (e.beta - 45) / 30);
      };
      const wrap = el.querySelector('[data-tiltwrap]');
      const onMove = (e) => {
        const r = wrap.getBoundingClientRect();
        setTarget(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
      };
      window.addEventListener('deviceorientation', onOrient);
      wrap.addEventListener('pointermove', onMove);

      // Sharing-Bilder werden erst gebaut, wenn sie gebraucht werden, und dann wiederverwendet.
      // Accounts auf dem Bild: wie auf der Card, im Teilen-Fenster an- und abwählbar (Instagram, TikTok, Snapchat)
      let shareIds = onCard.map((a) => a.id);
      const shareAccts = () => shareIds.map((id) => mainAccount(state.user, id)).filter(Boolean);
      const shareData = () => ({ tier, serial: c.serial, accts: shareAccts(), gem: dia.snapshot(900, 760) });
      let cache = {};
      const memo = (key, make) => () => (cache[key] ||= make(shareData()));
      const assets = { story: memo('story', renderStory), sticker: memo('sticker', renderSticker) };
      instaInput?.addEventListener('change', () => { cache = {}; shareIds = cardAccounts(state.user).map((a) => a.id); });

      const sheet = el.querySelector('[data-sheet]');
      const preview = el.querySelector('[data-preview]');
      let previewUrl = '';
      const openSheet = async () => {
        sheet.hidden = false;
        requestAnimationFrame(() => sheet.classList.add('is-open'));
        if (!previewUrl) {
          const story = await assets.story();
          previewUrl = story.toDataURL('image/jpeg', 0.85);
          preview.src = previewUrl;
          el.querySelector('[data-loading]').hidden = true;
        }
      };
      const closeSheet = () => {
        sheet.classList.remove('is-open');
        setTimeout(() => { sheet.hidden = true; }, 300);
      };
      el.querySelector('[data-open-sheet]').addEventListener('click', openSheet);
      el.querySelectorAll('[data-acct]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.acct;
        const on = shareIds.includes(id);
        if (on && shareIds.length === 1) return; // mindestens ein Account bleibt drauf
        shareIds = on ? shareIds.filter((x) => x !== id) : PLATFORMS.map((p) => p.id).filter((x) => x === id || shareIds.includes(x));
        b.classList.toggle('is-on', !on);
        b.setAttribute('aria-pressed', String(!on));
        cache = {};
        previewUrl = '';
        el.querySelector('[data-loading]').hidden = false;
        buzz(8);
        openSheet();
      }));
      el.querySelector('[data-close-sheet]').addEventListener('click', closeSheet);

      // Bildansicht: Bild groß zeigen, gedrückt halten zum Sichern, dazu die Schritte für die Plattform
      const imgView = el.querySelector('[data-imgview]');
      const HOLD = t('Halte das Bild gedrückt und tipp auf <b>„Zu Fotos hinzufügen“</b> (iPhone) bzw. <b>„Bild herunterladen“</b> (Android).');
      const GUIDE = {
        save: { title: t('Bild speichern'), steps: [HOLD] },
        ig: { title: t('In deine Instagram Story'), steps: [HOLD, t('Öffne Instagram, wisch nach rechts oder tipp auf <b>+ → Story</b>.'), t('Wähl das Bild aus deiner Galerie und tipp auf <b>Deine Story</b>.')] },
        tt: { title: t('Auf TikTok posten'), steps: [HOLD, t('Öffne TikTok und tipp auf <b>+ → Hochladen</b>.'), t('Wähl das Foto, schreib was dazu und poste es.')] },
        sc: { title: t('In deine Snapchat Story'), steps: [HOLD, t('Öffne Snapchat und wisch nach oben zu den <b>Erinnerungen → Kamerarolle</b>.'), t('Wähl das Bild, tipp auf <b>Senden an → Meine Story</b>.')] },
        more: { title: t('WhatsApp & mehr'), steps: [HOLD, t('Öffne WhatsApp und tipp auf <b>Status → Foto</b> – oder schick es direkt an Freunde.')] },
        avatar: { title: t('Dein Profilbild'), steps: [HOLD, t('Instagram: <b>Profil → Profil bearbeiten → Bild ändern</b>.'), t('TikTok: <b>Profil → Profil bearbeiten → Foto ändern</b>. Snapchat: <b>Profil → Profilbild</b>.')] },
      };
      let imgUrl = '';
      const openImageView = async (cv, kind, name) => {
        const g = GUIDE[kind] || GUIDE.save;
        el.querySelector('[data-imgtitle]').textContent = g.title;
        el.querySelector('[data-imgsteps]').innerHTML = g.steps.map((x) => `<li>${x}</li>`).join('');
        el.querySelector('[data-imgpic]').src = cv.toDataURL('image/png');
        const shareBtn = el.querySelector('[data-imgshare]');
        shareBtn.hidden = true;
        imgView.hidden = false;
        requestAnimationFrame(() => imgView.classList.add('is-open'));
        const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
        if (imgUrl) URL.revokeObjectURL(imgUrl);
        imgUrl = URL.createObjectURL(blob);
        const dl = el.querySelector('[data-imgdl]');
        dl.href = imgUrl;
        dl.download = name;
        const file = new File([blob], name, { type: 'image/png' });
        shareBtn.hidden = !navigator.canShare?.({ files: [file] });
        shareBtn.onclick = () => navigator.share({ files: [file], title: APP_NAME }).catch((err) => { if (err?.name !== 'AbortError') toast(t('Teilen geht hier nicht – halte das Bild gedrückt zum Sichern.')); });
      };
      const closeImageView = () => { imgView.classList.remove('is-open'); setTimeout(() => { imgView.hidden = true; }, 250); };
      el.querySelector('[data-imgclose]').addEventListener('click', closeImageView);

      const ACTIONS = { ig: shareToInstagramStory, tt: shareToTikTok, sc: shareToSnapchat, more: shareElsewhere, save: saveImage };
      let busy = false;
      // Posten in Insta, TikTok oder Snapchat geht nur mit verbundenem Account – sonst erst verbinden
      const need = el.querySelector('[data-needlink]');
      const openNeed = (id) => {
        const n = platformName(id);
        need.querySelector('[data-needicon]').innerHTML = platformIcon(id);
        need.querySelector('[data-needtitle]').textContent = t('{n} noch nicht verbunden', { n });
        need.querySelector('[data-needtext]').textContent = t('Verbinde zuerst deinen {n}-Account – dann postest du deine Card direkt in deine Story.', { n });
        need.querySelector('[data-needgo] span').textContent = t('Jetzt mit {n} verbinden', { n });
        need.dataset.id = id;
        need.hidden = false;
        requestAnimationFrame(() => need.classList.add('is-open'));
        buzz(15);
      };
      const closeNeed = () => { need.classList.remove('is-open'); setTimeout(() => { need.hidden = true; }, 250); };
      need.querySelectorAll('[data-needclose]').forEach((b) => b.addEventListener('click', closeNeed));
      need.querySelector('[data-needgo]').addEventListener('click', () => {
        state.after = 'card';
        state.focusPlatform = need.dataset.id;
        go('accounts');
      });

      el.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', async () => {
        if (busy) return;
        if (['ig', 'tt', 'sc'].includes(b.dataset.share) && !isLinked(state.user, b.dataset.share)) {
          closeSheet();
          openNeed(b.dataset.share);
          return;
        }
        busy = true;
        b.classList.add('is-busy');
        try {
          const data = { tier, serial: c.serial, accts: shareAccts() };
          const res = await ACTIONS[b.dataset.share](data, assets);
          if (res.how === 'native' || res.how === 'sheet') { closeSheet(); buzz(15); }
          if (res.how === 'manual') { closeSheet(); await openImageView(await assets.story(), res.platform, `fame-${c.serial}.png`); }
          if (res.hint) toast(res.hint);
        } catch {
          toast(t('Teilen hat nicht geklappt. Speicher das Bild und lade es selbst hoch.'));
        } finally {
          busy = false;
          b.classList.remove('is-busy');
        }
      }));

      // Profilbild-Rahmen: Foto wählen, Ring der Klasse drüberlegen, speichern oder teilen
      const avSheet = el.querySelector('[data-avsheet]');
      const avImg = el.querySelector('[data-avimg]');
      const avFile = el.querySelector('[data-avfile]');
      const avSave = el.querySelector('[data-avsave]');
      const avCls = classFor(acc.total);
      let avReady = false;
      let avGem = null;
      // Eigener Stein fürs Abzeichen: einmal im Foto-Licht ohne Bühne rendern und freistellen
      const gemCutout = () => {
        if (avGem) return avGem;
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:-9999px;top:0;width:300px;height:300px;';
        document.body.appendChild(box);
        const d = createDiamond(box, { gem: tier, photo: true, bare: true, interactive: false, autoRotate: false, glow: 0 });
        const shot = d.snapshot(640, 640);
        d.dispose();
        box.remove();
        if (!shot) return null;
        const px = shot.getContext('2d').getImageData(0, 0, shot.width, shot.height).data;
        let x0 = shot.width, y0 = shot.height, x1 = 0, y1 = 0;
        for (let y = 0; y < shot.height; y++) {
          for (let x = 0; x < shot.width; x++) {
            if (px[(y * shot.width + x) * 4 + 3] > 10) {
              if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        if (x1 <= x0) return null;
        const out = document.createElement('canvas');
        out.width = x1 - x0 + 1;
        out.height = y1 - y0 + 1;
        out.getContext('2d').drawImage(shot, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
        avGem = out;
        return out;
      };

      // Erinnerung an den neuen Rahmen: bei einem Klassenaufstieg, oder solange der zuletzt
      // erstellte Rahmen aus einer niedrigeren Klasse stammt. Verschwindet, sobald der neue gespeichert ist.
      const nudgeBtn = el.querySelector('[data-framenudge]');
      const frameCls = store.get('frameCls', null);
      const needsFrame = () => (frameCls === null ? classUp : frameCls < avCls);
      const showFrameNudge = () => {
        nudgeBtn.hidden = false;
        requestAnimationFrame(() => nudgeBtn.classList.add('is-in'));
        plink(tier.level);
      };
      if (!hidden && needsFrame()) showFrameNudge();
      // Ausschnitt: verschieben (ziehen), zoomen (zwei Finger, Mausrad oder Regler)
      let avPhoto = null;
      const view = { zoom: 1, x: 0, y: 0 };
      const zoomInput = el.querySelector('[data-avzoom]');
      let drawQueued = false;
      const drawPreview = () => {
        if (drawQueued) return;
        drawQueued = true;
        requestAnimationFrame(() => {
          drawQueued = false;
          const prev = renderAvatar(avPhoto, avCls, gemCutout(), view, avImg.width);
          avImg.getContext('2d').clearRect(0, 0, avImg.width, avImg.height);
          avImg.getContext('2d').drawImage(prev, 0, 0);
        });
      };
      const clampView = () => {
        if (!avPhoto) return;
        view.zoom = Math.max(1, Math.min(4, view.zoom));
        const r = photoRect(avPhoto, 1, view);
        view.x = Math.max(-r.mx, Math.min(r.mx, view.x));
        view.y = Math.max(-r.my, Math.min(r.my, view.y));
        zoomInput.value = view.zoom;
      };
      const showAvatar = (photo) => {
        avPhoto = photo;
        Object.assign(view, { zoom: 1, x: 0, y: 0 });
        zoomInput.value = 1;
        el.querySelector('[data-avzoomrow]').hidden = !photo;
        el.querySelector('[data-avtip]').hidden = !photo;
        avImg.classList.toggle('is-movable', !!photo);
        avReady = true;
        drawPreview();
        avSave.disabled = !photo;
      };
      const pointers = new Map();
      let pinch = null;
      avImg.addEventListener('pointerdown', (e) => {
        if (!avPhoto) return;
        avImg.setPointerCapture?.(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
        }
      });
      avImg.addEventListener('pointermove', (e) => {
        const prev = pointers.get(e.pointerId);
        if (!prev || !avPhoto) return;
        const cur = { x: e.clientX, y: e.clientY };
        pointers.set(e.pointerId, cur);
        const box = avImg.getBoundingClientRect().width;
        if (pointers.size === 2 && pinch) {
          const [a, b] = [...pointers.values()];
          view.zoom = pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
        } else if (pointers.size === 1) {
          view.x += (cur.x - prev.x) / box;
          view.y += (cur.y - prev.y) / box;
        }
        clampView();
        drawPreview();
      });
      const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
      avImg.addEventListener('pointerup', release);
      avImg.addEventListener('pointercancel', release);
      avImg.addEventListener('wheel', (e) => {
        if (!avPhoto) return;
        e.preventDefault();
        view.zoom *= e.deltaY < 0 ? 1.08 : 1 / 1.08;
        clampView();
        drawPreview();
      }, { passive: false });
      zoomInput.addEventListener('input', () => { view.zoom = +zoomInput.value; clampView(); drawPreview(); });
      el.querySelector('[data-avreset]').addEventListener('click', () => { Object.assign(view, { zoom: 1, x: 0, y: 0 }); zoomInput.value = 1; drawPreview(); });
      const openAvatar = () => {
        closeSheet();
        avSheet.hidden = false;
        requestAnimationFrame(() => avSheet.classList.add('is-open'));
        if (!avReady) showAvatar(null);
      };
      el.querySelector('[data-avatar]').addEventListener('click', openAvatar);
      nudgeBtn.addEventListener('click', openAvatar);
      el.querySelector('[data-close-av]').addEventListener('click', () => {
        avSheet.classList.remove('is-open');
        setTimeout(() => { avSheet.hidden = true; }, 300);
      });
      el.querySelector('[data-avpick]').addEventListener('click', () => avFile.click());
      avFile.addEventListener('change', () => {
        const f = avFile.files?.[0];
        if (!f) return;
        const img = new Image();
        img.onload = () => { showAvatar(img); URL.revokeObjectURL(img.src); };
        img.onerror = () => toast(t('Das Foto konnte nicht geladen werden.'));
        img.src = URL.createObjectURL(f);
      });
      avSave.addEventListener('click', async () => {
        if (!avPhoto) return;
        const cv = renderAvatar(avPhoto, avCls, gemCutout(), view);
        const how = await saveAvatar(cv, c.serial);
        if (how !== 'cancelled') {
          store.set('frameCls', avCls);
          nudgeBtn.hidden = true;
        }
        if (how === 'manual') openImageView(cv, 'avatar', `fame-profilbild-${c.serial}.png`);
      });

      return () => {
        timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
        stopMusic();
        document.removeEventListener('visibilitychange', onVisible);
        cancelAnimationFrame(raf);
        window.removeEventListener('deviceorientation', onOrient);
        fx.dispose();
        dia.dispose();
      };
    },
  };
}

// ---- Ranking: zwei Seiten (Bundesland / Länder) --------------------------------

// Deutschland als Kachelkarte: jede Kachel ein Bundesland, grob an seiner Lage.
const DE_TILES = {
  'Schleswig-Holstein': ['SH', 1, 0], 'Mecklenburg-Vorpommern': ['MV', 2, 0],
  Bremen: ['HB', 0, 1], Hamburg: ['HH', 1, 1], Brandenburg: ['BB', 2, 1], Berlin: ['BE', 3, 1],
  'Nordrhein-Westfalen': ['NW', 0, 2], Niedersachsen: ['NI', 1, 2], 'Sachsen-Anhalt': ['ST', 2, 2], Sachsen: ['SN', 3, 2],
  'Rheinland-Pfalz': ['RP', 0, 3], Hessen: ['HE', 1, 3], 'Thüringen': ['TH', 2, 3],
  Saarland: ['SL', 0, 4], 'Baden-Württemberg': ['BW', 1, 4], Bayern: ['BY', 2, 4],
};

const initials = (h) => (h.replace(/[^a-zA-Z]/g, '').slice(0, 2) || '?').toUpperCase();
const avatar = (r, cls = '') => `<span class="avatar ${cls}" style="--c:${tierFor(r.amount).css}">${esc(initials(r.handle))}</span>`;

// Ranking-Fenster: einmal Land, Bundesland und den Namen (mind. eine verbundene Plattform) wählen.
// Danach geht „Ranking“ direkt in die Rangliste; ändern lässt sich alles über ⚙.
function joinSheet() {
  const u = state.user;
  const joined = !!u.ranking?.joined;
  const c = u.ranking?.country || u.country || HOME_COUNTRY;
  return `<div class="msheet msheet--join" data-join${joined || state.joinDismissed ? ' hidden' : ''}>
    <div class="msheet-bg" data-joinclose></div>
    <form class="msheet-pnl join-form" role="dialog" aria-modal="true" aria-labelledby="jointitle" novalidate>
      <div class="msheet-grip" aria-hidden="true"></div>
      <h3 id="jointitle">🏆 ${joined ? t('Ranking-Einstellungen') : t('Beim Ranking mitmachen')}</h3>
      <p class="msheet-lead">${joined ? t('Wo und mit welchem Namen du im Ranking stehst.') : t('Einmal kurz einrichten – danach landest du direkt im Ranking.')}</p>
      <div class="field-row">
        <label class="field"><span>${t('Land')}</span><select name="country">${COUNTRIES.map((x) => `<option value="${x.id}"${x.id === c ? ' selected' : ''}>${x.flag} ${x.name}</option>`).join('')}</select></label>
        <label class="field"><span>${t('Bundesland')}</span><select name="region">${regionOptions(c, u.ranking?.region || u.region)}</select></label>
      </div>
      <div class="sec">${t('Mit welchem Namen?')}<small>${t('Tipp den Namen an, der im Ranking stehen soll – mit Symbol davor.')}</small></div>
      <div data-joinlist></div>
      <div class="req" data-req></div>
      <button class="btn" type="submit"><span>${joined ? t('Speichern') : t('Mitmachen')}</span></button>
      <p class="msheet-once">${joined ? `<button class="link" type="button" data-leave>${t('Nicht mehr im Ranking zeigen')}</button>` : t('Das Fenster kommt nur einmal. Ändern kannst du alles später über ⚙.')}</p>
    </form>
  </div>`;
}

function mountJoin(el) {
  const sheet = el.querySelector('[data-join]');
  const form = sheet.querySelector('form');
  const btn = form.querySelector('[type="submit"]');
  const req = sheet.querySelector('[data-req]');
  const open = () => { sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('is-open')); };
  const close = () => { state.joinDismissed = true; sheet.classList.remove('is-open'); setTimeout(() => { sheet.hidden = true; }, 250); };
  if (!sheet.hidden) requestAnimationFrame(() => sheet.classList.add('is-open'));
  form.country.addEventListener('change', () => { form.region.innerHTML = regionOptions(form.country.value); });
  const ctl = mountConnect(sheet.querySelector('[data-joinlist]'), {
    get: () => state.user, set: saveUser, card: false, pickMode: true, pick: state.user.ranking?.platform, back: 'ranking',
    onChange: (picked) => {
      const ok = !!picked;
      btn.disabled = !ok;
      req.classList.toggle('is-ok', ok);
      req.innerHTML = ok
        ? `<span>${t('✓ Du erscheinst als {name}.', { name: `${platIcon(picked)}<b>@${esc(state.user.accounts[picked])}</b>` })}</span>`
        : `<span>${t('⚠️ Verbinde mindestens eine Plattform, damit jeder sieht, dass dein Name echt ist.')}</span>`;
    },
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ctl.picked) { buzz(30); return; }
    const country = form.country.value;
    const region = form.region.value;
    const first = !state.user.ranking?.joined;
    saveUser({ ...state.user, country, region, ranking: { joined: true, country, region, platform: ctl.picked } });
    state.rankView = {};
    toast(first ? t('Du bist im Ranking ✓') : t('Gespeichert ✓'));
    buzz([10, 40, 10]);
    render();
  });
  sheet.querySelectorAll('[data-joinclose]').forEach((b) => b.addEventListener('click', close));
  sheet.querySelector('[data-leave]')?.addEventListener('click', () => {
    saveUser({ ...state.user, ranking: { ...state.user.ranking, joined: false } });
    toast(t('Du stehst nicht mehr im Ranking.'));
    go('');
  });
  el.querySelector('[data-joinopen]')?.addEventListener('click', open);
  return { dispose() {} };
}

function rankingPage(mode) {
  const me = meEntry();
  const userCountry = state.user?.ranking?.country || state.user?.country || HOME_COUNTRY;
  const userRegion = state.user?.ranking?.region || state.user?.region;
  const view = state.rankView;
  const country = countryById(view.country || userCountry);
  const region = mode === 'region'
    ? (country.regions.includes(view.region) ? view.region
      : country.regions.includes(userRegion) ? userRegion : country.regions[0])
    : null;

  const list = standings({ country: country.id, region, me });
  const top = list.slice(0, 20);
  const mine = list.find((r) => r.me);
  const groups = mode === 'region'
    ? groupTotals('region', { country: country.id, me })
    : groupTotals('country', { me });
  const maxGroup = groups[0]?.amount || 1;
  const sum = list.reduce((s, r) => s + r.amount, 0);
  const podium = [top[1], top[0], top[2]];
  const PODIUM_RAR = [RARITIES[4], RARITIES[3], RARITIES[2]]; // Platz 1, 2, 3

  const row = (r) => {
    const g = tierFor(r.amount);
    return `<li class="rrow${r.me ? ' rrow--me' : ''}" style="--rar:${g.css}">
      <span class="rrow-rank">${fmt(r.rank)}</span>
      ${avatar(r)}
      <span class="rrow-name">${platIcon(r.platform)}@${esc(r.handle)}<small>${t('Edelstein')} · ${t('Stufe {n}', { n: g.stage })}</small></span>
      <span class="rrow-amount">${money(r.amount)}</span>
    </li>`;
  };

  // Duell: Kachelkarte für Deutschland, sonst Balken. Farbe: eine Farbe, je mehr Geld desto heller.
  const groupName = (g) => (mode === 'region' ? regionName(g.id) : `${countryById(g.id).flag} ${countryById(g.id).name}`);
  const isMyGroup = (g) => (mode === 'region' ? g.id === me?.region : g.id === me?.country);
  const tileMap = mode === 'region' && country.id === 'DE'
    ? `<div class="tilemap" role="list">
        ${groups.map((g) => {
          const [code, col, rowIdx] = DE_TILES[g.id] || ['?', 0, 0];
          const share = g.amount / maxGroup;
          return `<button class="tile${g.id === region ? ' is-active' : ''}${isMyGroup(g) ? ' is-mine' : ''}" type="button" role="listitem"
            data-region="${esc(g.id)}" style="grid-column:${col + 1};grid-row:${rowIdx + 1};--t:${(0.12 + share * 0.88).toFixed(2)}"
            title="${esc(g.id)}: ${money(g.amount)} · ${t('Platz {n}', { n: g.rank })}">
            <b>${code}</b><small>${shortMoney(g.amount)}</small><i>${g.rank}.</i></button>`;
        }).join('')}
        <div class="tilemap-legend" aria-hidden="true"><span>${t('weniger')}</span><i></i><span>${t('mehr')}</span></div>
      </div>`
    : '';
  const bars = `<ol class="duel-list">${groups.slice(0, tileMap ? 5 : 12).map((g) => `<li class="duel-row${isMyGroup(g) ? ' is-mine' : ''}">
      <span class="duel-rank">${g.rank <= 3 ? `<span class="medal medal--${g.rank}">${g.rank}</span>` : g.rank}</span>
      <span class="duel-name">${esc(groupName(g))}</span>
      <span class="duel-bar"><i style="width:${Math.max(3, (g.amount / maxGroup) * 100)}%"></i></span>
      <span class="duel-amount">${shortMoney(g.amount)}</span>
    </li>`).join('')}</ol>`;

  return {
    html: `<section class="screen screen--dark screen--ranking" style="--rar:${state.account.total ? CLASSES[classFor(state.account.total)].color : RARITIES[4].color}">
      <canvas class="fx-canvas" data-fx aria-hidden="true"></canvas>
      ${backButton('back--dark')}
      ${state.user ? `<button class="rank-gear" type="button" data-joinopen aria-label="${t('Ranking-Einstellungen')}">${icons.gear}</button>` : ''}
      <nav class="rank-tabs" aria-label="Ranking">
        <a href="#/ranking/region" class="${mode === 'region' ? 'is-active' : ''}">${t('Bundesland')}</a>
        <a href="#/ranking/country" class="${mode === 'country' ? 'is-active' : ''}">${t('Länder')}</a>
      </nav>
      <header class="rank-head">
        <span class="rank-flag">${country.flag}</span>
        <h1>${esc(region ? regionName(region) : country.name)}</h1>
      </header>
      <div class="stat-tiles">
        <div class="stat"><b>${fmt(list.length)}</b><span>${t('Spieler')}</span></div>
        <div class="stat"><b>${shortMoney(sum)}</b><span>${t('Gesamt')}</span></div>
        <div class="stat stat--me"><b>${mine ? `#${fmt(mine.rank)}` : '–'}</b><span>${t('Dein Platz')}</span></div>
      </div>
      <div class="chips" role="tablist">
        ${mode === 'region'
          ? country.regions.map((r) => `<button class="chip${r === region ? ' is-active' : ''}" type="button" data-region="${esc(r)}">${esc(regionName(r))}</button>`).join('')
          : COUNTRIES.map((c) => `<button class="chip${c.id === country.id ? ' is-active' : ''}" type="button" data-country="${c.id}">${c.flag} ${c.name}</button>`).join('')}
      </div>
      <div class="podium3">
        <div class="podium-beams" aria-hidden="true"></div>
        ${podium.map((p, k) => {
          if (!p) return '<div class="pstep"></div>';
          const place = [2, 1, 3][k];
          const rar = PODIUM_RAR[place - 1];
          return `<div class="pstep pstep--${place}${p.me ? ' is-me' : ''}" style="--rar:${rar.color}">
            ${place === 1 ? `<span class="pcrown">${icons.crown}</span>` : ''}
            ${avatar(p, 'avatar--big')}
            <span class="pname">${platIcon(p.platform)}@${esc(p.handle)}</span>
            <span class="pamount">${shortMoney(p.amount)}</span>
            <div class="pblock"><span>${place}</span></div>
          </div>`;
        }).join('')}
      </div>
      <ol class="rlist">${top.slice(3).map(row).join('')}</ol>
      ${mine && mine.rank > 20 ? `<div class="rows-gap">…</div><ol class="rlist">${row(mine)}</ol>` : ''}
      <section class="duel">
        <h2>${mode === 'region' ? t('{c}: Bundesländer-Duell', { c: country.name }) : t('Länder-Duell')}</h2>
        ${tileMap}
        ${bars}
      </section>
      <div class="mebar">
        ${myCardButton()}
        ${mine
          ? `<div><b>${t('Platz {n}', { n: fmt(mine.rank) })}</b> ${t('in')} ${esc(region ? regionName(region) : country.name)}<small>${money(mine.amount)} · ${t('Stufe {n}', { n: tierFor(mine.amount).stage })}</small></div>`
          : `<div><b>${state.user ? t('Noch nicht dabei') : t('Du fehlst noch')}</b><small>${t('Zahl ein und steig ins Ranking ein')}</small></div>`}
        ${button(mine ? t('Fame steigern') : t('Steig ein'), 'data-go="donate"')}
      </div>
      ${state.user ? joinSheet() : ''}
    </section>`,
    mount(el) {
      const join = state.user ? mountJoin(el) : null;
      const fx = particles(el.querySelector('[data-fx]'), { color: '#ffb35c', mode: 'embers', density: 0.5 });
      el.querySelectorAll('[data-region]').forEach((b) => b.addEventListener('click', () => {
        state.rankView = { country: country.id, region: b.dataset.region };
        render();
      }));
      el.querySelectorAll('[data-country]').forEach((b) => b.addEventListener('click', () => {
        state.rankView = { country: b.dataset.country };
        render();
      }));
      const chips = el.querySelector('.chips');
      const active = chips.querySelector('.chip.is-active');
      if (active) chips.scrollLeft = active.offsetLeft - chips.clientWidth / 2 + active.clientWidth / 2;
      return () => { fx.dispose(); join?.dispose(); };
    },
  };
}

// ---- Start ------------------------------------------------------------------------------------

// Zurück von Apple/Google oder einem Mail-Link? Erst die Adresse aufräumen, dann zeichnen.
const urlReturn = auth.takeUrlReturn();
render();

async function boot() {
  if (urlReturn?.error) toast(auth.text({ code: urlReturn.code, message: urlReturn.error }));
  let session = null;
  if (urlReturn?.access_token) {
    const r = await auth.applyUrlReturn(urlReturn);
    if (r.error) toast(r.error);
    session = r.session;
    if (session) markAlive();
  }
  if (!session) {
    const r = await auth.getSession();
    if (r.error) return; // keine Verbindung: der lokale Stand bleibt
    session = r.session;
  }
  // „Angemeldet bleiben“ war aus: beim nächsten Öffnen der App wieder abmelden
  let alive = false;
  try { alive = !!sessionStorage.getItem('fame.alive'); } catch { /* privat */ }
  if (session && store.get('keep') === false && !alive) { await auth.signOut(); session = null; }
  if (!session) {
    if (state.user) { clearLocal(); render(); }
    return;
  }
  markAlive();
  const before = JSON.stringify([state.user, state.account]);
  await startSession(session);
  const path = location.hash.replace(/^#\/?/, '');
  if (urlReturn?.type === 'recovery') { render(); return; }
  if (!state.user.done) { goOrRender('finish'); return; }
  if (urlReturn?.access_token) {
    toast(urlReturn.type === 'signup' ? t('E-Mail bestätigt ✓ Willkommen bei Fam€!') : t('Angemeldet ✓'));
    afterAuth();
    return;
  }
  // Neuer Stand vom Server: neu zeichnen, außer man tippt gerade in einem Formular
  if (JSON.stringify([state.user, state.account]) !== before && !['login', 'register', 'accounts', 'finish', 'reset'].includes(path)) render();
}

// Zurück von der Anmeldung bei TikTok oder Instagram? Den bestätigten Namen eintragen.
async function finishConnect() {
  const r = await finishRedirect();
  if (!r) return;
  const id = r.id || 'tt';
  const n = platformName(id);
  if (r.profile) {
    const add = (u) => {
      const x = structuredClone(u || {});
      x.accounts = { ...(x.accounts || {}), [id]: cleanHandle(r.profile.handle) };
      x.verified = { ...(x.verified || {}), [id]: { name: r.profile.name, avatar: r.profile.avatar, externalId: r.profile.externalId } };
      if (!x.onCard?.length) x.onCard = [id];
      return x;
    };
    if (state.user) saveUser(add(state.user));
    else { state.regDraft = add(r.draft || state.regDraft); saveDraft(); }
    toast(t('{n} verbunden ✓', { n }));
  } else {
    toast(r.error === 'denied' ? t('{n}: Anmeldung abgebrochen.', { n })
      : r.error === 'business' ? t('Instagram verbindet nur Business- oder Creator-Konten. Trag deinen Namen solange selbst ein.')
        : `${t('{n}-Verbindung hat nicht geklappt. Versuch es nochmal.', { n })}${r.detail ? ` (${r.detail})` : ''}`);
  }
  render();
}

boot().catch((e) => console.warn('Anmeldung:', e)).finally(() => finishConnect());

// Offline-Cache. Neue Versionen sollen auch in der App vom Home-Bildschirm sofort ankommen:
// beim Start und bei jeder Rückkehr in die App nach einem Update fragen; ist eins da, einmal neu laden.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 5 * 60 * 1000);
  }).catch(() => {});
}
