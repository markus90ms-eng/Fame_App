// Supabase Edge Function "stripe-webhook": Stripe meldet hier, wie eine Bezahlung ausgegangen ist.
// - Zahlung bestätigt → Bestellung 'paid', Seriennummer vergeben (erst damit ist die Card ausgestellt),
//   Zahlungsdetails für Streitfälle speichern und die Kaufbestätigung per E-Mail schicken.
// - Rückbuchung (Dispute) → Card sperren und Konto für weitere Käufe sperren. Gewonnener Streitfall → Card
//   wieder freigeben (die Konto-Sperre hebt Markus selbst auf: Tabelle account_flags).
// - Erstattung (Refund) → Card sperren.
//
// WICHTIG: Bei dieser Funktion „Verify JWT“ AUSSCHALTEN (Stripe schickt kein Supabase-Token).
// Die Echtheit jeder Meldung wird stattdessen über die Stripe-Signatur geprüft.
//
// Secrets (Edge Functions → Secrets):
//   STRIPE_WEBHOOK_SECRET   whsec_…
//   STRIPE_SECRET_KEY       sk_test_… / sk_live_… (für die Zahlungsdetails)
//   BREVO_API_KEY           xkeysib-… (Kaufbestätigung per E-Mail)
//   MAIL_FROM               optional, Standard: noreply@fame-app.de
//   MAIL_REPLY_TO           optional, Standard: fame.app.2026@gmail.com
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
//
// Ereignisse in Stripe (Webhook „Fame Kasse“):
//   checkout.session.completed, checkout.session.async_payment_succeeded,
//   checkout.session.async_payment_failed, checkout.session.expired,
//   charge.dispute.created, charge.dispute.closed, charge.refunded

const env = (name: string) => Deno.env.get(name) || '';
const SB_URL = env('SUPABASE_URL');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const TOLERANCE = 300; // Sekunden
const SITE = 'https://fame-app.de/app/';

const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
});
const rows = async (path: string) => (await (await db(path)).json().catch(() => [])) as Record<string, any>[];
const patch = (path: string, body: unknown) => db(path, { method: 'PATCH', body: JSON.stringify(body) });

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

// ---- Zahlungsdetails von Stripe (Zahlart, Karte, Ergebnis 3D Secure) für Streitfälle ----
async function paymentDetails(pi: string | null) {
  if (!pi || !env('STRIPE_SECRET_KEY')) return {};
  try {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}?expand[]=latest_charge`, {
      headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}` },
    });
    if (!res.ok) return {};
    const intent = await res.json();
    const ch = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const pm = ch?.payment_method_details || {};
    const card = pm.card;
    return {
      charge: ch?.id || null,
      payment_method: pm.type || null,
      card_info: card ? `${card.brand || 'card'} •••• ${card.last4 || ''}${card.wallet?.type ? ` (${card.wallet.type})` : ''}` : null,
      three_d_secure: card ? (card.three_d_secure?.result || (card.wallet?.type ? 'wallet' : 'none')) : null,
    };
  } catch { return {}; }
}

