# Kasse mit Stripe einrichten (Testmodus)

So läuft ein Kauf:

1. In der App auf **Jetzt kaufen** tippen. Die App ruft die Edge Function `checkout` auf.
2. `checkout` prüft die Anmeldung, den Betrag und die drei Pflicht-Häkchen.
3. `checkout` legt die Bestellung (`orders`, Status `open`) und den Kauf-Nachweis (`purchase_evidence`) an.
4. `checkout` erstellt eine Stripe-Bezahlseite.
5. Der Kunde bezahlt bei Stripe mit Karte, Apple Pay, Google Pay oder Klarna.
6. Stripe meldet die Zahlung an die Edge Function `stripe-webhook`. Sie prüft die Signatur und den Betrag, setzt die Bestellung auf `paid` und vergibt die Seriennummer. **Erst damit ist die Card ausgestellt.**
7. Die App wartet auf der Seite „Zahlung wird bestätigt …“, holt die bezahlte Bestellung und zeigt die neue Card. Wird die App vorher geschlossen, erscheint die Card beim nächsten Öffnen.

Folgendes ist bewusst nicht eingebaut:

- SEPA-Lastschrift
- Managed Payments
- Stripe Tax

## 1. Datenbank

In Supabase den **SQL Editor** öffnen und den kompletten Inhalt von `server/supabase.sql` ausführen. Dabei entsteht die neue Tabelle `orders`.

## 2. Secret Key in Supabase eintragen

1. Den Schlüssel in Stripe holen: **Entwickler → API-Schlüssel → Geheimer Schlüssel** (`sk_test_…`).
2. In Supabase: **Edge Functions → Secrets → Add new secret**.

| Name                    | Wert                                                    |
|-------------------------|---------------------------------------------------------|
| `STRIPE_SECRET_KEY`     | `sk_test_…`                                             |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (erst nach Schritt 4)                         |

Den Schlüssel nur dort eintragen und nirgendwo sonst hineinkopieren, auch nicht in den Chat.

## 3. Edge Functions anlegen

Beide Funktionen anlegen über **Edge Functions → Deploy a new function → Via Editor**. Den Inhalt der Datei jeweils komplett einfügen und dann auf **Deploy** klicken.

| Name             | Datei                                       | „Enforce JWT verification“ |
|------------------|---------------------------------------------|----------------------------|
| `checkout`       | `supabase/functions/checkout/index.ts`      | **an** (Standard)          |
| `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts`| **AUS**                    |

Bei `stripe-webhook` muss der Schalter aus sein, sonst lehnt Supabase jede Meldung von Stripe ab. Der Schalter liegt unter Edge Functions → `stripe-webhook` → **Details**. Die Echtheit prüft die Funktion stattdessen über die Stripe-Signatur.

## 4. Webhook in Stripe anlegen

1. In Stripe: **Entwickler → Webhooks → Ziel hinzufügen**.
2. Bei den Ereignissen diese vier auswählen:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
3. Als Endpunkt-URL eintragen: `https://yfdovwpzbenrpzaxuwpe.supabase.co/functions/v1/stripe-webhook`
4. Nach dem Speichern das **Signaturgeheimnis** (`whsec_…`) aufdecken.
5. In Supabase als Secret `STRIPE_WEBHOOK_SECRET` eintragen.

## 5. Zahlarten in Stripe

Unter **Einstellungen → Zahlungen → Zahlungsmethoden** diese Zahlarten einschalten:

- **Karten**
- **Apple Pay**
- **Google Pay**
- **Klarna**

**Alle anderen Zahlarten ausschalten, vor allem SEPA-Lastschrift.** Seit der Stripe-API-Version 2026-10-28 bestimmt allein diese Einstellung, was auf der Bezahlseite erscheint. Die App kann die Zahlarten nicht mehr selbst vorgeben. Apple Pay und Google Pay erscheinen automatisch auf passenden Geräten.

## 6. Testen

Mit diesen Testdaten bezahlen:

| Fall                | Testdaten                                                   |
|---------------------|-------------------------------------------------------------|
| Erfolgreiche Zahlung| Karte `4242 4242 4242 4242`, beliebiges Datum in der Zukunft, beliebige Prüfziffer |
| Abgelehnte Zahlung  | Karte `4000 0000 0000 0002`                                 |
| Klarna              | Auf der Klarna-Testseite die Testdaten verwenden             |

So kontrollierst du einen Kauf:

