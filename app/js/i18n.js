// Sprachen: Deutsch (Euro) und Englisch/USA (Dollar).
// Die Sprache richtet sich nach dem Handy; auf der Start- und Anmeldeseite lässt sie sich umschalten
// (gespeichert unter fame.lang). Texte stehen im Code auf Deutsch – t('…') holt die englische
// Fassung aus js/i18n-en.js. Fehlt eine Übersetzung, bleibt der deutsche Text stehen.

import { EN } from './i18n-en.js';

const KEY = 'fame.lang';
export const LANGS = [
  { id: 'de', name: 'Deutsch', flag: '🇩🇪', currency: 'Euro €' },
  { id: 'en', name: 'English (US)', flag: '🇺🇸', currency: 'Dollar $' },
];

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.some((l) => l.id === saved)) return saved;
  } catch { /* privat */ }
  const nav = (navigator.languages?.[0] || navigator.language || 'de').toLowerCase();
  return nav.startsWith('de') ? 'de' : 'en';
}

export const lang = detect();
export const isEn = lang === 'en';
document.documentElement.lang = lang;

export function setLang(id) {
  if (id === lang) return;
  try { localStorage.setItem(KEY, id); } catch { /* privat */ }
  location.reload();
}

// t('Hallo {name}', { name }) – Platzhalter in geschweiften Klammern
export function t(de, vars) {
  let s = isEn ? (EN[de] ?? de) : de;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}
