// Kleiner Server für die TikTok-Anmeldung (Cloudflare Worker, kostenlos).
// Tauscht den Code aus der Weiterleitung gegen einen Token und gibt der App nur das Profil zurück.
// Der Client secret steht nur hier (als geheime Variable), nie in der App.
//
// Einrichten (siehe texte/verbinden.md):
//   Variablen im Worker: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET (geheim), ALLOWED_ORIGIN (z. B. https://name.github.io)

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USER_URL = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username';

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/tiktok/profile') return json({ error: 'not_found' }, 404);

    let input;
    try { input = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
    if (!input?.code || !input?.redirect_uri) return json({ error: 'bad_request' }, 400);

    // 1. Code gegen Token tauschen
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        code: decodeURIComponent(input.code),
        grant_type: 'authorization_code',
        redirect_uri: input.redirect_uri,
      }),
    });
    const token = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !token.access_token) return json({ error: 'token', detail: token.error || token.error_description || '' }, 502);

    // 2. Profil abrufen
    const userRes = await fetch(USER_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const user = (await userRes.json().catch(() => ({})))?.data?.user;
    if (!userRes.ok || !user?.open_id) return json({ error: 'user' }, 502);

    return json({ open_id: user.open_id, username: user.username || '', display_name: user.display_name || '', avatar_url: user.avatar_url || '' });
  },
};
