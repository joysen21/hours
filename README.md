# Stunden

Kleine Web-App zum Erfassen von Arbeitsstunden pro Kunde und Tag – optimiert fürs iPhone (Homescreen-App).
Daten liegen in **Supabase** (Postgres + Auth), gehostet wird auf **Vercel**.

- Vanilla JS + Vite, keine Frameworks
- Login mit E-Mail + Passwort (Supabase Auth), Passwort-Reset per Mail
- Row Level Security: jeder Benutzer sieht nur seine eigenen Kunden und Einträge
- Max. 10 Kunden pro Benutzer (im Client und per DB-Trigger)
- Import der Sicherung aus der alten localStorage-Version

## Projektstruktur

```
index.html              Markup aller Ansichten
src/main.js             App-Logik (Erfassen, Einträge, Auswertung, Kunden, Login)
src/supabase.js         Supabase-Client (liest Env-Variablen)
src/style.css           Styles (Light/Dark)
public/                 Icons + Web-Manifest
supabase/schema.sql     Tabellen, RLS-Policies, Trigger
vercel.json             Build-Konfiguration für Vercel
```

## 1. Supabase einrichten

1. Auf <https://supabase.com> ein neues Projekt anlegen (Region z. B. Frankfurt).
2. **SQL Editor** → Inhalt von `supabase/schema.sql` einfügen → **Run**.
3. **Project Settings → API**: `Project URL` und den **Publishable Key** (bzw. `anon public` Key) notieren.
4. **Authentication → URL Configuration**:
   - *Site URL*: später die Vercel-URL, z. B. `https://stunden.vercel.app`
   - *Redirect URLs*: dieselbe URL plus `http://localhost:5173` für die lokale Entwicklung
5. Optional **Authentication → Sign In / Providers → Email**: „Confirm email“ ausschalten, wenn keine Bestätigungsmail nötig ist. Wer die Registrierung für Fremde sperren will, deaktiviert nach dem Anlegen des eigenen Kontos „Allow new users to sign up“.

## 2. Lokal starten

```bash
npm install
cp .env.example .env      # Werte aus Supabase eintragen
npm run dev               # http://localhost:5173
```

## 3. GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<USER>/stunden.git
git push -u origin main
```

(Repo vorher auf GitHub leer anlegen – ohne README/.gitignore.)

## 4. Vercel

1. <https://vercel.com/new> → GitHub-Repo `stunden` importieren.
2. Framework Preset: **Vite** (wird automatisch erkannt).
3. **Environment Variables** hinzufügen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_KEY`
4. **Deploy**. Danach die Vercel-URL in Supabase als *Site URL* / *Redirect URL* eintragen (Schritt 1.4).

Jeder Push auf `main` deployt automatisch neu.

## Daten aus der alten Version übernehmen

1. In der alten App: **Kunden → Sicherung kopieren**, Text z. B. in einer Notiz zwischenspeichern.
2. In der neuen App anmelden: **Kunden → Sicherung** → Text einfügen → **Importieren**.

Kunden werden über den Namen zugeordnet (fehlende werden angelegt), Einträge am selben Tag werden überschrieben.

## Hinweise

- Der Publishable/anon Key ist öffentlich und darf im Frontend stehen – der Schutz kommt über die RLS-Policies. Den `service_role`/Secret Key **nie** im Frontend verwenden.
- Die App braucht eine Internetverbindung zum Speichern; offline erscheint eine Fehlermeldung, Daten gehen dabei nicht verloren, werden aber auch nicht gespeichert.
