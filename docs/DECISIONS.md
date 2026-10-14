# Architektur- und Produktentscheidungen

Stand: Oktober 2026. Jede Entscheidung mit Begründung und ggf. Abweichung von der Spezifikation.

## 1. Stack

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Framework | Next.js 16 (App Router, Cache Components) + TypeScript + React 19 | wie spezifiziert |
| Styling | Tailwind CSS v4 mit eigenem Theme (`src/app/globals.css`) | wie spezifiziert |
| Datenbank | **PostgreSQL 16, direkt über `pg`** | siehe 2. |
| Validierung | Zod (gleiche Schemas für Client und Server) | eine Quelle der Wahrheit |
| Tests | Vitest (Logik), Playwright (API, Desktop, Smartphone) | Abnahmekriterium 10 |

## 2. Abweichung: PostgreSQL statt Supabase

Die Spezifikation empfiehlt Supabase. In der Entwicklungsumgebung war weder Docker (für den lokalen
Supabase-Stack) noch ein Supabase-Konto verfügbar, und ein gehostetes Projekt wäre ein externer Dienst,
der deine Freigabe braucht. Daher:

- Schema ist **reines PostgreSQL** (`db/migrations/*.sql`) und läuft unverändert auf Supabase-Postgres
  (dort einfach `DATABASE_URL` auf die Supabase-Verbindung setzen).
- **Sicherheitsregeln werden serverseitig** in jedem Route Handler durchgesetzt (nicht über RLS).
  Der Browser spricht nie direkt mit der Datenbank; es gibt keine Datenbank-Zugangsdaten im Client.
- **Realtime** über Postgres `LISTEN/NOTIFY` + Server-Sent Events (`src/lib/server/realtime.ts`).
  Funktioniert auch mit mehreren Server-Instanzen, da die Benachrichtigung über die Datenbank läuft.
  Fallback: Polling alle 30 s ohne Verbindung, zusätzlich ein vollständiges Neuladen alle 2 min und beim Zurückkehren in den Tab; nach Wiederverbindung des LISTEN-Clients erhalten alle offenen Ansichten ein „resync“.

Ein späterer Umstieg auf Supabase Auth/Realtime ist möglich, aber nicht nötig.

## 3. Zugänge ohne Benutzerkonto

| Rolle | Mechanismus |
|---|---|
| Organisator | persönlicher geheimer Link `/o/<token>` → wird gegen ein **httpOnly-Cookie** pro Reise getauscht, damit der Token nicht in der Adresszeile bleibt. Mehrere Organisatoren mit eigenem Link; Links können neu erzeugt oder entzogen werden. |
| Teilnehmer (schreiben) | persönlicher Link `/edit/<token>`, Token wird im Header `x-edit-token` an `/api/me` gesendet. Der Endpunkt kann **nur** die zum Token gehörende Anmeldung lesen/schreiben – IDs im Request werden ignoriert. |
| Einladung (neue Anmeldung) | `/join/<code>` – darf nur anlegen, nichts lesen. Abschaltbar, erneuerbar. |
| Öffentliche Übersicht (lesen) | `/view/<code>` – separater Code, nur wenn freigegeben, sonst 404. |

- Tokens: 256 Bit aus `crypto.randomBytes`, base64url. Codes: 96 Bit.
- In der Datenbank liegen **nur SHA-256-Hashes** der Tokens. Deshalb kann ein Link nicht „erneut angezeigt“
  werden – „erneut versenden“ heißt: neuen Link erzeugen (alter wird sofort ungültig).
- Organisator-E-Mail-Login wurde bewusst nicht gebaut (bräuchte einen Mail-Dienst).
- Zustandsändernde Requests mit Cookie-Auth prüfen den `Origin`-Header (CSRF-Schutz) zusätzlich zu `SameSite=Lax`.
- `Referrer-Policy: no-referrer` global, damit persönliche Links nicht über Referer abfließen.

## 4. Datumssemantik

- Alle Reisetage sind `DATE` (Kalendertag, keine Zeitzone) und werden als `"YYYY-MM-DD"` übertragen.
  Dadurch keine Verschiebungen durch Sommerzeit oder Zeitzonen.
