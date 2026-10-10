// Login und Konten über Supabase: E-Mail + Passwort, Apple und Google.
// Das Profil (Accounts, Ranking, Cards) liegt als eine Zeile in der Tabelle "profiles" –
// lesen und ändern darf sie nur der Nutzer selbst (siehe server/supabase.sql).
// Die Bibliothek (vendor/supabase.js) wird erst geladen, wenn sie gebraucht wird.

import { SUPABASE, REDIRECT_URI } from './config.js';
import { t } from './i18n.js';

const LIB = 'vendor/supabase.js';
const SESSION_KEY = 'fame.sb';

let client = null;
let loading = null;

export const authReady = () => !!(SUPABASE.url && SUPABASE.key);

// Liegt eine Anmeldung auf diesem Gerät? (synchron, damit die Startseite nicht flackert)
export function hasStoredSession() {
  try { return !!localStorage.getItem(SESSION_KEY); } catch { return false; }
}

function loadLib() {
  loading ||= new Promise((resolve, reject) => {
    if (window.supabase?.createClient) { resolve(window.supabase); return; }
    const s = document.createElement('script');
    s.src = LIB;
    s.onload = () => resolve(window.supabase);
    s.onerror = () => { loading = null; reject(new Error('load')); };
    document.head.appendChild(s);
  });
  return loading;
}

async function sb() {
  if (client) return client;
  const { createClient } = await loadLib();
  // "implicit": Die Tokens kommen im #-Teil zurück. Das klappt auch, wenn der Link aus der
  // Bestätigungs-Mail in einem anderen Browser aufgeht. Den #-Teil liest takeUrlReturn() selbst,
  // weil der Router ihn sonst als Seitennamen nehmen würde.
  client = createClient(SUPABASE.url, SUPABASE.key, {
    auth: { storageKey: SESSION_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit' },
  });
  return client;
}

// ---- Rückkehr von Mail-Link, Apple oder Google ---------------------------------------------------

// Muss vor dem ersten Rendern laufen: nimmt Tokens oder Fehler aus der Adresse und räumt sie auf.
export function takeUrlReturn() {
  const h = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  const q = new URLSearchParams(location.search);
  let r = null;
  if (h.get('access_token')) {
    r = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), type: h.get('type') || '' };
  } else if (h.get('error_description') || (q.get('error_description') && !q.has('state'))) {
    r = { error: h.get('error_description') || q.get('error_description'), code: h.get('error_code') || q.get('error_code') || '' };
  }
  if (!r) return null;
  history.replaceState(null, '', `${location.pathname}${r.type === 'recovery' ? '#/reset' : '#/'}`);
  return r;
}

export async function applyUrlReturn(r) {
  const c = await sb();
  const { data, error } = await c.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
  return { session: data?.session || null, error: error ? text(error) : null };
}

// ---- Fehlertexte -------------------------------------------------------------------------------

export function text(e) {
  const code = e?.code || '';
  const m = (e?.message || String(e || '')).toLowerCase();
  if (code === 'invalid_credentials' || m.includes('invalid login')) return t('E-Mail oder Passwort stimmt nicht.');
  if (code === 'user_already_exists' || m.includes('already registered')) return t('Diese E-Mail ist schon registriert – log dich ein.');
  if (code === 'email_not_confirmed' || m.includes('not confirmed')) return t('Bitte bestätige zuerst deine E-Mail – der Link ist in deinem Postfach.');
  if (code === 'weak_password' || m.includes('password should')) return t('Das Passwort ist zu schwach – nimm mindestens 8 Zeichen.');
  if (code === 'same_password') return t('Das ist schon dein Passwort.');
  if (code === 'email_address_invalid' || m.includes('invalid format')) return t('Die E-Mail-Adresse stimmt nicht.');
  if (code.startsWith('over_') || m.includes('rate limit')) return t('Zu viele Versuche – warte kurz und probier es nochmal.');
  if (code === 'signup_disabled') return t('Registrieren ist gerade ausgeschaltet.');
  if (code === 'otp_expired' || m.includes('expired')) return t('Der Link ist abgelaufen – fordere einfach einen neuen an.');
  if (m.includes('fetch') || m.includes('network') || m.includes('load')) return t('Keine Verbindung – prüf dein Internet.');
  return t('Das hat nicht geklappt. Versuch es nochmal.');
}

