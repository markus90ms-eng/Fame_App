// Fame – App-Shell, Router und Screens.

import {
  TIERS, GEM_COUNT, RARITIES, CLASSES, classFor, PIN_FROM, COUNTRIES, countryById, tierFor, nextTier, fmt, money,
  amountFromPos, posFromAmount, rankFor, standings, groupTotals, makeSerial, lookupSerial, normalizeSerial, sampleSerial,
  MAX_AMOUNT, MIN_AMOUNT, PLATFORMS, normalizeUser, mainAccount, cardAccounts,
} from './data.js';
import {
  APP_NAME, LOGO_TEXT, DIA, esc, logo, logoInline, hl, hero, button, backButton, diamondSvg,
  diamondShadowed, icons, platformIcon,
} from './ui.js';
import { tick, plink, stageTick, classDrop, buzz, unlockAudio, buildup, boost, startTension, revealMusic, startCelebration, isMuted, setMuted } from './fx.js';
import { createDiamond } from './diamond3d.js';
import { facetArt, facetMask, svgUrl, holoStrength } from './cardfx.js';
import { particles } from './particles.js';
import { isReady, mountSnap, connectRedirect, finishRedirect } from './connect.js';
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
export const APP_VERSION = '48';

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

function render() {
  const path = location.hash.replace(/^#\/?/, '');
  const screen = routes[path] || (path.startsWith('check/') ? () => checkPage(decodeURIComponent(path.slice(6))) : splash);
  cleanup?.();
  cleanup = null;
  const { html, mount } = screen();
  app.innerHTML = html;
  const el = app.firstElementChild;
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
const priceRange = (t) => { const next = TIERS.find((x) => x.stage === t.stage + 1); return next ? `${money(t.min)} – ${money(next.min - 1)}` : `ab ${money(t.min)}`; };
const shortMoney = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio. €`
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
    handle: u.accounts?.[pid] || displayName(u) || 'du',
    platform: pid,
    amount: state.account.total,
    country: u.ranking.country || u.country || 'DE',
    region: u.ranking.region || u.region || '',
  };
}

// ---- Screens ----------------------------------------------------------------

// Testphase: alles auf diesem Gerät löschen und wieder bei 0 € anfangen
const hasData = () => !!(state.user || state.account.total || state.account.cards?.length);
const resetLink = () => (hasData() ? '<button class="link welcome-reset" type="button" data-reset>Alles zurücksetzen</button>' : '');
function bindReset(el) {
  // Eigene Rückfrage statt confirm(): in eingebetteten Ansichten werden Browser-Dialoge oft blockiert
  let armed = 0;
  el.querySelector('[data-reset]')?.addEventListener('click', (e) => {
    const link = e.currentTarget;
    if (Date.now() - armed > 4000) {
      armed = Date.now();
      link.textContent = 'Wirklich alles löschen? Nochmal tippen';
      link.classList.add('is-armed');
      buzz(20);
      setTimeout(() => {
        if (Date.now() - armed >= 4000) { link.textContent = 'Alles zurücksetzen'; link.classList.remove('is-armed'); }
      }, 4100);
      return;
    }
    ['account', 'amount', 'donation'].forEach((k) => store.remove(k));
    if (!state.user) { store.remove('user'); store.remove('regdraft'); state.regDraft = { accounts: {}, verified: {}, onCard: [] }; }
    state.account = { total: 0, deposits: [], cards: [] };
    saveAccount();
    state.amount = 100;
    state.accepted = false;
    toast('Alles zurückgesetzt – du startest wieder bei 0 €.');
    render();
  });
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
    const hi = !own ? 'hol dir deine erste Card.' : open ? 'deine Card wartet.' : 'deine Card liegt noch verdeckt da.';
    const main = !own ? button('Erste Card holen', 'data-go="donate"') : button(open ? 'Meine Card' : 'Card aufdecken', 'data-go="card"');
    const tile = (go, icon, title, sub) => `<a class="hub-tile" href="#/${go}"><span class="hub-ico">${icon}</span><b>${title}</b><small>${sub}</small></a>`;
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
        <p class="welcome-hi">Hey ${esc(displayName(state.user) || 'du')} – ${hi}</p>
        <p class="welcome-sub">${own ? `Dein Konto <b>${money(acc.total)}</b> · Klasse <b>${CLASSES[cls].name}</b>` : 'Noch kein Fame auf deinem Konto'}</p>
        <div class="splash-login">${main}</div>
        <nav class="hub" aria-label="Übersicht">
          ${tile('donate', icons.cash, own ? 'Fame steigern' : 'Einzahlen', own ? 'Leg nach, steig auf' : 'Betrag wählen')}
          ${tile('ranking', icons.trophy, 'Ranking', 'Wer hat den meisten Fame?')}
          ${tile('check', '<span class="seal" aria-hidden="true">ECHT<br>FAM€</span>', 'Code prüfen', 'Ist eine Card echt?')}
        </nav>
        <a class="connect-cta" href="#/accounts">
          <span class="cc-ics" aria-hidden="true">${PLATFORMS.map((p) => `<span class="${isLinked(state.user, p.id) ? 'is-on' : ''}">${platformIcon(p.id)}</span>`).join('')}</span>
          <span class="cc-txt"><b>Accounts verbinden</b><small>Verbinde die Accounts, die auf deiner Card stehen sollen.</small><span class="cc-pill">${linkedIds(state.user).length} von ${PLATFORMS.length} verbunden</span></span>
          <span class="cc-go" aria-hidden="true">→</span>
        </a>
        ${resetLink()}
        <span class="app-version">Version ${APP_VERSION}</span>
        <button class="link welcome-logout" type="button" data-logout>Abmelden</button>
      </section>`,
      mount(el) {
        bindReset(el);
        const dia = createDiamond(el.querySelector('[data-diamond]'), {
          gem: open ? top : null, mystery: !open, rim: CLASSES[cls].color, glow: 0.4 + cls * 0.06, interactive: true,
        });
        const fx = particles(el.querySelector('[data-fx]'), { color: CLASSES[cls].color, mode: 'embers', density: 0.25 + cls * 0.15 });
        const t = setTimeout(() => { dia.pulse(); if (own) classDrop(cls); }, 900);
        el.querySelector('[data-logout]').addEventListener('click', logout);
        return () => { clearTimeout(t); dia.dispose(); fx.dispose(); };
      },
    };
  }
  return {
    html: `<section class="screen screen--splash">
      <div class="sweep" aria-hidden="true"></div>
      <div class="splash-logo">${logo('xl')}</div>
      <div class="splash-space"></div>
      <a class="newhere" href="#/intro/1">
        <span class="newhere-q">Neu hier?</span>
        <span class="newhere-go">Zeig mir mehr <span aria-hidden="true">→</span></span>
      </a>
      <div class="splash-space splash-space--mid"></div>
      ${checkTeaser()}
      <div class="splash-space splash-space--mid"></div>
      <div class="splash-login">${button('Login', 'data-go="login"')}</div>
      ${resetLink()}
      <span class="app-version">Version ${APP_VERSION}</span>
    </section>`,
    mount(el) { bindReset(el); },
  };
}

