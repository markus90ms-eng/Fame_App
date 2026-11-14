// Supabase Edge Function "checkout": startet die Bezahlung einer Fame-Card bei Stripe.
// Ablauf: App (angemeldet) → POST /functions/v1/checkout mit Betrag und Häkchen
//   → Bestellung (orders, status 'open') und Kauf-Nachweis (purchase_evidence) anlegen
//   → Stripe-Checkout-Sitzung erstellen → App leitet zur Stripe-Bezahlseite weiter.
// Die Card wird hier NICHT ausgestellt. Das macht erst "stripe-webhook", wenn Stripe die Zahlung bestätigt.
//
// Zahlarten: kommen aus den Stripe-Einstellungen (Dashboard → Zahlungsmethoden). Gewollt sind Karte
// (inkl. Apple Pay und Google Pay) und Klarna; SEPA-Lastschrift ist dort ausgeschaltet.
//
// Secrets (Edge Functions → Secrets):
//   STRIPE_SECRET_KEY   sk_test_… (Testmodus) bzw. später sk_live_…
//   ALLOWED_ORIGIN      optional, wie bei "connect"
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.

const env = (name: string) => Deno.env.get(name) || '';
const SB_URL = env('SUPABASE_URL');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const LEGAL_VERSIONS = ['2026-10'];
const MIN = 1;
const MAX = 999999; // Stripe-Grenze je Zahlung: 999.999,99 €

const ORIGINS = (env('ALLOWED_ORIGIN') || 'https://fame-app.de,https://www.fame-app.de,https://markus90ms-eng.github.io')
  .split(',').map((o) => o.trim()).filter(Boolean);

type Input = {
  amount: number; legal_version: string; client_at?: string; lang?: string; return_url: string;
  agb_accepted: boolean; adult_confirmed: boolean; waiver_accepted: boolean;
};

// Datenbank mit der Service-Rolle (RLS gilt hier nicht – deshalb prüft diese Funktion alles selbst)
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
  if (!env('STRIPE_SECRET_KEY')) return json({ error: 'config' }, 500);

  // Angemeldeten Nutzer über sein Zugangs-Token bestimmen
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
  const user = await userRes.json().catch(() => null);
  if (!userRes.ok || !user?.id) return json({ error: 'login' }, 401);

  let input: Input;
  try { input = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const amount = Math.round(Number(input?.amount));
  if (!Number.isFinite(amount) || amount < MIN || amount > MAX) return json({ error: 'amount' }, 400);
  // Ohne alle drei Pflicht-Häkchen kein Kauf (AGB, ab 18, sofortige Ausstellung mit Verzicht aufs Widerrufsrecht)
  if (input.agb_accepted !== true || input.adult_confirmed !== true || input.waiver_accepted !== true) return json({ error: 'consent' }, 400);
  if (!LEGAL_VERSIONS.includes(input.legal_version)) return json({ error: 'legal_version' }, 400);
  // Rücksprung nur auf die eigene App
  let back: URL;
  try { back = new URL(input.return_url); } catch { return json({ error: 'return_url' }, 400); }
  if (!ORIGINS.includes(back.origin)) return json({ error: 'return_url' }, 400);
  const base = `${back.origin}${back.pathname}`;

  // 1. Bestellung anlegen
  const oRes = await db('orders', { method: 'POST', body: JSON.stringify({ user_id: user.id, amount }) });
  const order = (await oRes.json().catch(() => []))?.[0];
  if (!oRes.ok || !order?.id) return json({ error: 'db' }, 500);

  // 2. Kauf-Nachweis (Zeitpunkt setzt die Datenbank)
  const clientAt = input.client_at && !Number.isNaN(Date.parse(input.client_at)) ? input.client_at : null;
  const eRes = await db('purchase_evidence', {
    method: 'POST',
    body: JSON.stringify({
      user_id: user.id, order_id: order.id, serial: `ORDER-${String(order.id).slice(0, 8)}`, amount,
      legal_version: input.legal_version, client_at: clientAt,
      agb_accepted: true, adult_confirmed: true, waiver_accepted: true,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
    }),
  });
  if (!eRes.ok) return json({ error: 'db', detail: await eRes.text() }, 500);

  // 3. Stripe-Checkout-Sitzung
  const p = new URLSearchParams({
    mode: 'payment',
    // Zahlarten legt Stripe selbst fest (Dashboard → Einstellungen → Zahlungsmethoden). Seit API-Version
    // 2026-10-28 ist payment_method_types hier nicht mehr erlaubt. Dort nur Karten, Apple Pay, Google Pay
    // und Klarna eingeschaltet lassen – SEPA-Lastschrift aus.
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(amount * 100),
    'line_items[0][price_data][product_data][name]': 'Fam€ Card',
    'line_items[0][price_data][product_data][description]': 'Digitale Fame-Card, sofort nach Zahlung ausgestellt',
    client_reference_id: order.id,
    'metadata[order_id]': order.id,
    'metadata[user_id]': user.id,
    'payment_intent_data[metadata][order_id]': order.id,
    locale: input.lang === 'en' ? 'en' : 'de',
    expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
    success_url: `${base}#/pay/ok`,
    cancel_url: `${base}#/pay/cancel`,
  });
  if (user.email) p.set('customer_email', user.email);
  const sRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `order-${order.id}`,
    },
    body: p,
  });
  const session = await sRes.json().catch(() => ({}));
  if (!sRes.ok || !session.url) {
    await db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed' }) });
    return json({ error: 'stripe', detail: session?.error?.message || '' }, 502);
  }
  await db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ stripe_session: session.id }) });
  return json({ url: session.url, order_id: order.id });
});