const wrap = async (fn) => {
  try { return await fn(); } catch (e) { return { error: text(e) }; }
};

// ---- Anmelden ----------------------------------------------------------------------------------

export const getSession = () => wrap(async () => {
  const c = await sb();
  const { data, error } = await c.auth.getSession();
  // Fehler (z. B. offline beim Erneuern der Anmeldung): nicht abmelden, lokaler Stand bleibt
  return error ? { error: text(error), session: data?.session || null } : { session: data.session };
});

export const signUp = (email, password, meta) => wrap(async () => {
  const c = await sb();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: REDIRECT_URI, data: meta } });
  if (error) return { error: text(error) };
  // Bei schon vorhandener (bestätigter) Adresse meldet Supabase keinen Fehler, sondern einen Nutzer ohne Identität
  if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) return { error: text({ code: 'user_already_exists' }) };
  return { session: data.session };
});

export const signIn = (email, password) => wrap(async () => {
  const c = await sb();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  return error ? { error: text(error) } : { session: data.session };
});

// Welche Anmeldewege sind im Supabase-Projekt eingeschaltet?
let settings = null;
export async function providers() {
  if (settings) return settings;
  try {
    const r = await fetch(`${SUPABASE.url}/auth/v1/settings`, { headers: { apikey: SUPABASE.key } });
    const j = await r.json();
    settings = { google: !!j.external?.google, apple: !!j.external?.apple };
  } catch {
    return { error: 'net' };
  }
  return settings;
}

// Weiter zu Apple oder Google; zurück kommt man über takeUrlReturn().
export const signInWith = (provider) => wrap(async () => {
  const p = await providers();
  if (p.error) return { error: text('network') };
  if (!p[provider]) return { error: 'setup' };
  const c = await sb();
  const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: REDIRECT_URI } });
  return error ? { error: text(error) } : { pending: true };
});

export const resetPassword = (email) => wrap(async () => {
  const c = await sb();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_URI });
  return error ? { error: text(error) } : { ok: true };
});

export const resendConfirm = (email) => wrap(async () => {
  const c = await sb();
  const { error } = await c.auth.resend({ type: 'signup', email, options: { emailRedirectTo: REDIRECT_URI } });
  return error ? { error: text(error) } : { ok: true };
});

export const updatePassword = (password) => wrap(async () => {
  const c = await sb();
  const { error } = await c.auth.updateUser({ password });
  return error ? { error: text(error) } : { ok: true };
});

export const signOut = () => wrap(async () => {
  const c = await sb();
  await c.auth.signOut({ scope: 'local' });
  return { ok: true };
});

// ---- Profil ------------------------------------------------------------------------------------

export const loadProfile = (id) => wrap(async () => {
  const c = await sb();
  const { data, error } = await c.from('profiles').select('data').eq('id', id).maybeSingle();
  return error ? { error: error.message || 'db' } : { data: data?.data || null };
});

export const saveProfile = (id, data) => wrap(async () => {
  const c = await sb();
  const { error } = await c.from('profiles').upsert({ id, data, updated_at: new Date().toISOString() });
  return error ? { error: error.message || 'db' } : { ok: true };
});

// Kurzinfo zur Anmeldung: { id, email, provider: 'email' | 'apple' | 'google' }
export const sessionInfo = (s) => (s ? { id: s.user.id, email: s.user.email || '', provider: s.user.app_metadata?.provider || 'email', meta: s.user.user_metadata || {} } : null);
