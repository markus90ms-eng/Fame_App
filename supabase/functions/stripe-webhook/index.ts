// Supabase Edge Function "stripe-webhook": Stripe meldet hier, wie eine Bezahlung ausgegangen ist.
// Erst wenn Stripe die Zahlung bestätigt, wird die Card ausgestellt: Bestellung auf 'paid' setzen
// und eine Seriennummer vergeben. Die App holt die Card danach aus der Tabelle "orders".
//
// WICHTIG: Bei dieser Funktion „Enforce JWT verification“ AUSSCHALTEN (Stripe schickt kein Supabase-Token).
// Die Echtheit jeder Meldung wird stattdessen über die Stripe-Signatur geprüft.
//
// Secrets (Edge Functions → Secrets):
//   STRIPE_WEBHOOK_SECRET   whsec_… (Stripe → Entwickler → Webhooks → Ziel → Signaturgeheimnis)
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
//
// Ereignisse, die in Stripe für den Webhook ausgewählt werden müssen:
//   checkout.session.completed, checkout.session.async_payment_succeeded,
//   checkout.session.async_payment_failed, checkout.session.expired

const env = (name: string) => Deno.env.get(name) || '';
const SB_URL = env('SUPABASE_URL');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const TOLERANCE = 300; // Sekunden

const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
});

// ---- Stripe-Signatur prüfen (HMAC-SHA256 über "Zeitstempel.Rohdaten") ----
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function verify(raw: string, header: string, secret: string) {
  const parts = header.split(',').map((x) => x.trim().split('='));
  const ts = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!ts || !sigs.length || Math.abs(Date.now() / 1000 - ts) > TOLERANCE) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${raw}`)));
  return sigs.some((s) => same(s, mac));
}

// ---- Seriennummer FM-XXXX-XXXX-P (gleiches Format und Prüfzeichen wie in der App, js/data.js) ----
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function checkChar(body: string) {
  let sum = 0;
  [...body].forEach((ch, i) => { sum += B32.indexOf(ch) * (i % 2 ? 3 : 1); });
  return B32[sum % 32];
}
function newSerial() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const body = [...r].map((b) => B32[b % 32]).join('');
  return `FM-${body.slice(0, 4)}-${body.slice(4)}-${checkChar(body)}`;
}

// Bestellung als bezahlt markieren und Card ausstellen. Mehrfache Meldungen schaden nicht:
// es wird nur eine Bestellung geändert, die noch nicht bezahlt ist.
async function markPaid(s: Record<string, any>) {
  const orderId = s.metadata?.order_id || s.client_reference_id;
  if (!orderId) return 'no_order';
  const cur = (await (await db(`orders?id=eq.${orderId}&select=id,amount,status,stripe_session`)).json().catch(() => []))?.[0];
  if (!cur) return 'unknown_order';
  if (cur.status === 'paid') return 'already_paid';
  // Betrag und Währung müssen zur Bestellung passen
  if (s.currency !== 'eur' || Number(s.amount_total) !== Math.round(Number(cur.amount) * 100)) return 'amount_mismatch';
  for (let i = 0; i < 5; i++) {
    const serial = newSerial();
    const res = await db(`orders?id=eq.${orderId}&status=neq.paid`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'paid', serial, paid_at: new Date().toISOString(),
        stripe_session: s.id, payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id || null,
      }),
    });
    if (res.ok) {
      await db(`purchase_evidence?order_id=eq.${orderId}`, { method: 'PATCH', body: JSON.stringify({ serial }) });
      return 'paid';
    }
    if (res.status !== 409) return `db_${res.status}`; // 409 = Seriennummer schon vergeben → neue würfeln
  }
  return 'serial';
}

async function setStatus(s: Record<string, any>, status: 'failed' | 'expired') {
  const orderId = s.metadata?.order_id || s.client_reference_id;
  if (orderId) await db(`orders?id=eq.${orderId}&status=eq.open`, { method: 'PATCH', body: JSON.stringify({ status }) });
  return status;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('not found', { status: 404 });
  const secret = env('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('config', { status: 500 });
  const raw = await req.text();
  if (!(await verify(raw, req.headers.get('stripe-signature') || '', secret))) return new Response('bad signature', { status: 400 });

  let event: Record<string, any>;
  try { event = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const s = event.data?.object || {};
  let result = 'ignored';
  switch (event.type) {
    case 'checkout.session.completed':
      // Karte, Apple Pay, Google Pay und Klarna sind hier meist schon bezahlt
      result = s.payment_status === 'paid' ? await markPaid(s) : 'pending';
      break;
    case 'checkout.session.async_payment_succeeded':
      result = await markPaid(s);
      break;
    case 'checkout.session.async_payment_failed':
      result = await setStatus(s, 'failed');
      break;
    case 'checkout.session.expired':
      result = await setStatus(s, 'expired');
      break;
  }
  // Datenbankfehler → 500, damit Stripe die Meldung später erneut schickt
  const retry = /^db_|^serial$/.test(result);
  return new Response(JSON.stringify({ received: true, result }), { status: retry ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
});