- **Anreisetag und Abreisetag zählen als anwesend** (inklusives Intervall).
- **Übernachtung**: Nacht von Tag d auf d+1 für `arrival ≤ d < departure`.
- Uhrzeiten (Ankunft/Abfahrt) sind informativ und ändern die Tageszählung nicht.
- **Zeitraum verkürzen** ist nur möglich, wenn keine Anmeldung, Ski-/Essenstage oder Mahlzeiten außerhalb liegen (Server prüft, sonst 400 mit Erklärung).
- **Fehlende Angaben werden nie ergänzt**: Ohne vollständigen Zeitraum zählt eine Person an keinem Tag als
  anwesend; bekannte An- bzw. Abreise wird trotzdem in „Anreisen/Abreisen“ gezählt und im Gantt markiert.
- An-/Abreise und Ski-/Essenstage müssen im Reisezeitraum liegen (Server prüft). Skitage außerhalb des
  eigenen Aufenthalts sind erlaubt, werden aber als Hinweis markiert.
- Skipass zählt an einem Tag nur bei `ski_need = yes` **und** gewähltem Tag. Skitage sind unabhängig vom Aufenthalt.
- Essen: „an allen Tagen vor Ort“, „einzelne Tage“, „nein“ oder „unklar“ (unklar wird separat ausgewiesen, nicht geschätzt).

## 5. Gleichzeitiges Arbeiten

- Optimistische Sperre über eine `version`-Spalte (Reise, Anmeldung, Mahlzeit, Rezept).
  Veraltete Saves → HTTP 409 mit aktuellem Stand; die UI lädt neu und weist darauf hin. Nichts wird still überschrieben.
- Alle Organisator- und Teilnehmeränderungen landen im **Änderungsprotokoll** (`audit_log`), inkl. Feld-Diff.
  Inhalte sensibler Felder (Allergien, Kontakt, Kommentar, Essenswünsche) werden dort maskiert.

## 6. Datenschutz

- Öffentliche Ansicht nutzt eine **Allowlist** (`toPublic` in `src/lib/server/repo.ts`): Anzeigename
  (Vorname + Initiale), An-/Abreise, Status; Skitage nur bei ausdrücklicher Freigabe durch die Person.
- Allergien erscheinen nur für Organisatoren und im ausdrücklich benannten Export „Küchenliste (vertraulich)“.
- Kein Export enthält Tokens oder Links. CSV-Zellen werden gegen Formel-Injektion entschärft.
- Teilnehmer können zurückziehen; Organisatoren können Anmeldungen oder die ganze Reise endgültig löschen.
- Keine externen Dienste, keine Tracker, keine Google-Fonts (Systemschriften).

## 7. Einkaufsliste und „KI“-Vereinheitlichung

- Mengen werden **deterministisch** berechnet: `Menge × Portionen / Rezeptportionen`, Addition nur innerhalb
  derselben Dimension (g↔kg, ml↔l). Stück, EL, Packungen usw. werden nie mit Masse/Volumen verrechnet;
  dieselbe Zutat in inkompatiblen Einheiten erscheint als zwei Zeilen mit Hinweis.
- Portionen pro Mahlzeit = Personen, die an dem Tag mitessen; manuell überschreibbar.
- Vereinheitlichung von Zutatennamen: **lokaler heuristischer Vorschlagsgenerator** (Plural, Reihenfolge,
  Satzzeichen, Teilmengen) statt eines LLM – kein kostenpflichtiger externer Dienst ohne Freigabe.
  Vorschläge werden **nie automatisch** übernommen; bestätigte Zuordnungen sind sichtbar und rückgängig zu machen.
  Ein LLM-Anbieter könnte später als zusätzliche Vorschlagsquelle eingehängt werden (gleiche Bestätigungslogik).

## 8. Bewusst nicht umgesetzt / Grenzen

- Kein produktives Deployment (bedarf deiner Freigabe und eines Hosters).
- Keine automatischen Backups im Code – auf Hosting-Ebene einrichten (z. B. `pg_dump`-Cronjob oder Supabase-Backups).
- Mehrere Aufenthaltszeiträume pro Person: Tabelle `stays` ist vorbereitet (1:1), UI unterstützt einen Zeitraum.
- Ratenbegrenzung ist pro Serverprozess im Speicher (für mehrere Instanzen ggf. Redis o. ä.).
- Skipass-Kosten sind eine einfache Schätzung (Tagespreis × Personentage), ohne Mehrtagestarife.
- Mehrere Reisen: Datenmodell und URLs unterstützen beliebig viele Reisen; es gibt aber (gewollt, da ohne Konto)
  keine Liste „meine Reisen“ – jede Reise erreicht man über ihren Organisator-Link.