// ---- E-Mail (Brevo) ----
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const when = (iso: string, en: boolean) => new Date(iso).toLocaleString(en ? 'en-GB' : 'de-DE', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Europe/Berlin' });
const euro = (n: number, en: boolean) => (en ? `€${n.toLocaleString('en-GB')}` : `${n.toLocaleString('de-DE')} €`);

async function sendMail(to: string, subject: string, html: string, attachments: { url: string; name: string }[] = []) {
  if (!env('BREVO_API_KEY')) return { error: 'no_key' };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env('BREVO_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Fam€', email: env('MAIL_FROM') || 'noreply@fame-app.de' },
      replyTo: { email: env('MAIL_REPLY_TO') || 'fame.app.2026@gmail.com' },
      to: [{ email: to }],
      subject, htmlContent: html,
      ...(attachments.length ? { attachment: attachments } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { id: body.messageId || 'ok' } : { error: body.message || `brevo_${res.status}` };
}

const frame = (inner: string) => `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#141414">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-size:26px;font-weight:800;letter-spacing:-.02em;margin-bottom:18px">Fam€</div>
<div style="background:#fff;border:2px solid #141414;padding:22px 20px;line-height:1.55;font-size:15px">${inner}</div>
<p style="font-size:12px;color:#666;line-height:1.5;margin-top:16px">Scultetus · Inhaber Markus Schultheiß · <a href="${SITE}impressum.html" style="color:#666">Impressum</a> · <a href="${SITE}datenschutz.html" style="color:#666">Datenschutz</a></p>
</div></body></html>`;
const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${k}</td><td style="padding:4px 0;font-weight:bold">${v}</td></tr>`;

function purchaseMail(o: Record<string, any>, ev: Record<string, any> | null, en: boolean) {
  const amount = Number(o.amount);
  const consentAt = ev?.created_at || o.created_at;
  const subject = en ? `Your Fam€ card – order confirmation (${o.serial})` : `Deine Fam€ Card – Kaufbestätigung (${o.serial})`;
  const html = frame(en ? `
<h1 style="font-size:20px;margin:0 0 12px">Thank you for your purchase</h1>
<p>This email confirms your contract with us. Please keep it.</p>
<table style="border-collapse:collapse;margin:12px 0">
${row('Product', 'Fam€ Card (digital card)')}${row('Serial number', esc(o.serial))}${row('Total', esc(euro(amount, true)))}
${row('Payment', esc(o.card_info || o.payment_method || 'Stripe'))}${row('Ordered', esc(when(o.created_at, true)))}${row('Paid and issued', esc(when(o.paid_at, true)))}
</table>
<h2 style="font-size:16px;margin:18px 0 8px">Your consents (${esc(when(consentAt, true))})</h2>
<ul style="padding-left:18px;margin:0">
<li>You accepted our Terms (version ${esc(ev?.legal_version || '')}) and read the withdrawal policy.</li>
<li>You confirmed that you are at least 18 years old.</li>
<li>You expressly requested that Fam€ issues your card immediately and confirmed that you understand you lose your right of withdrawal.</li>
</ul>
<p style="margin-top:14px"><b>Your right of withdrawal expired when your card was issued on ${esc(when(o.paid_at, true))}</b> (§ 356 (5) German Civil Code). Statutory rights in case of defects remain unaffected.</p>
<p>Our Terms and the withdrawal policy are attached to this email.</p>
<p><a href="${SITE}#/card" style="display:inline-block;background:#141414;color:#fff;padding:10px 16px;text-decoration:none;font-weight:bold">Open my card</a></p>` : `
<h1 style="font-size:20px;margin:0 0 12px">Danke für deinen Kauf</h1>
<p>Mit dieser E-Mail bestätigen wir dir deinen Vertrag mit uns. Bitte heb sie auf.</p>
<table style="border-collapse:collapse;margin:12px 0">
${row('Produkt', 'Fam€ Card (digitale Card)')}${row('Seriennummer', esc(o.serial))}${row('Gesamtbetrag', esc(euro(amount, false)))}
${row('Zahlart', esc(o.card_info || o.payment_method || 'Stripe'))}${row('Bestellt am', esc(when(o.created_at, false)))}${row('Bezahlt und ausgestellt am', esc(when(o.paid_at, false)))}
</table>
<h2 style="font-size:16px;margin:18px 0 8px">Deine Zustimmungen (${esc(when(consentAt, false))})</h2>
<ul style="padding-left:18px;margin:0">
<li>Du hast unsere AGB (Fassung ${esc(ev?.legal_version || '')}) akzeptiert und die Widerrufsbelehrung gelesen.</li>
<li>Du hast bestätigt, dass du mindestens 18 Jahre alt bist.</li>
<li>Du hast ausdrücklich verlangt, dass Fam€ deine Card sofort ausstellt, und bestätigt, dass dir bewusst ist, dass du damit dein Widerrufsrecht verlierst.</li>
</ul>
<p style="margin-top:14px"><b>Dein Widerrufsrecht ist mit der Ausstellung deiner Card am ${esc(when(o.paid_at, false))} erloschen</b> (§ 356 Abs. 5 BGB). Gesetzliche Rechte bei Mängeln bleiben unberührt.</p>
<p>Unsere AGB und die Widerrufsbelehrung findest du im Anhang dieser E-Mail.</p>
<p><a href="${SITE}#/card" style="display:inline-block;background:#141414;color:#fff;padding:10px 16px;text-decoration:none;font-weight:bold">Meine Card öffnen</a></p>`);
  return { subject, html };
}

// Kaufbestätigung genau einmal verschicken (auch beim erneuten Zustellen einer Meldung nachholen)
async function confirmByMail(orderId: string, s: Record<string, any>) {
  const o = (await rows(`orders?id=eq.${orderId}&select=*`))[0];
  if (!o || o.status !== 'paid' || o.mail_sent_at) return 'mail_skip';
  const to = s.customer_details?.email || s.customer_email || o.email;
  if (!to) return 'mail_no_address';
  const ev = (await rows(`purchase_evidence?order_id=eq.${orderId}&select=created_at,legal_version`))[0] || null;
  const en = s.metadata?.lang === 'en';
  const { subject, html } = purchaseMail({ ...o, email: to }, ev, en);
  const r = await sendMail(to, subject, html, [
    { url: `${SITE}agb.html`, name: en ? 'Fame-Terms.html' : 'Fame-AGB.html' },
    { url: `${SITE}widerruf.html`, name: en ? 'Fame-Withdrawal-Policy.html' : 'Fame-Widerrufsbelehrung.html' },
  ]);
  if ('error' in r) {
    console.warn('Kaufbestätigung nicht verschickt:', r.error);
    await patch(`orders?id=eq.${orderId}`, { email: to });
    // Ohne Schlüssel nicht wiederholen; sonst 500 → Stripe stellt die Meldung erneut zu und die Mail wird nachgeholt
    return r.error === 'no_key' ? 'mail_no_key' : 'mail_failed';
  }
  await patch(`orders?id=eq.${orderId}`, { email: to, mail_sent_at: new Date().toISOString(), mail_id: r.id });
  return 'mail_sent';
}

// Bestellung als bezahlt markieren und Card ausstellen. Mehrfache Meldungen schaden nicht:
// es wird nur eine Bestellung geändert, die noch nicht bezahlt ist.
async function markPaid(s: Record<string, any>) {
  const orderId = s.metadata?.order_id || s.client_reference_id;
  if (!orderId) return 'no_order';
  const cur = (await rows(`orders?id=eq.${orderId}&select=id,amount,status,stripe_session`))[0];
  if (!cur) return 'unknown_order';
  if (cur.status === 'paid') return `already_paid,${await confirmByMail(orderId, s)}`;
  // Betrag und Währung müssen zur Bestellung passen
  if (s.currency !== 'eur' || Number(s.amount_total) !== Math.round(Number(cur.amount) * 100)) return 'amount_mismatch';
  const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id || null;
  const details = await paymentDetails(pi);
  for (let i = 0; i < 5; i++) {
    const serial = newSerial();
    const res = await patch(`orders?id=eq.${orderId}&status=neq.paid`, {
      status: 'paid', serial, paid_at: new Date().toISOString(), stripe_session: s.id, payment_intent: pi, ...details,
    });
    if (res.ok) {
      await patch(`purchase_evidence?order_id=eq.${orderId}`, { serial });
      return `paid,${await confirmByMail(orderId, s)}`;
    }
    if (res.status !== 409) return `db_${res.status}`; // 409 = Seriennummer schon vergeben → neue würfeln
  }
  return 'serial';
}

async function setStatus(s: Record<string, any>, status: 'failed' | 'expired') {
  const orderId = s.metadata?.order_id || s.client_reference_id;
  if (orderId) await patch(`orders?id=eq.${orderId}&status=eq.open`, { status });
  return status;
}

// ---- Rückbuchung und Erstattung ----
const orderByPayment = async (pi: string | null, charge: string | null) => {
  if (pi) { const o = (await rows(`orders?payment_intent=eq.${encodeURIComponent(pi)}&select=id,user_id,locked,lock_reason`))[0]; if (o) return o; }
  if (charge) return (await rows(`orders?charge=eq.${encodeURIComponent(charge)}&select=id,user_id,locked,lock_reason`))[0];
  return undefined;
};
const idOf = (x: unknown) => (typeof x === 'string' ? x : (x as { id?: string } | null)?.id || null);

async function disputeCreated(d: Record<string, any>) {
  const o = await orderByPayment(idOf(d.payment_intent), idOf(d.charge));
  if (!o) return 'dispute_unknown_order';
  await patch(`orders?id=eq.${o.id}`, { locked: true, lock_reason: 'dispute', dispute_status: d.status || 'open' });
  // Konto für weitere Käufe sperren (bleibt, bis Markus es in account_flags freigibt)
  await db('account_flags', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: o.user_id, blocked: true, reason: `Rückbuchung ${d.id || ''}`.trim() }),
  });
  return 'locked_dispute';
}

async function disputeClosed(d: Record<string, any>) {
  const o = await orderByPayment(idOf(d.payment_intent), idOf(d.charge));
  if (!o) return 'dispute_unknown_order';
  if (d.status === 'won') {
    // Streitfall gewonnen: Card wieder freigeben (außer sie ist zusätzlich erstattet)
    await patch(`orders?id=eq.${o.id}&lock_reason=eq.dispute`, { locked: false, lock_reason: null, dispute_status: 'won' });
    return 'unlocked_won';
  }
  await patch(`orders?id=eq.${o.id}`, { locked: true, lock_reason: 'dispute', dispute_status: d.status || 'lost' });
  return 'dispute_lost';
}

async function refunded(c: Record<string, any>) {
  if (!c.refunded) return 'partial_refund_ignored'; // nur vollständige Erstattung sperrt die Card
  const o = await orderByPayment(idOf(c.payment_intent), c.id || null);
  if (!o) return 'refund_unknown_order';
  await patch(`orders?id=eq.${o.id}`, { locked: true, lock_reason: o.lock_reason === 'dispute' ? 'dispute' : 'refund' });
  return 'locked_refund';
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
    case 'charge.dispute.created':
      result = await disputeCreated(s);
      break;
    case 'charge.dispute.closed':
      result = await disputeClosed(s);
      break;
    case 'charge.refunded':
      result = await refunded(s);
      break;
  }
  // Datenbankfehler oder Mail fehlgeschlagen → 500, damit Stripe die Meldung später erneut schickt
  // (die Card ist dann schon ausgestellt; beim erneuten Zustellen wird nur die Mail nachgeholt)
  const retry = /(^|,)db_|^serial$|mail_failed/.test(result);
  return new Response(JSON.stringify({ received: true, result }), { status: retry ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
});
