# Eigene Domain: fame-app.de

Die App läuft über GitHub Pages. So kommt sie auf `https://fame-app.de/`.
Reihenfolge einhalten: erst DNS, dann GitHub, dann die Dienste.

## 1. DNS beim Domain-Anbieter

Im Kundenbereich des Anbieters die DNS-Einträge für `fame-app.de` öffnen und eintragen
(vorhandene A-/AAAA-Einträge für `@` und `www`, z. B. eine Parkseite des Anbieters, vorher löschen):

| Typ   | Name / Host | Wert                     |
|-------|-------------|--------------------------|
| A     | @           | 185.199.108.153          |
| A     | @           | 185.199.109.153          |
| A     | @           | 185.199.110.153          |
| A     | @           | 185.199.111.153          |
| AAAA  | @           | 2606:50c0:8000::153      |
| AAAA  | @           | 2606:50c0:8001::153      |
| AAAA  | @           | 2606:50c0:8002::153      |
| AAAA  | @           | 2606:50c0:8003::153      |
| CNAME | www         | markus90ms-eng.github.io |

`@` steht für die Domain selbst (manche Anbieter lassen das Feld dafür leer).
Bis die Einträge überall bekannt sind, dauert es meist 10 Minuten bis wenige Stunden.

## 2. Domain bei GitHub absichern (empfohlen)

GitHub → oben rechts Profilbild → **Settings** → **Pages** → **Add a domain** → `fame-app.de`.
GitHub zeigt einen TXT-Eintrag (`_github-pages-challenge-markus90ms-eng`). Diesen beim Anbieter
eintragen und dann **Verify** klicken. So kann niemand anders die Domain auf GitHub nutzen.

## 3. Domain in der App einschalten

Repository `Fame_App` → **Settings** → **Pages** → **Custom domain**: `fame-app.de` → **Save**.
Sobald der Haken grün ist: **Enforce HTTPS** anhaken (das Zertifikat kommt automatisch, kann bis zu
einer Stunde dauern). Die alte Adresse `markus90ms-eng.github.io/Fame_App/` leitet danach automatisch weiter.

## 4. Neue Adresse in den Diensten eintragen

Die alte Adresse jeweils erst einmal stehen lassen und die neue **zusätzlich** eintragen.

- **Supabase** → Authentication → URL Configuration
  - Site URL: `https://fame-app.de/`
  - Redirect URLs: `https://fame-app.de/` hinzufügen
- **Supabase** → Edge Functions → `connect` neu bereitstellen (die neue Fassung erlaubt Anfragen von fame-app.de).
  Falls das Secret `ALLOWED_ORIGIN` gesetzt ist: auf `https://fame-app.de,https://www.fame-app.de` ändern oder löschen.
- **TikTok for Developers** → App → Login Kit → Redirect URI: `https://fame-app.de/`
- **Snap Kit** → App → Redirect URI: `https://fame-app.de/`
- **Meta / Instagram** → Business-Login → Gültige OAuth-Redirect-URIs: `https://fame-app.de/`
- **Google Cloud** (Login mit Google) → OAuth-Zustimmungsbildschirm → Autorisierte Domains: `fame-app.de`;
  Startseite, Datenschutz und Nutzungsbedingungen auf die neue Adresse ändern.
- **Apple** (Login mit Apple) → Services ID → Domains: `fame-app.de` ergänzen.

Datenschutzerklärung für die Plattformen: `https://fame-app.de/datenschutz.html`

## 5. E-Mail (optional)

Beim Domain-Anbieter eine Weiterleitung einrichten, z. B. `hallo@fame-app.de` → `Fame.app.2026@gmail.com`.
Dann kann die neue Adresse in Impressum und Rechtstexten stehen.
