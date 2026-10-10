# Login mit Supabase einrichten

Die App spricht schon mit dem Projekt `https://yfdovwpzbenrpzaxuwpe.supabase.co`
(öffentliche Werte in `js/config.js`). Im Supabase-Dashboard fehlen noch diese Schritte.

> Geheime Werte (Secret key / service_role, Datenbank-Passwort, Client Secrets von Google
> und Apple) gehören nur ins Supabase-Dashboard – nie in die App und nie in einen Chat.

## 1. Tabelle anlegen (Pflicht)

1. Links **SQL Editor** → **New query**.
2. Den Inhalt von `server/supabase.sql` hineinkopieren → **Run**.
3. Unter **Table Editor** erscheint die Tabelle `profiles`.

Ohne diese Tabelle klappt das Login, aber Accounts und Cards bleiben nur auf dem Handy.

## 2. Adressen eintragen (Pflicht)

**Authentication → URL Configuration**

- **Site URL:** `https://markus90ms-eng.github.io/Fame_App/`
- **Redirect URLs** → *Add URL*: `https://markus90ms-eng.github.io/Fame_App/`

Dahin führen die Links aus den Mails und die Rückkehr von Apple/Google.

## 3. E-Mails (wichtig vor dem Start)

Supabase verschickt Bestätigungs- und „Passwort vergessen“-Mails zum Testen selbst, aber
nur wenige pro Stunde und nur an Adressen aus deinem Supabase-Team. Für echte Nutzer:

- **Authentication → Emails → SMTP Settings** einen Mail-Dienst eintragen
  (z. B. Resend oder Brevo, beide haben einen kostenlosen Einstieg).
- Optional unter **Authentication → Sign In / Providers → Email** „Confirm email“
  ausschalten: Dann ist man nach dem Registrieren sofort drin (ohne Bestätigungs-Mail).

## 4. Google (optional, kostenlos)

1. In der Google Cloud Console ein Projekt anlegen → **OAuth-Zustimmungsbildschirm**
   (Name „Fam€“) → **Anmeldedaten → OAuth-Client-ID → Webanwendung**.
2. Als „Autorisierte Weiterleitungs-URI“ die Callback-Adresse eintragen, die Supabase unter
   **Authentication → Sign In / Providers → Google** anzeigt
   (`https://yfdovwpzbenrpzaxuwpe.supabase.co/auth/v1/callback`).
3. Client-ID und Client-Secret dort bei Supabase eintragen und **Google** einschalten.

## 5. Apple (optional, braucht Apple-Developer-Konto für 99 €/Jahr)

1. developer.apple.com → **Certificates, IDs & Profiles**: eine **Services ID** mit
   „Sign in with Apple“ anlegen, Domain `yfdovwpzbenrpzaxuwpe.supabase.co`,
   Return-URL `https://yfdovwpzbenrpzaxuwpe.supabase.co/auth/v1/callback`.
2. Einen **Key** mit „Sign in with Apple“ erzeugen (.p8-Datei).
3. Bei Supabase unter **Sign In / Providers → Apple** Services ID, Team-ID, Key-ID und den
   Schlüssel eintragen und **Apple** einschalten. (Den Schlüssel muss man alle 6 Monate erneuern.)

Solange Google oder Apple nicht eingeschaltet sind, zeigt die App beim Tippen auf den
Knopf einen Hinweis und man registriert sich mit E-Mail.
