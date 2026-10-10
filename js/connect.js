// Accounts verbinden: Snapchat, TikTok und Instagram – alle per Weiterleitung zur Plattform und zurück.
// (Kein Popup: Aus der App vom Home-Bildschirm kommt die Antwort eines Popups auf dem iPhone nicht an.)
// Ergebnis ist jeweils ein bestätigtes Profil { id, handle, name, avatar, verified: true }.
// Ohne Zugangsdaten in js/config.js meldet connectRedirect() { error: 'setup' }.

import { SOCIAL, SUPABASE, REDIRECT_URI } from './config.js';

const SNAP_AUTH = 'https://accounts.snapchat.com/accounts/oauth2/auth';
const SNAP_SCOPES = ['https://auth.snapchat.com/oauth2/api/user.display_name', 'https://auth.snapchat.com/oauth2/api/user.bitmoji.avatar'];
const TIKTOK_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const INSTAGRAM_AUTH = 'https://www.instagram.com/oauth/authorize';
const PENDING = 'fame.oauth';

export const isReady = (id) => !!SOCIAL.server && (id === 'sc' ? !!SOCIAL.snap.clientId
  : id === 'tt' ? !!SOCIAL.tiktok.clientKey
    : id === 'ig' ? !!SOCIAL.instagram.appId : false);

const randomHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const base64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Snapchat ohne Geheimschlüssel: PKCE (ein Zufallswert, dessen Prüfsumme Snapchat vorab bekommt)
async function pkce() {
  const verifier = randomHex(32);
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

// Weiterleitung zur Plattform, zurück kommt ein Code. Den tauscht unser Server (Supabase Edge Function
// "connect") gegen das Profil; die App bekommt nur Name, Benutzername und Bild, nie den Token.
// Instagram verbindet nur Business- und Creator-Konten (so will es Meta).
const AUTH = {
  sc: (p) => [SNAP_AUTH, { client_id: SOCIAL.snap.clientId, response_type: 'code', scope: SNAP_SCOPES.join(' '), code_challenge: p.challenge, code_challenge_method: 'S256' }],
  tt: () => [TIKTOK_AUTH, { client_key: SOCIAL.tiktok.clientKey, response_type: 'code', scope: 'user.info.basic,user.info.profile' }],
  ig: () => [INSTAGRAM_AUTH, { client_id: SOCIAL.instagram.appId, response_type: 'code', scope: 'instagram_business_basic', enable_fb_login: '0' }],
};
const PATH = { sc: 'snapchat', tt: 'tiktok', ig: 'instagram' };

// back: Seite, auf die es nach der Rückkehr weitergeht (z. B. 'accounts' oder 'register')
export async function connectRedirect(id, draft, back = 'accounts') {
  if (!isReady(id)) return { error: 'setup' };
  const state = randomHex(16);
  const p = id === 'sc' ? await pkce() : {};
  try { localStorage.setItem(PENDING, JSON.stringify({ id, state, verifier: p.verifier, draft, back, at: Date.now() })); } catch { /* privat */ }
  const [url, params] = AUTH[id](p);
  location.href = `${url}?${new URLSearchParams({ ...params, redirect_uri: REDIRECT_URI, state })}`;
  return { pending: true };
}

// Beim Start der App: Kommen wir gerade von einer Plattform zurück? Dann Code einlösen.
// Gibt null zurück, wenn nichts ansteht, sonst { id, profile?, error?, draft, back }.
export async function finishRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('state') || !(q.has('code') || q.has('error'))) return null;
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING) || 'null'); localStorage.removeItem(PENDING); } catch { /* privat */ }
  history.replaceState(null, '', `${location.pathname}#/${pending?.back || 'accounts'}`);
  const id = pending?.id;
  const back = pending?.back || 'accounts';
  if (!pending || pending.state !== q.get('state') || !PATH[id]) return { id, error: 'state', draft: pending?.draft, back };
  if (q.has('error')) return { id, error: 'denied', draft: pending.draft, back };
  try {
    const r = await fetch(`${SOCIAL.server.replace(/\/$/, '')}/${PATH[id]}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE.key },
      body: JSON.stringify({
        code: q.get('code'), redirect_uri: REDIRECT_URI,
        ...(id === 'sc' ? { client_id: SOCIAL.snap.clientId, code_verifier: pending.verifier } : {}),
      }),
    });
    const p = await r.json();
    if (!r.ok || !p.id) return { id, error: p.error === 'not_professional' ? 'business' : 'server', draft: pending.draft, back };
    return {
      id, draft: pending.draft, back,
      profile: { id, handle: p.username || p.name, name: p.name || p.username, avatar: p.avatar || '', externalId: p.id, verified: true },
    };
  } catch {
    return { id, error: 'server', draft: pending.draft, back };
  }
}
