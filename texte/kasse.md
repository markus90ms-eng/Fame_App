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

Die App fragt nur Karte und Klarna an. Apple Pay und Google Pay erscheinen automatisch auf passenden Geräten. SEPA erscheint nie, auch wenn es eingeschaltet ist.

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