// Kasten auf der Startseite: Echtheit einer Fame-Card prüfen
const checkTeaser = () => `<a class="check-teaser" href="#/check">
  <span class="seal" aria-hidden="true">ECHT<br>FAM€</span>
  <span class="check-teaser-text"><b>Code prüfen</b>Ist eine Fame-Card echt? Seriennummer eingeben.</span>
  <span class="check-teaser-go" aria-hidden="true">→</span>
</a>`;

// Code-Prüfung: Seriennummer eingeben, Prüfzeichen und Verzeichnis prüfen, Besitzer anzeigen.
function checkPage(initial) {
  const fmtDate = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return {
    html: `<section class="screen screen--dark screen--check" style="--rar:#3dfa74">
      ${backButton('back--dark')}
      <header class="check-head">
        <span class="seal check-seal" aria-hidden="true">ECHT<br>FAM€</span>
        <h1 class="check-title">Code prüfen</h1>
        <p class="check-sub">Jede Fame-Card hat oben rechts eine Seriennummer. Gib sie ein und prüf, ob die Card echt ist und wem sie gehört.</p>
      </header>
      <form class="check-form" data-form autocomplete="off">
        <label class="check-field">
          <span class="sr-only">Seriennummer</span>
          <input data-code inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="FM-XXXX-XXXX-X" maxlength="20" value="${esc(initial)}">
        </label>
        ${button('Prüfen', 'type="submit" data-submit')}
        <button class="link check-sample" type="button" data-sample>Beispiel-Code ausprobieren</button>
      </form>
      <div class="check-result" data-result aria-live="polite"></div>
      <p class="check-note">Prototyp: Geprüft werden die Prüfziffer und das Verzeichnis dieses Geräts (deine Cards und die Ranking-Spieler). In der fertigen App fragt Fame den Code beim Fame-Server ab.</p>
    </section>`,
    mount(el) {
      const input = el.querySelector('[data-code]');
      const out = el.querySelector('[data-result]');
      const show = (res) => {
        out.className = `check-result is-${res.status}`;
        out.style.removeProperty('--c');
        if (res.status === 'invalid') {
          buzz([30, 40, 30]);
          out.innerHTML = `<div class="check-badge">✕</div><h2>Kein gültiger Code</h2>
            <p><b>${esc(res.serial || '–')}</b> ist keine Fame-Seriennummer. Prüf die Schreibweise: FM-XXXX-XXXX-X. Ist sie richtig abgeschrieben, ist die Card nicht echt.</p>`;
          return;
        }
        if (res.status === 'unknown') {
          buzz(20);
          out.innerHTML = `<div class="check-badge">?</div><h2>Nicht im Verzeichnis</h2>
            <p><b>${esc(res.serial)}</b> hat ein gültiges Format, ist aber keiner Card zugeordnet. Vorsicht – das kann eine nachgemachte Card sein.</p>`;
          return;
        }
        const t = res.tier;
        const cls = classFor(res.amount);
        const c = countryById(res.owner.country);
        classDrop(cls);
        out.style.setProperty('--c', CLASSES[cls].color);
        out.innerHTML = `<div class="check-badge">✓</div><h2>Echt – verifizierte Fame-Card</h2>
          <dl class="check-facts">
            <div><dt>Gehört zu</dt><dd>@${esc(res.owner.handle)}${res.owner.verified ? ' <i class="verified" title="Account bestätigt">✓</i>' : ''}${res.own ? ' <small>(dein Account)</small>' : ''}</dd></div>
            <div><dt>Edelstein</dt><dd class="gemline"><span><small>Stufe ${t.stage}</small> ${res.revealed ? esc(t.name) : 'noch verdeckt'}</span><span class="gemline-price">${priceRange(t)}</span></dd></div>
            <div><dt>Klasse</dt><dd><i class="check-dot"></i>${CLASSES[cls].name}</dd></div>
            <div><dt>Herkunft</dt><dd>${c ? `${c.flag} ` : ''}${esc(res.owner.region || c?.name || '')}</dd></div>
            <div><dt>Ausgestellt</dt><dd>${fmtDate(res.at)}</dd></div>
            <div><dt>Seriennummer</dt><dd class="mono">${esc(res.serial)}</dd></div>
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
  ? `<button class="mycard-btn" type="button" data-go="card">${icons.share}<span>Meine Card</span></button>`
  : '');

// „Zeig mir mehr“: 6 Story-Slides zum Durchtippen wie eine Instagram-Story. Jede Slide hat eine
// Klassenfarbe – beim Durchtippen steigt man von Kiesel bis Diamant-Holo auf. Kein Stein ist sichtbar:
// welcher es wird, zeigt erst die eigene Card.
const STORY = [
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

// Letzte Slide: der Vergleich Club-Flasche gegen Fame
const storyQuote = () => `<blockquote class="st-quote">
  <p class="st-old">Eine Belvedere Flasche kostet im Club <b class="nowrap">300€ – 3.000€</b>,</p>
  <p class="st-old">der ${hl('Fame')} hält maximal <b>einen Abend</b>,</p>
  <p class="st-old">die Reichweite begrenzt sich auf den Club.</p>
  <span class="st-divider" aria-hidden="true"></span>
  <p class="st-new">Bei ${logoInline()} bestimmst du deine Kosten,</p>
  <p class="st-new">der ${hl('Fame')} hält dein ${hl('Leben lang')}</p>
  <p class="st-new">und die Reichweite ist <b class="o">grenzenlos</b>.</p>
</blockquote>`;

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
  <b>${LOGO_TEXT}</b><span class="st-cardback-q">${diamondSvg({ cls: 'st-cardback-dia' })}<i>?</i></span><small>Welcher Stein? Deiner.</small>
</div>`;

function introStory() {
  const n = STORY.length;
  return {
    html: `<section class="screen screen--dark screen--slides" style="--rar:${CLASSES[0].color}">
      <div class="st-rays" aria-hidden="true"></div>
      <canvas class="fx-canvas" data-fx aria-hidden="true"></canvas>
      <div class="st-bars" aria-hidden="true">${STORY.map(() => '<i><b></b></i>').join('')}</div>
      <div class="st-top"><span class="st-logo">${LOGO_TEXT}</span><span class="st-num" data-num>1/${n}</span>
        <button class="st-close" type="button" data-back aria-label="Schließen">×</button></div>
      <div class="st-stack" data-stack>
        ${STORY.map((s, i) => `<article class="st-slide${i === 0 ? ' is-on' : ''}" data-slide="${i}" style="--c:${CLASSES[s.cls].color}" aria-hidden="${i !== 0}">
          <span class="st-tag">${s.tag}</span>
          <h1 class="st-h">${s.h}</h1>
          ${s.p ? `<p class="st-p">${s.p}</p>` : ''}
          ${s.extra === 'cardback' ? storyCardBack() : ''}${s.extra === 'ladder' ? classLadder() : ''}${s.extra === 'story' ? storyQuote() : ''}
        </article>`).join('')}
      </div>
      <div class="st-foot">
        <span class="st-tap" data-tap>Tippen für weiter →</span>
        <div class="st-cta" data-cta hidden>${button('Fang an – JETZT', 'data-go="login"')}</div>
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
    .map((r) => `<option${r === selected ? ' selected' : ''}>${esc(r)}</option>`).join('');
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
  toast(r.error === 'setup' ? `Die ${n}-Verbindung ist noch nicht eingerichtet – trag deinen Namen solange selbst ein.`
    : r.error === 'denied' ? `${n}: Anmeldung abgebrochen.` : `${n} ist gerade nicht erreichbar. Versuch es gleich nochmal.`);
}

function connectRows(u, { card, pickMode, picked, focus }) {
  return PLATFORMS.map((p) => {
    const on = isLinked(u, p.id);
    const sub = on ? `@${esc(u.accounts[p.id])}${u.verified?.[p.id] ? '' : ' · selbst eingetragen'}` : 'Noch nicht verbunden';
    const isPicked = pickMode && on && picked === p.id;
    const right = !on
      ? `<button type="button" class="pf-go" data-link="${p.id}">Verbinden</button><span class="pf-snap" data-snaphost="${p.id}"></span>`
      : pickMode ? `<span class="pf-ok">${isPicked ? '✓ Im Ranking' : 'Antippen'}</span>`
        : `<span class="pf-ok">✓ Verbunden</span><button type="button" class="pf-change" data-unlink="${p.id}" aria-label="${p.name} ändern">Ändern</button>`;
    return `<div class="pf${on ? ' is-on' : ''}${isPicked ? ' is-picked' : ''}${focus === p.id ? ' is-focus' : ''}" data-pf="${p.id}"${pickMode && on ? ' data-pick role="button" tabindex="0"' : ''}>
        <span class="pf-ic">${platformIcon(p.id)}</span>
        <span class="pf-nm">${p.name}<small>${sub}</small></span>
        ${right}
      </div>
      ${on ? '' : `<div class="pf-manual" data-manual="${p.id}" role="group" hidden><input name="h" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="@dein ${p.name}-Name" aria-label="${p.name}-Name"><button type="button" data-manualok>OK</button></div>`}
      ${on && card ? `<label class="check pf-card"><input type="checkbox" data-oncard="${p.id}"${u.onCard?.includes(p.id) ? ' checked' : ''}><span class="check-box"></span><span>Steht auf meiner Card</span></label>` : ''}`;
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
  const linked = (pr) => {
    update((u) => {
      u.accounts[pr.id] = cleanHandle(pr.handle);
      u.verified[pr.id] = { name: pr.name, avatar: pr.avatar, externalId: pr.externalId };
      if (!u.onCard.length) u.onCard.push(pr.id);
    });
    buzz([10, 40, 10]);
    toast(`${platformName(pr.id)} verbunden ✓`);
  };
  function bind() {
    host.querySelectorAll('[data-link]').forEach((b) => {
      const id = b.dataset.link;
      if (id === 'sc' && isReady('sc')) {
        // Snapchats eigener Knopf (öffnet das Anmelde-Popup)
        b.hidden = true;
        mountSnap(host.querySelector('[data-snaphost="sc"]'), (r) => (r.error ? connectError('sc', r) : linked(r)));
        return;
      }
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
        toast(`${platformName(id)} eingetragen ✓`);
      };
      f.querySelector('[data-manualok]').addEventListener('click', save);
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
const ssoButtons = (verb) => `<button class="sso sso--apple" type="button" data-sso="apple">${icons.apple}<span>${verb} mit Apple</span></button>
  <button class="sso sso--google" type="button" data-sso="google">${icons.google}<span>${verb} mit Google</span></button>`;
const pwField = (label, name, ac) => `<label class="field"><span>${label}</span><span class="pw"><input name="${name}" type="password" autocomplete="${ac}" minlength="8" required><button type="button" class="pw-eye" data-eye aria-label="Passwort zeigen">${icons.eye}</button></span></label>`;
const emptyScreen = (to) => { queueMicrotask(() => go(to)); return { html: '<section class="screen"></section>' }; };
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function bindAuthBits(el) {
  el.querySelectorAll('[data-sso]').forEach((b) => b.addEventListener('click', async () => {
    if (b.classList.contains('is-busy')) return;
    b.classList.add('is-busy');
    const p = b.dataset.sso;
    const r = await auth.signInWith(p);
    if (r.pending) return; // weiter zu Apple/Google
    b.classList.remove('is-busy');
    toast(r.error === 'setup' ? `Anmelden mit ${p === 'apple' ? 'Apple' : 'Google'} ist noch nicht eingerichtet – nimm solange deine E-Mail.` : r.error);
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

function login() {
  if (state.user) return emptyScreen(state.after || '');
  return {
    html: `<section class="screen screen--login">
      ${authHero()}
      <form class="login-form auth-form" novalidate>
        <div class="login-icon">${diamondShadowed()}</div>
        <h1 class="headline">Login</h1>
        <p class="sub">Schön, dass du wieder da bist.</p>
        ${ssoButtons('Anmelden')}
        <div class="or">oder mit E-Mail</div>
        <label class="field"><span>E-Mail</span><input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="du@beispiel.de" required value="${esc(state.pendingEmail || '')}"></label>
        ${pwField('Passwort', 'pw', 'current-password')}
        <div class="row-between">
          <label class="check"><input type="checkbox" name="keep"${store.get('keep') === false ? '' : ' checked'}><span class="check-box"></span><span>Angemeldet bleiben</span></label>
          <button class="link" type="button" data-forgot>Passwort vergessen?</button>
        </div>
        <p class="form-error" data-err hidden></p>
        <div class="screen-foot"><button class="btn" type="submit"><span>Login</span></button></div>
        <div class="or">Noch kein Account?</div>
        <div class="screen-foot"><button class="btn btn--ghost" type="button" data-go="register"><span>Registrieren</span></button></div>
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
        if (!validEmail(email)) { formError(form, 'Gib deine E-Mail-Adresse ein.', form.email); return; }
        if (!pw) { formError(form, 'Gib dein Passwort ein.', form.pw); return; }
        busy(form.querySelector('[type="submit"]'), async () => {
          const r = await auth.signIn(email, pw);
          if (r.error) { formError(form, r.error); return; }
          store.set('keep', form.keep.checked);
          markAlive();
          await startSession(r.session);
          state.pendingEmail = '';
          toast('Angemeldet ✓');
          afterAuth();
        });
      });
      el.querySelector('[data-forgot]').addEventListener('click', (e) => {
        const email = form.email.value.trim();
        if (!validEmail(email)) { formError(form, 'Gib zuerst deine E-Mail ein – dann schicken wir dir einen Link.', form.email); return; }
        busy(e.currentTarget, async () => {
          const r = await auth.resetPassword(email);
          if (r.error) { formError(form, r.error); return; }
          formError(form, '');
          toast('Link ist unterwegs – schau in dein Postfach.');
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
      <form class="login-form auth-form" novalidate>
        <div class="login-icon">${diamondShadowed()}</div>
        <h1 class="headline">Registrieren</h1>
        <p class="sub">Leg deinen ${LOGO_TEXT}-Account an – dauert 1 Minute.</p>
        <div class="sec">1 · Dein Login<small>Am schnellsten mit Apple (iCloud) oder Google – ohne neues Passwort. 🔒 Deine E-Mail taucht nirgendwo auf.</small></div>
        ${ssoButtons('Weiter')}
        <div class="or">oder mit E-Mail</div>
        <label class="field"><span>E-Mail</span><input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="du@beispiel.de" required></label>
        <p class="hint">🔒 Deine E-Mail taucht nirgendwo auf – nicht auf der Card, nicht im Ranking.</p>
        ${pwField('Passwort <small>(mind. 8 Zeichen)</small>', 'pw', 'new-password')}
        ${pwField('Passwort wiederholen', 'pw2', 'new-password')}
        <div class="sec">2 · Accounts verbinden<small>Verbinde die Accounts, die auf deiner Card stehen sollen. Dein Name kommt direkt von Insta, TikTok oder Snapchat.</small></div>
        <div data-connect></div>
        <p class="note">Geht auch später – über „Accounts verbinden“ auf der Startseite.</p>
        <div class="sec">3 · Fertig</div>
        <label class="check terms-check"><input type="checkbox" name="terms"><span class="check-box"></span><span>Ich akzeptiere die <a href="#/terms">Bedingungen</a> und habe die <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a> gelesen.</span></label>
        <p class="form-error" data-err hidden></p>
        <div class="screen-foot"><button class="btn" type="submit"><span>Registrierung abschließen</span></button></div>
        <div class="or">Schon einen Account?</div>
        <div class="screen-foot"><button class="link" type="button" data-go="login">Zum Login</button></div>
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
        if (!validEmail(email)) { formError(form, 'Die E-Mail-Adresse stimmt nicht.', form.email); return; }
        if (form.pw.value.length < 8) { formError(form, 'Das Passwort braucht mindestens 8 Zeichen.', form.pw); return; }
        if (form.pw.value !== form.pw2.value) { formError(form, 'Die beiden Passwörter sind nicht gleich.', form.pw2); return; }
        if (!form.terms.checked) { formError(form, 'Bitte akzeptiere die Bedingungen.'); return; }
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
          toast('Account erstellt ✓ Willkommen!');
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
        <h1 class="headline">Check dein Postfach</h1>
        <p class="sub">Wir haben dir ${email ? `an <b>${esc(email)}</b> ` : ''}einen Link geschickt. Tipp darauf – dann ist dein Account fertig.</p>
        <p class="note">Keine Mail da? Schau auch im Spam-Ordner nach.</p>
        <div class="screen-foot">${email ? '<button class="btn btn--ghost" type="button" data-resend><span>Mail nochmal senden</span></button>' : ''}</div>
        <div class="screen-foot"><button class="link" type="button" data-go="login">Zum Login</button></div>
      </div>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      el.querySelector('[data-resend]')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
        const r = await auth.resendConfirm(email);
        toast(r.error || 'Neue Mail ist unterwegs.');
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
        <h1 class="headline">Neues Passwort</h1>
        ${ok ? `<p class="sub">Wähl ein neues Passwort für deinen ${LOGO_TEXT}-Account.</p>
          ${pwField('Neues Passwort <small>(mind. 8 Zeichen)</small>', 'pw', 'new-password')}
          ${pwField('Passwort wiederholen', 'pw2', 'new-password')}
          <p class="form-error" data-err hidden></p>
          <div class="screen-foot"><button class="btn" type="submit"><span>Passwort speichern</span></button></div>`
    : `<p class="sub">Der Link ist abgelaufen oder wurde schon benutzt. Fordere beim Login einfach einen neuen an.</p>
          <div class="screen-foot"><button class="btn" type="button" data-go="login"><span>Zum Login</span></button></div>`}
      </form>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      bindAuthBits(el);
      const form = el.querySelector('form');
      if (ok) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (form.pw.value.length < 8) { formError(form, 'Das Passwort braucht mindestens 8 Zeichen.', form.pw); return; }
          if (form.pw.value !== form.pw2.value) { formError(form, 'Die beiden Passwörter sind nicht gleich.', form.pw2); return; }
          busy(form.querySelector('[type="submit"]'), async () => {
            const r = await auth.updatePassword(form.pw.value);
            if (r.error) { formError(form, r.error); return; }
            toast('Passwort geändert ✓');
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
        <h1 class="headline">Fast geschafft</h1>
        <p class="sub">Noch 2 kurze Schritte, dann ist dein Account fertig.</p>
        <div class="signed">${via[1]}<span>Angemeldet mit ${via[0]}</span>${prov === 'email' ? '' : '<small>✓ ohne Passwort</small>'}</div>
        <p class="hint">🔒 Deine E-Mail taucht nirgendwo auf.</p>
        <div class="sec">1 · Accounts verbinden<small>Verbinde die Accounts, die auf deiner Card stehen sollen.</small></div>
        <div data-connect></div>
        <div class="sec">2 · Fertig</div>
        <label class="check terms-check"><input type="checkbox" name="terms"${state.user.termsAt ? ' checked' : ''}><span class="check-box"></span><span>Ich akzeptiere die <a href="#/terms">Bedingungen</a> und habe die <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a> gelesen.</span></label>
        <p class="form-error" data-err hidden></p>
        <div class="screen-foot"><button class="btn" type="submit"><span>Account fertig</span></button></div>
      </form>
    </section>`,
    mount(el) {
      const dia = authDiamond(el);
      const form = el.querySelector('form');
      mountConnect(el.querySelector('[data-connect]'), { get: () => state.user, set: saveUser, back: 'finish' });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.terms.checked) { formError(form, 'Bitte akzeptiere die Bedingungen.'); return; }
        saveUser({ ...state.user, done: true, termsAt: state.user.termsAt || Date.now() });
        toast('Account fertig ✓ Willkommen!');
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
        <h1 class="headline">Accounts verbinden</h1>
        <p class="sub">${focus ? `Verbinde ${platformName(focus)}, dann kannst du deine Card direkt posten.` : 'Verbinde die Accounts, die auf deiner Card stehen sollen. Mehrere möglich.'}</p>
        <div data-connect></div>
        <p class="note">Verbunden heißt: Dein echter Name steht auf der Card und du kannst deine Story direkt posten.</p>
        <div class="screen-foot"><button class="btn" type="button" data-done><span>${state.after === 'card' ? 'Zurück zur Card' : 'Fertig'}</span></button></div>
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
      <h1 class="terms-title">Bedingungen</h1>
      <p class="terms-text">Hier stehen bald die Teilnahmebedingungen von ${LOGO_TEXT}.</p>
      <p class="terms-text"><a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a></p>
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
  const registered = !!state.user;
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
      <div class="collection" aria-label="Deine Sammlung">
        <div class="gem-grid">
          ${TIERS.map((t) => `<i class="gcell${collected.has(t.stage) ? ' is-found' : ''}" data-cell="${t.stage}" style="--c:${t.css}"></i>`).join('')}
        </div>
      </div>
      <div class="donate-body">
        ${acc.total ? `<div class="account">Dein Konto <b>${money(acc.total)}</b> → danach <b data-after></b></div>` : ''}
        <div class="amount-box">
          <button class="stepper" type="button" data-step="-1" aria-label="Weniger">−</button>
          <label class="amount-field">
            <span class="sr-only">Betrag in Euro</span>
            <input id="donate-amount" data-amount inputmode="numeric" autocomplete="off" enterkeyhint="done">
            <span class="amount-cur" aria-hidden="true">€</span>
          </label>
          <button class="stepper" type="button" data-step="1" aria-label="Mehr">+</button>
        </div>
        <p class="amount-hint">Betrag antippen zum Eintippen – oder Regler ziehen</p>
        <div class="arc" data-arc role="slider" tabindex="0" aria-label="Betrag einstellen"
          aria-valuemin="${MIN_AMOUNT}" aria-valuemax="${MAX_AMOUNT}">
          <svg viewBox="0 0 300 108" aria-hidden="true">
            <path class="arc-track" d="M20 16 Q150 168 280 16" pathLength="1"/>
            <path class="arc-fill" d="M20 16 Q150 168 280 16" pathLength="1" data-arcfill/>
            <g data-knob><circle class="knob-shadow" r="13" cx="3" cy="4"/><circle class="knob" r="13"/><circle class="knob-dot" r="4"/></g>
          </svg>
        </div>
        <button class="nudge" type="button" data-nudge></button>
        ${registered ? '<p class="rank-preview" data-rankline></p>' : ''}
        <label class="check">
          <input id="donate-accept" type="checkbox" data-accept ${state.accepted ? 'checked' : ''}>
          <span class="check-box" aria-hidden="true"></span>
          <span>Ich akzeptiere die <a href="#/terms">Bedingungen</a></span>
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
        arc.setAttribute('aria-valuetext', `${money(amount)}, danach ${tier.name}`);
        if (document.activeElement !== input) input.value = fmt(amount);
        input.parentElement.classList.toggle('is-long', amount >= 1_000_000);
        const afterEl = $('[data-after]');
        if (afterEl) afterEl.textContent = money(after);

        $('[data-tier]').innerHTML = `Edelstein <span>Stufe ${tier.stage} von ${GEM_COUNT}</span>`;
        $('[data-teaser]').textContent = locked
          ? 'Welcher es ist, zeigt dir erst deine Card.'
          : 'Den hast du schon in deiner Sammlung.';
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
          nudge.innerHTML = `<span>Nur noch <b>${money(nx.min - after)}</b> bis <b>Stufe ${nx.stage}</b></span><span class="nudge-go">Nächster Edelstein →</span>`;
        } else {
          nudge.hidden = true;
        }
        const rl = $('[data-rankline]');
        if (rl) {
          const { rank, total } = rankFor(after);
          rl.innerHTML = `${icons.trophy} Rang danach <b>${fmt(rank)}</b> von ${fmt(total)}`;
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
          toast('Log dich ein, damit der Betrag auf deinem Konto landet.');
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
      <button class="home-btn" type="button" data-go="" aria-label="Zur Startseite">${icons.home}</button>
      <button class="sound-btn${isMuted() ? ' is-muted' : ''}" type="button" data-sound aria-label="Ton an/aus" aria-pressed="${!isMuted()}">${icons.sound}</button>
      <div class="card-wrap" data-tiltwrap>
        <div class="flip" data-flip role="button" tabindex="0" aria-label="${hidden ? 'Karte aufdecken' : tier.name}">
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
                <span class="famecard-serial" title="Seriennummer">Nr. ${c.serial}</span>
              </div>
              <div class="famecard-plate">
                <h2 class="famecard-name">${tier.name}</h2>
                <div class="famecard-rule" aria-hidden="true"><i></i>${diamondSvg({ filled: true })}<i></i></div>
                <p class="famecard-flavor">${tier.flavor}</p>
              </div>
              <div class="famecard-foot">
                ${onCard.length
                  ? `<div class="famecard-accts${onCard.length > 1 ? ' is-multi' : ''}">${onCard.map((a) => `<span class="famecard-insta">${platformIcon(a.id)}<span>${esc(a.handle)}</span>${state.user?.verified?.[a.id] ? '<i class="verified" title="Verbunden und bestätigt">✓</i>' : ''}</span>`).join('')}</div>`
                  : `<div class="famecard-insta">${icons.insta}<input id="card-insta" data-insta placeholder="dein Instagram" autocomplete="off" autocapitalize="off" aria-label="Instagram-Name"></div>`}
                <span class="seal" title="Echtheitssiegel">ECHT<br>FAM€</span>
              </div>
            </div>
          </article>
          <div class="cardback flip-back" aria-hidden="true">
            <div class="cardback-pattern"></div>
            <div class="cardback-logo">${logo('md')}</div>
            <div class="cardback-q">?</div>
            <div class="cardback-tap">Tippen zum Aufdecken</div>
          </div>
        </div>
      </div>
      <div class="screen-foot card-actions">
        <button class="frame-nudge" type="button" data-framenudge hidden>
          <span class="frame-nudge-ring" aria-hidden="true"></span>
          <span class="frame-nudge-text"><b>Neue Klasse: ${CLASSES[tier.cls].name}!</b>Hol dir deinen neuen Profilbild-Rahmen</span>
          <span class="frame-nudge-go" aria-hidden="true">→</span>
        </button>
        <div class="quick-share">
          <button class="qs qs--ig" type="button" data-share="ig">${icons.insta}<span>Story</span></button>
          <button class="qs qs--tt" type="button" data-share="tt">${icons.tiktok}<span>TikTok</span></button>
          <button class="qs qs--sc" type="button" data-share="sc">${icons.snap}<span>Snap</span></button>
          <button class="qs" type="button" data-open-sheet>${icons.share}<span>Mehr</span></button>
        </div>
        <div class="foot-links">
          <a class="link" href="#/donate">Fame steigern</a>
          <a class="link" href="#/ranking">Ranking</a>
        </div>
      </div>
      <div class="sheet" data-sheet hidden>
        <div class="sheet-backdrop" data-close-sheet></div>
        <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="Card teilen">
          <div class="sheet-grip" aria-hidden="true"></div>
          <h2 class="sheet-title">Zeig´s der Welt</h2>
          ${myAccts.length > 1 ? `<div class="acc-switch" aria-label="Accounts auf dem Bild">${myAccts.map((a) => { const on = onCard.some((x) => x.id === a.id); return `<button type="button" class="acc-chip${on ? ' is-on' : ''}" data-acct="${a.id}" aria-pressed="${on}">${platformIcon(a.id)}<span>@${esc(a.handle)}</span></button>`; }).join('')}</div>` : ''}
          <div class="sheet-preview"><img data-preview alt="Vorschau deiner Story"><span class="sheet-loading" data-loading>Story wird gebaut…</span></div>
          <div class="sheet-actions">
            <button class="share-btn share-btn--ig" type="button" data-share="ig">${icons.insta}<span>Instagram Story</span></button>
            <button class="share-btn share-btn--tt" type="button" data-share="tt">${icons.tiktok}<span>TikTok</span></button>
            <button class="share-btn share-btn--sc" type="button" data-share="sc">${icons.snap}<span>Snapchat</span></button>
            <button class="share-btn" type="button" data-share="more">${icons.whatsapp}<span>WhatsApp &amp; mehr</span></button>
            <button class="share-btn" type="button" data-share="save">${icons.download}<span>Bild speichern</span></button>
            <button class="share-btn share-btn--avatar" type="button" data-avatar>${icons.user}<span>Profilbild-Rahmen</span></button>
          </div>
          <p class="sheet-note">Format 9:16 – passt für Instagram Story, TikTok, Snapchat und WhatsApp-Status.</p>
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
          <button class="link" type="button" data-needclose>Abbrechen</button>
        </div>
      </div>
      <div class="imgview" data-imgview hidden role="dialog" aria-modal="true" aria-label="Bild speichern">
        <button class="imgview-close" type="button" data-imgclose aria-label="Schließen">×</button>
        <h2 class="imgview-title" data-imgtitle></h2>
        <div class="imgview-pic"><img data-imgpic alt="Dein Fame-Bild"></div>
        <ol class="imgview-steps" data-imgsteps></ol>
        <div class="imgview-actions">
          <button class="share-btn" type="button" data-imgshare hidden>${icons.share}<span>Teilen …</span></button>
          <a class="share-btn" data-imgdl download="fame.png">${icons.download}<span>Herunterladen</span></a>
        </div>
      </div>
      <div class="sheet avatar-sheet" data-avsheet hidden>
        <div class="sheet-backdrop" data-close-av></div>
        <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="Profilbild mit Rahmen">
          <div class="sheet-grip" aria-hidden="true"></div>
          <h2 class="sheet-title">Dein Profilbild</h2>
          <p class="avatar-hint">Wähl ein Foto – wir legen den Rahmen deiner Klasse darüber. Danach in Instagram, TikTok oder Snapchat als Profilbild einstellen.</p>
          <div class="avatar-preview"><canvas data-avimg width="600" height="600" role="img" aria-label="Profilbild mit Rahmen – ziehen zum Verschieben, Zoom mit zwei Fingern oder Regler"></canvas></div>
          <div class="avatar-zoom" data-avzoomrow hidden>
            <span aria-hidden="true">−</span>
            <input type="range" min="1" max="4" step="0.01" value="1" data-avzoom aria-label="Zoom">
            <span aria-hidden="true">+</span>
            <button class="link" type="button" data-avreset>Zurücksetzen</button>
          </div>
          <p class="avatar-tip" data-avtip hidden>Ziehen zum Verschieben · zwei Finger oder Regler zum Zoomen</p>
          <input type="file" accept="image/*" data-avfile hidden>
          <div class="sheet-actions">
            <button class="share-btn" type="button" data-avpick>${icons.download}<span>Foto wählen</span></button>
            <button class="share-btn share-btn--ig" type="button" data-avsave disabled>${icons.share}<span>Speichern / Teilen</span></button>
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
          stopMusic = revealMusic(tier.cls);
          dia.pulse();
          const [x, y] = centerIn(canvas, flip);
          fx.burst(x, y, 40 + tier.level * 40, rarity.color);
          if (tier.level >= 3) timers.push(setTimeout(() => fx.burst(x, y - 60, 60, '#ffffff'), 350));
          fx.setDensity(0.4 + tier.level * 0.45);
          c.revealed = true;
          c.stage = tier.stage;
          saveAccount();
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
        else if (phase === 'open') stopMusic = startCelebration(tier.cls);
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
      const HOLD = 'Halte das Bild gedrückt und tipp auf <b>„Zu Fotos hinzufügen“</b> (iPhone) bzw. <b>„Bild herunterladen“</b> (Android).';
      const GUIDE = {
        save: { title: 'Bild speichern', steps: [HOLD] },
        ig: { title: 'In deine Instagram Story', steps: [HOLD, 'Öffne Instagram, wisch nach rechts oder tipp auf <b>+ → Story</b>.', 'Wähl das Bild aus deiner Galerie und tipp auf <b>Deine Story</b>.'] },
        tt: { title: 'Auf TikTok posten', steps: [HOLD, 'Öffne TikTok und tipp auf <b>+ → Hochladen</b>.', 'Wähl das Foto, schreib was dazu und poste es.'] },
        sc: { title: 'In deine Snapchat Story', steps: [HOLD, 'Öffne Snapchat und wisch nach oben zu den <b>Erinnerungen → Kamerarolle</b>.', 'Wähl das Bild, tipp auf <b>Senden an → Meine Story</b>.'] },
        more: { title: 'WhatsApp & mehr', steps: [HOLD, 'Öffne WhatsApp und tipp auf <b>Status → Foto</b> – oder schick es direkt an Freunde.'] },
        avatar: { title: 'Dein Profilbild', steps: [HOLD, 'Instagram: <b>Profil → Profil bearbeiten → Bild ändern</b>.', 'TikTok: <b>Profil → Profil bearbeiten → Foto ändern</b>. Snapchat: <b>Profil → Profilbild</b>.'] },
      };
      let imgUrl = '';
      const openImageView = async (cv, kind, name) => {
        const g = GUIDE[kind] || GUIDE.save;
        el.querySelector('[data-imgtitle]').textContent = g.title;
        el.querySelector('[data-imgsteps]').innerHTML = g.steps.map((t) => `<li>${t}</li>`).join('');
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
        shareBtn.onclick = () => navigator.share({ files: [file], title: APP_NAME }).catch((err) => { if (err?.name !== 'AbortError') toast('Teilen geht hier nicht – halte das Bild gedrückt zum Sichern.'); });
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
        need.querySelector('[data-needtitle]').textContent = `${n} noch nicht verbunden`;
        need.querySelector('[data-needtext]').textContent = `Verbinde zuerst deinen ${n}-Account – dann postest du deine Card direkt in deine Story.`;
        need.querySelector('[data-needgo] span').textContent = `Jetzt mit ${n} verbinden`;
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
          toast('Teilen hat nicht geklappt. Speicher das Bild und lade es selbst hoch.');
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
        img.onerror = () => toast('Das Foto konnte nicht geladen werden.');
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
  const c = u.ranking?.country || u.country || 'DE';
  return `<div class="msheet msheet--join" data-join${joined || state.joinDismissed ? ' hidden' : ''}>
    <div class="msheet-bg" data-joinclose></div>
    <form class="msheet-pnl join-form" role="dialog" aria-modal="true" aria-labelledby="jointitle" novalidate>
      <div class="msheet-grip" aria-hidden="true"></div>
      <h3 id="jointitle">🏆 ${joined ? 'Ranking-Einstellungen' : 'Beim Ranking mitmachen'}</h3>
      <p class="msheet-lead">${joined ? 'Wo und mit welchem Namen du im Ranking stehst.' : 'Einmal kurz einrichten – danach landest du direkt im Ranking.'}</p>
      <div class="field-row">
        <label class="field"><span>Land</span><select name="country">${COUNTRIES.map((x) => `<option value="${x.id}"${x.id === c ? ' selected' : ''}>${x.flag} ${x.name}</option>`).join('')}</select></label>
        <label class="field"><span>Bundesland</span><select name="region">${regionOptions(c, u.ranking?.region || u.region)}</select></label>
      </div>
      <div class="sec">Mit welchem Namen?<small>Tipp den Namen an, der im Ranking stehen soll – mit Symbol davor.</small></div>
      <div data-joinlist></div>
      <div class="req" data-req></div>
      <button class="btn" type="submit"><span>${joined ? 'Speichern' : 'Mitmachen'}</span></button>
      <p class="msheet-once">${joined ? '<button class="link" type="button" data-leave>Nicht mehr im Ranking zeigen</button>' : 'Das Fenster kommt nur einmal. Ändern kannst du alles später über ⚙.'}</p>
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
        ? `<span>✓ Du erscheinst als ${platIcon(picked)}<b>@${esc(state.user.accounts[picked])}</b>.</span>`
        : '<span>⚠️ Verbinde mindestens eine Plattform, damit jeder sieht, dass dein Name echt ist.</span>';
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
    toast(first ? 'Du bist im Ranking ✓' : 'Gespeichert ✓');
    buzz([10, 40, 10]);
    render();
  });
  sheet.querySelectorAll('[data-joinclose]').forEach((b) => b.addEventListener('click', close));
  sheet.querySelector('[data-leave]')?.addEventListener('click', () => {
    saveUser({ ...state.user, ranking: { ...state.user.ranking, joined: false } });
    toast('Du stehst nicht mehr im Ranking.');
    go('');
  });
  el.querySelector('[data-joinopen]')?.addEventListener('click', open);
  return { dispose() {} };
}

function rankingPage(mode) {
  const me = meEntry();
  const userCountry = state.user?.ranking?.country || state.user?.country || 'DE';
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
    const t = tierFor(r.amount);
    return `<li class="rrow${r.me ? ' rrow--me' : ''}" style="--rar:${t.css}">
      <span class="rrow-rank">${fmt(r.rank)}</span>
      ${avatar(r)}
      <span class="rrow-name">${platIcon(r.platform)}@${esc(r.handle)}<small>Edelstein · Stufe ${t.stage}</small></span>
      <span class="rrow-amount">${money(r.amount)}</span>
    </li>`;
  };

  // Duell: Kachelkarte für Deutschland, sonst Balken. Farbe: eine Farbe, je mehr Geld desto heller.
  const groupName = (g) => (mode === 'region' ? g.id : `${countryById(g.id).flag} ${countryById(g.id).name}`);
  const isMyGroup = (g) => (mode === 'region' ? g.id === me?.region : g.id === me?.country);
  const tileMap = mode === 'region' && country.id === 'DE'
    ? `<div class="tilemap" role="list">
        ${groups.map((g) => {
          const [code, col, rowIdx] = DE_TILES[g.id] || ['?', 0, 0];
          const t = g.amount / maxGroup;
          return `<button class="tile${g.id === region ? ' is-active' : ''}${isMyGroup(g) ? ' is-mine' : ''}" type="button" role="listitem"
            data-region="${esc(g.id)}" style="grid-column:${col + 1};grid-row:${rowIdx + 1};--t:${(0.12 + t * 0.88).toFixed(2)}"
            title="${esc(g.id)}: ${money(g.amount)} · Platz ${g.rank}">
            <b>${code}</b><small>${shortMoney(g.amount)}</small><i>${g.rank}.</i></button>`;
        }).join('')}
        <div class="tilemap-legend" aria-hidden="true"><span>weniger</span><i></i><span>mehr</span></div>
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
      ${state.user ? `<button class="rank-gear" type="button" data-joinopen aria-label="Ranking-Einstellungen">${icons.gear}</button>` : ''}
      <nav class="rank-tabs" aria-label="Ranking">
        <a href="#/ranking/region" class="${mode === 'region' ? 'is-active' : ''}">Bundesland</a>
        <a href="#/ranking/country" class="${mode === 'country' ? 'is-active' : ''}">Länder</a>
      </nav>
      <header class="rank-head">
        <span class="rank-flag">${country.flag}</span>
        <h1>${esc(region || country.name)}</h1>
      </header>
      <div class="stat-tiles">
        <div class="stat"><b>${fmt(list.length)}</b><span>Spieler</span></div>
        <div class="stat"><b>${shortMoney(sum)}</b><span>Gesamt</span></div>
        <div class="stat stat--me"><b>${mine ? `#${fmt(mine.rank)}` : '–'}</b><span>Dein Platz</span></div>
      </div>
      <div class="chips" role="tablist">
        ${mode === 'region'
          ? country.regions.map((r) => `<button class="chip${r === region ? ' is-active' : ''}" type="button" data-region="${esc(r)}">${esc(r)}</button>`).join('')
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
        <h2>${mode === 'region' ? `${country.name}: Bundesländer-Duell` : 'Länder-Duell'}</h2>
        ${tileMap}
        ${bars}
      </section>
      <div class="mebar">
        ${myCardButton()}
        ${mine
          ? `<div><b>Platz ${fmt(mine.rank)}</b> in ${esc(region || country.name)}<small>${money(mine.amount)} · Stufe ${tierFor(mine.amount).stage}</small></div>`
          : `<div><b>${state.user ? 'Noch nicht dabei' : 'Du fehlst noch'}</b><small>Zahl ein und steig ins Ranking ein</small></div>`}
        ${button(mine ? 'Fame steigern' : 'Steig ein', 'data-go="donate"')}
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
    toast(urlReturn.type === 'signup' ? 'E-Mail bestätigt ✓ Willkommen bei Fam€!' : 'Angemeldet ✓');
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
    toast(`${n} verbunden ✓`);
  } else {
    toast(r.error === 'denied' ? `${n}: Anmeldung abgebrochen.`
      : r.error === 'business' ? 'Instagram verbindet nur Business- oder Creator-Konten. Trag deinen Namen solange selbst ein.'
        : `${n}-Verbindung hat nicht geklappt. Versuch es nochmal.`);
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
