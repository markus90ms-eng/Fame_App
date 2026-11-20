// Supabase Edge Function "withdraw": Online-Widerruf („Vertrag widerrufen“ in der App, § 356a BGB).
// Speichert die Erklärung (Tabelle "withdrawals") und schickt sofort eine Eingangsbestätigung per E-Mail.
// Gehört der angegebene Kauf (Seriennummer) zu einer bezahlten Card, bei deren Kauf der Kunde der sofortigen
// Ausstellung zugestimmt und den Verlust des Widerrufsrechts bestätigt hat, steht in derselben Mail,
// dass das Widerrufsrecht erloschen ist (§ 356 Abs. 5 BGB).
//
// Geht auch ohne Login. „Verify JWT“ bei dieser Funktion AUSSCHALTEN.
// Schutz vor Missbrauch: höchstens 3 Bestätigungs-Mails pro Adresse in 24 Stunden (die Erklärung wird trotzdem gespeichert).
//
// Secrets: BREVO_API_KEY, optional MAIL_FROM / MAIL_REPLY_TO, ALLOWED_ORIGIN (wie bei "connect").

const env = (name: string) => Deno.env.get(name) || '';
const SB_URL = env('SUPABASE_URL');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const SITE = 'https://fame-app.de/app/';
const ORIGINS = (env('ALLOWED_ORIGIN') || 'https://fame-app.de,https://www.fame-app.de,https://markus90ms-eng.github.io')
  .split(',').map((o) => o.trim()).filter(Boolean);

