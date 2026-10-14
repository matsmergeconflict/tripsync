# TripSync

Organisation von Gruppenreisen mit unterschiedlichen An- und Abreisen (Skiurlaub, Hüttenwochenende, Gruppenfahrt).
Teilnehmer melden sich per Link ohne Konto an. Organisatoren sehen auf einer Gantt-Zeitachse, wer wann da ist,
und bekommen Tageszahlen, Skipass-Bedarf, Portionen und eine automatische Einkaufsliste.

## Funktionen

- **Zeitachse (Gantt)**: eine Zeile pro Person, Aufenthalt als Balken; An-/Abreise, unbestätigte und fehlende
  Angaben per Symbol, Muster und Text unterscheidbar; Tageszeile mit Anwesenden, An-/Abreisen, Skipässen, Essen;
  Suche, Filter, Sortierung, Wochenabschnitte, Tages- und Listenansicht; fixierte Namensspalte.
- **Anmeldung ohne Konto** in 4 Schritten (Person, Aufenthalt per Kalender, Skipass, Essen) + Prüfen.
- **Persönlicher Bearbeitungslink**: ändern, ergänzen, zurückziehen. Organisatoren können Links neu erzeugen.
- **Öffentliche Übersicht** (abschaltbar) mit Anzeigename und Zeitraum – keine privaten Daten.
- **Teilnehmerverwaltung**: Tabelle/Karten, Filter (An-/Abreise/Anwesend am Tag, Skipass, Angaben fehlen, …),
  Korrekturen durch Organisatoren mit Änderungsprotokoll.
- **Skipässe**: Bedarf pro Tag und Kategorie, unklare/unvollständige Wünsche, konfigurierbare Kategorien und Preise.
- **Essensplanung**: Mahlzeiten pro Tag, Rezepte mit Zutaten, Portionen aus Anmeldungen (überschreibbar).
- **Einkaufsliste**: deterministische Aggregation mit Einheitenumrechnung, Warengruppen, Abhaken, Teams/Geschäfte,
  manuelle Artikel, bestätigungspflichtige Vereinheitlichung von Zutatennamen.
- **Mehrere Organisatoren** gleichzeitig, Live-Aktualisierung, Konflikterkennung.
- **CSV-Exporte**: Teilnehmer, Tagesübersicht, Skipässe, Essensplan, Einkaufsliste, Küchenliste (vertraulich).

Entscheidungen und Abweichungen von der Spezifikation: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Lokal starten

Voraussetzungen: Node.js ≥ 20, PostgreSQL ≥ 14.

```bash
npm install
cp .env.example .env.local          # DATABASE_URL anpassen
createdb tripsync                   # oder vorhandene Datenbank verwenden
DATABASE_URL=postgres://… npm run db:migrate
npm run dev                         # http://localhost:3000
```

Demodaten (eine Skiwoche mit 12 Personen, Rezepten und Mahlzeiten) über die laufende App anlegen:

```bash
BASE_URL=http://localhost:3000 npm run db:seed-demo
```

Das Skript gibt Organisator-, Einladungs- und öffentlichen Link aus.

## Tests

```bash
npm test               # Unit-Tests: Datumslogik, Tagesstatistik, Skipässe, Einheiten, Einkaufsliste
npm run test:e2e       # Build + Playwright: API/Berechtigungen, Desktop-Ablauf, Smartphone
npm run test:all       # Lint, Typen, Unit, E2E
```

Die E2E-Tests nutzen eine eigene Datenbank (`TEST_DATABASE_URL`, Standard
`postgres://tripsync:tripsync@localhost:5432/tripsync_test`), die vor jedem Lauf zurückgesetzt wird.

## Deployment (nicht durchgeführt)

Läuft überall, wo Node.js und PostgreSQL verfügbar sind (z. B. Vercel/Render/Fly + Supabase- oder Neon-Postgres):

1. `DATABASE_URL` setzen, optional `APP_URL` (öffentliche Basis-URL für erzeugte Links).
2. `npm run db:migrate`, dann `npm run build && npm start`.
3. Backups auf Datenbankebene einrichten.

Hinweis: Live-Aktualisierung nutzt Server-Sent Events mit einer dauerhaften Postgres-Verbindung (`LISTEN`).
Bei Serverless-Hosting ohne langlebige Verbindungen fällt die App automatisch auf 30-Sekunden-Polling zurück.

## Projektstruktur

```
db/migrations/          SQL-Schema
scripts/                Migration, Demodaten
src/lib/                reine Logik (Datum, Statistik, Einheiten, Einkauf, Validierung)
src/lib/server/         DB, Auth, Tokens, Realtime, Audit (nur Server)
src/app/api/            Route Handler (alle Berechtigungsprüfungen)
src/app/trips/[id]/     Organisatoren-Oberfläche
src/app/join|edit|view  Teilnehmer- und öffentliche Seiten
src/components/         Gantt, Kalender, Formular, UI-Bausteine
tests/unit, tests/e2e   Tests
```
