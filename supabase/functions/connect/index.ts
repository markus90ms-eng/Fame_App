// Supabase Edge Function "connect": Anmeldung mit Snapchat, TikTok und Instagram.
// Tauscht den Code aus der Weiterleitung gegen einen Token und gibt der App nur das Profil zurück:
// { id, username, name, avatar }. Die geheimen Schlüssel stehen nur hier (Edge Functions → Secrets),
// nie in der App. Aufruf: POST /functions/v1/connect/snapchat|tiktok|instagram/profile
// Snapchat braucht keinen Geheimschlüssel (PKCE: die App schickt client_id und code_verifier mit).
//
// Secrets (siehe texte/verbinden.md):
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
//   INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET
//   ALLOWED_ORIGIN (optional, Standard: https://markus90ms-eng.github.io)

type Env = (name: string) => string;
type Input = { code: string; redirect_uri: string; client_id?: string; code_verifier?: string };
type Profile = { id: string; username: string; name: string; avatar: string } | { error: string; detail?: string };

const env: Env = (name) => Deno.env.get(name) || '';
const form = (data: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(data),
});
const getJson = async (res: Response) => res.json().catch(() => ({}));

const PROVIDERS: Record<string, (code: string, redirectUri: string, input: Input) => Promise<Profile>> = {
  // Snapchat Login Kit: Code (+ PKCE) → Token → /v1/me (Anzeigename und Bitmoji)
  async snapchat(code, redirectUri, input) {
    if (!input.client_id || !input.code_verifier) return { error: 'bad_request' };
    const tokenRes = await fetch('https://accounts.snapchat.com/accounts/oauth2/token', form({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: input.client_id,
      code_verifier: input.code_verifier,
    }));
    const token = await getJson(tokenRes);
    if (!tokenRes.ok || !token.access_token) return { error: 'token', detail: token.error_description || token.error || '' };
    // Erst mit Profil-Link versuchen (daraus lässt sich der Benutzername lesen: snapchat.com/add/<name>),
    // klappt das nicht, nur Anzeigename und Bitmoji
    const ask = async (fields: string) => {
      const res = await fetch(`https://kit.snapchat.com/v1/me?query=${encodeURIComponent(`{me{${fields}}}`)}`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const body = await getJson(res);
      return res.ok && !body?.errors?.length ? body?.data?.me : null;
    };
    const me = (await ask('displayName,bitmoji{avatar},profileLink')) || (await ask('displayName,bitmoji{avatar}'));
    if (!me?.displayName) return { error: 'user' };
    const username = /snapchat\.com\/add\/([^/?#]+)/i.exec(me.profileLink || '')?.[1] || '';
    // Ohne „External ID“-Berechtigung gibt es keine feste Kennung – Benutzer- bzw. Anzeigename steht dafür
    return { id: `snap:${username || me.displayName}`, username: decodeURIComponent(username), name: me.displayName, avatar: me.bitmoji?.avatar || '' };
  },


  // TikTok Login Kit: Code → Token → /v2/user/info
  async tiktok(code, redirectUri) {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', form({
      client_key: env('TIKTOK_CLIENT_KEY'),
      client_secret: env('TIKTOK_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }));
    const token = await getJson(tokenRes);
    if (!tokenRes.ok || !token.access_token) return { error: 'token', detail: token.error_description || token.error || '' };
    const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = (await getJson(userRes))?.data?.user;
    if (!userRes.ok || !user?.open_id) return { error: 'user' };
    return { id: user.open_id, username: user.username || '', name: user.display_name || '', avatar: user.avatar_url || '' };
  },

  // Instagram API mit Instagram-Login (nur Business-/Creator-Konten): Code → Token → /me
  async instagram(code, redirectUri) {
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', form({
      client_id: env('INSTAGRAM_APP_ID'),
      client_secret: env('INSTAGRAM_APP_SECRET'),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: code.replace(/#_$/, ''),
    }));
    const raw = await getJson(tokenRes);
    const token = raw.data?.[0] || raw;
    if (!tokenRes.ok || !token.access_token) return { error: 'token', detail: raw.error_message || raw.error?.message || '' };
    const userRes = await fetch(`https://graph.instagram.com/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(token.access_token)}`);
    const user = await getJson(userRes);
    if (!userRes.ok || !user.username) return { error: 'user' };
    return { id: String(user.user_id || user.id || token.user_id), username: user.username, name: user.name || '', avatar: user.profile_picture_url || '' };
  },
};

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': env('ALLOWED_ORIGIN') || 'https://markus90ms-eng.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const m = /\/(snapchat|tiktok|instagram)\/profile\/?$/.exec(new URL(req.url).pathname);
  if (req.method !== 'POST' || !m) return json({ error: 'not_found' }, 404);

  let input: Partial<Input>;
  try { input = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (!input?.code || !input?.redirect_uri) return json({ error: 'bad_request' }, 400);

  const profile = await PROVIDERS[m[1]](decodeURIComponent(input.code), input.redirect_uri, input as Input);
  return 'error' in profile ? json(profile, 502) : json(profile);
});