const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
});
const rows = async (path: string) => (await (await db(path)).json().catch(() => [])) as Record<string, any>[];

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const when = (iso: string, en: boolean) => new Date(iso).toLocaleString(en ? 'en-GB' : 'de-DE', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Europe/Berlin' });
const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${k}</td><td style="padding:4px 0;font-weight:bold">${v}</td></tr>`;
const frame = (inner: string) => `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#141414">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-size:26px;font-weight:800;letter-spacing:-.02em;margin-bottom:18px">Fam€</div>
<div style="background:#fff;border:2px solid #141414;padding:22px 20px;line-height:1.55;font-size:15px">${inner}</div>
<p style="font-size:12px;color:#666;line-height:1.5;margin-top:16px">Scultetus · Inhaber Markus Schultheiß · <a href="${SITE}impressum.html" style="color:#666">Impressum</a> · <a href="${SITE}datenschutz.html" style="color:#666">Datenschutz</a></p>
</div></body></html>`;

const SERIAL = /FM-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]/;

async function sendMail(to: string, subject: string, html: string) {
  if (!env('BREVO_API_KEY')) return { error: 'no_key' };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env('BREVO_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Fam€', email: env('MAIL_FROM') || 'noreply@fame-app.de' },
      replyTo: { email: env('MAIL_REPLY_TO') || 'fame.app.2026@gmail.com' },
      to: [{ email: to }], subject, htmlContent: html,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { id: body.messageId || 'ok' } : { error: body.message || `brevo_${res.status}` };
}

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

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const str = (k: string, max: number) => String(input?.[k] ?? '').trim().slice(0, max);
  const name = str('name', 120), contract = str('contract', 80), email = str('email', 200).toLowerCase(), note = str('note', 1000);
  const en = input?.lang === 'en';
  if (!name || !contract || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'bad_request' }, 400);

  // Angemeldet? Dann den Widerruf dem Konto zuordnen
  let userId: string | null = null;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token.split('.').length === 3) {
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
    if (u.ok) userId = (await u.json().catch(() => null))?.id || null;
  }

  // Gehört der Kauf zu einer bezahlten Card mit Verzicht aufs Widerrufsrecht?
  const serial = SERIAL.exec(contract.toUpperCase())?.[0] || null;
  let order: Record<string, any> | undefined;
  let consentAt: string | null = null;
  if (serial) {
    order = (await rows(`orders?serial=eq.${serial}&status=eq.paid&select=id,user_id,paid_at,amount`))[0];
    if (order) {
      const ev = (await rows(`purchase_evidence?order_id=eq.${order.id}&select=created_at,waiver_accepted`))[0];
      if (ev?.waiver_accepted) consentAt = ev.created_at;
    }
  }
  const expired = !!(order && consentAt);

  // 1. Erklärung speichern (immer – auch wenn danach keine Mail rausgeht)
  const ins = await db('withdrawals', {
    method: 'POST',
    body: JSON.stringify({ name, contract, email, note: note || null, user_id: userId, order_id: order?.id || null, expired }),
  });
  const saved = (await ins.json().catch(() => []))?.[0];
  if (!ins.ok || !saved?.id) return json({ error: 'db' }, 500);
  const at = saved.created_at || new Date().toISOString();

  // 2. Eingangsbestätigung (höchstens 3 pro Adresse in 24 Stunden)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = await rows(`withdrawals?email=eq.${encodeURIComponent(email)}&mail_sent_at=gte.${since}&select=id`);
  let mail = 'skipped_limit';
  if (recent.length < 3) {
    const facts = `<table style="border-collapse:collapse;margin:12px 0">
${row(en ? 'Received' : 'Eingang', esc(when(at, en)))}${row('Name', esc(name))}${row(en ? 'Purchase' : 'Kauf', esc(contract))}${row(en ? 'Email' : 'E-Mail', esc(email))}${note ? row(en ? 'Note' : 'Anmerkung', esc(note)) : ''}
</table>`;
    const verdict = expired
      ? (en
        ? `<p>When buying the card <b>${esc(serial)}</b> on ${esc(when(consentAt!, true))}, you expressly requested that we issue it immediately and confirmed that you understand you lose your right of withdrawal. <b>Your right of withdrawal therefore expired when the card was issued on ${esc(when(order!.paid_at, true))}</b> (§ 356 (5) German Civil Code), so we cannot refund the purchase. Statutory rights in case of defects remain unaffected. If you think this is a mistake, just reply to this email.</p>`
        : `<p>Beim Kauf der Card <b>${esc(serial)}</b> am ${esc(when(consentAt!, false))} hast du ausdrücklich verlangt, dass wir sie sofort ausstellen, und bestätigt, dass dir bewusst ist, dass du damit dein Widerrufsrecht verlierst. <b>Dein Widerrufsrecht ist deshalb mit der Ausstellung der Card am ${esc(when(order!.paid_at, false))} erloschen</b> (§ 356 Abs. 5 BGB). Eine Erstattung ist daher nicht möglich. Gesetzliche Rechte bei Mängeln bleiben unberührt. Wenn du meinst, dass hier ein Fehler vorliegt, antworte einfach auf diese E-Mail.</p>`)
      : (en
        ? `<p>We are checking your withdrawal and will get back to you within 14 days.</p>`
        : `<p>Wir prüfen deinen Widerruf und melden uns innerhalb von 14 Tagen bei dir.</p>`);
    const html = frame(en
      ? `<h1 style="font-size:20px;margin:0 0 12px">We have received your withdrawal</h1><p>This email confirms that your withdrawal reached us.</p>${facts}${verdict}`
      : `<h1 style="font-size:20px;margin:0 0 12px">Dein Widerruf ist bei uns eingegangen</h1><p>Mit dieser E-Mail bestätigen wir dir den Eingang deines Widerrufs.</p>${facts}${verdict}`);
    const r = await sendMail(email, en ? 'Your withdrawal – confirmation of receipt' : 'Dein Widerruf – Eingangsbestätigung', html);
    if ('error' in r) { console.warn('Widerrufs-Bestätigung nicht verschickt:', r.error); mail = 'failed'; }
    else { mail = 'sent'; await db(`withdrawals?id=eq.${saved.id}`, { method: 'PATCH', body: JSON.stringify({ mail_sent_at: new Date().toISOString() }) }); }
  }
  return json({ ok: true, at, mail, expired });
});