- In Supabase unter **Table Editor → orders** muss die Bestellung auf `paid` stehen und eine Seriennummer haben.
- In Stripe unter **Webhooks → Ziel** steht jede Meldung mit Antwort. Bei Erfolg lautet sie `"result":"paid"`.

## Später: Livebetrieb

Den Testmodus auf Live umstellen:

1. In Stripe auf Live umschalten.
2. Den Webhook dort neu anlegen.
3. In Supabase die beiden Secrets auf `sk_live_…` und das neue `whsec_…` ändern.
4. In `app/js/config.js` den veröffentlichbaren Schlüssel auf `pk_live_…` ändern.

## Rückbuchung, Beweise, 3D Secure und E-Mails (V115)

### Was passiert
- **3D Secure:** Jede Kartenzahlung wird in der Banking-App bestätigt. Bei einer Rückbuchung wegen Betrug haftet dann in der Regel die Bank.
- **Rückbuchung (Dispute):**
  - Die Card wird gesperrt: Sie zählt nicht zum Fame-Wert und wird grau angezeigt, ohne Siegel und ohne Teilen.
  - Das Konto kann nichts mehr kaufen.
  - Gewinnst du den Streitfall, ist die Card wieder frei. Die **Konto-Sperre bleibt**, bis du sie selbst aufhebst.
- **Volle Erstattung:** Die Card wird gesperrt. Teilerstattungen ändern nichts.
- **Kaufbestätigung per E-Mail:**
  - Sie geht sofort nach der Zahlung raus.
  - Inhalt: Bestelldaten, Seriennummer, Zeitpunkte der Zustimmungen und der Hinweis, dass das Widerrufsrecht erloschen ist (§ 356 Abs. 5 BGB).
  - AGB und Widerrufsbelehrung hängen an.
- **Widerruf:**
  - Die Erklärung kommt sofort mit einer Eingangsbestätigung per Mail.
  - Gehört die Seriennummer zu einer bezahlten Card mit Verzicht, steht in der Mail auch, dass das Widerrufsrecht erloschen ist.
- **Beweise:** Gespeichert werden:
  - die IP-Adresse beim Kauf
  - die Zahlart, die Karte und das Ergebnis von 3D Secure
  - wann die Card in der App angekommen ist und wann sie aufgedeckt wurde
  - wann die Bestätigungs-Mail verschickt wurde

### Einrichten
1. **SQL Editor:** den kompletten Inhalt von `server/supabase.sql` noch einmal ausführen. Den Modus oben rechts auf **Database** stellen, nicht auf Logs.
2. **Secrets** (Edge Functions → Secrets):
   - `BREVO_API_KEY`: der API-Schlüssel aus Brevo („SMTP & API“, beginnt mit `xkeysib-`)
   - optional `MAIL_FROM` (Standard `noreply@fame-app.de`) und `MAIL_REPLY_TO` (Standard `fame.app.2026@gmail.com`)
3. **Edge Functions neu einspielen** (jeweils Code ersetzen und **Deploy**):
   - `checkout`
   - `stripe-webhook`
   - **neu:** `withdraw`. Bei dieser Funktion unter Settings **„Verify JWT“ ausschalten**, weil der Widerruf auch ohne Login gehen muss.
4. **Stripe → Webhooks → dein Ziel → Ereignisse bearbeiten.** Diese drei ergänzen:
   - `charge.dispute.created`
   - `charge.dispute.closed`
   - `charge.refunded`

### Im Streitfall
- In Supabase den **SQL Editor** öffnen und Folgendes ausführen, mit der Seriennummer der betroffenen Card:
  ```sql
  select * from admin.dispute_evidence where seriennummer = 'FM-XXXX-XXXX-X';
  ```
- Die Zeile enthält alles, was Stripe für digitale Güter sehen will:
  - Kunden-E-Mail
  - Zeitpunkte von Zustimmung, Zahlung, Bestätigungs-Mail, Auslieferung und Aufdecken
  - Häkchen (AGB, ab 18, Verzicht) und AGB-Fassung
  - IP-Adresse und Gerät
  - Karte und Ergebnis von 3D Secure
- Diese Angaben trägst du bei Stripe unter **Zahlungen → Streitfälle → Beweise einreichen** ein.
- Zusätzlich hochladen:
  - die Kaufbestätigungs-Mail (bei Brevo unter Transaktional → Logs)
  - AGB und Widerrufsbelehrung

### Konto-Sperre aufheben
**Table Editor → account_flags:** die Zeile des Kunden löschen oder `blocked` auf `false` setzen.
