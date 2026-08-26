# SCHULINDEX

Anonymes, verifiziertes Schulbewertungsportal für Deutschland.
Das Portal wird vollständig deutschsprachig ausgeliefert.

**Der Stand der Planung liegt in `docs/`:**

| Dokument | Inhalt |
|---|---|
| [`docs/dev-plan.md`](docs/dev-plan.md) | Entwicklungsplan: Sprachkonzept, Stack, Datenmodell, Scoring, Anti-Fraud, Recht, Arbeitspakete, Meilensteine, offene Punkte |
| [`docs/fragebogen-de.md`](docs/fragebogen-de.md) | Deutscher Fragebogen (kanonische Fassung), Antwortskalen, Ansprachevarianten |
| [`docs/userflow-abgleich.md`](docs/userflow-abgleich.md) | Abgleich des SchoolUserFlow gegen die Specs: was übernommen, angepasst und ergänzt wird |

## Stand der Umsetzung

Begonnen mit dem Domänenkern — dem Teil, der von den offenen Entscheidungen nicht
abhängt und bei dem Korrektheit am meisten zählt:

| Modul | Inhalt |
|---|---|
| `src/domain/fragebogen.ts` | Alle 61 Fragen, sechs Kategorien, drei Antwortskalen, Gewichtungen, Du-/Sie-Varianten |
| `src/domain/scoring.ts` | Kategoriescores, 70/30-Aufteilung der Kategorie A, Gesamtscore, Aggressionsindex, Ampelstufen |
| `src/domain/aggregation.ts` | Zusammenfassung aller Bewertungen einer Schule, Sichtbarkeitsschwellen, Trend |
| `src/domain/geopruefung.ts` | Entfernungsprüfung bei der Abgabe, 150-km-Grenze |
| `src/domain/bewertungseingabe.ts` | Prüfung einer eingereichten Bewertung — dieselben Regeln im Browser und auf dem Server |
| `src/domain/kontakt.ts` | Kontaktdaten: Normalisierung, Suchhash, Verschlüsselung, verschleierte Anzeige |
| `src/domain/verifizierung.ts` | Bestätigungstoken — Klartext geht raus, nur der Hash bleibt |
| `src/versand/nachricht.ts` | Versandkette WhatsApp → SMS → E-Mail |
| `src/dienste/bewertungAbgeben.ts` | Der Ablauf der Abgabe, mit hereingereichten Abhängigkeiten |
| `src/domain/betrugspruefung.ts` | Automatische Signale vor der Freigabe — Signale, keine Entscheidungen |
| `src/domain/bewertungsstatus.ts` | Zustände einer Bewertung und die erlaubten Übergänge |
| `src/import/schulart.ts` | Normalisierung der 232 Schulartbezeichnungen aus jedeschule.codefor.de auf die Taxonomie des Portals |
| `src/import/slug.ts` | Slug-Vergabe für Schulprofile — umlautfest und über Re-Importe hinweg stabil |
| `src/import/geokodierung.ts` | Ablauf der Nachgeocodierung: gestufte Anfragen, Genauigkeit, Plausibilitätsprüfung |
| `src/import/photon.ts` | Anbindung an Photon, mit Takt, Wiederholungen und Zwischenspeicher |
| `src/domain/bundesland.ts` | Die 16 Bundesländer als Domänenbegriff |
| `src/import/normalisiere.ts` | Rohdatensatz → Schule: Adresse, Koordinate samt Reparatur vertauschter Werte, Suchtext |
| `src/import/dubletten.ts` | Zusammenführung mehrfach gelieferter Schulen, Standorte bleiben erhalten |
| `src/db/schulsuche.ts` | Autovervollständigung, unscharfe Suche, Umkreissuche, Filter |
| `app/` | Next.js-Anwendung: Startseite, Suche, Schulprofil, Bewertungsformular, Bestätigung |
| `src/dienste/umgebung.ts` | Anbindung des Abgabedienstes an Postgres — das einzige SQL außerhalb der Abfrageschicht |
| `messages/de.json` | Alle Oberflächentexte |
| `db/migrations/` | Datenbankschema |
| `scripts/lade-schulen.ts` | Abruf des Schulbestands, mit Abgleich gegen die Statistik der Quelle |
| `scripts/importiere.ts` | Import in die Datenbank, wiederholbar |
| `scripts/geokodiere.ts` | Holt fehlende Koordinaten nach, wiederaufnehmbar |
| `scripts/pruefe-koordinaten.test.ts` | Qualitätstor: prüft die Koordinaten gegen die Datenbank |
| `scripts/suche.test.ts` | Prüft die Suche an den echten Daten |
| `scripts/durchstich.test.ts` | Durchstich: echte Schulen, Bewertungen, Aggregation |

```bash
npm install
npm test        # 278 Tests
npm run typecheck
cp .env.example .env  # Schlüssel erzeugen, siehe Kommentare in der Datei
npm run dev          # Anwendung unter http://localhost:3000

# Messung der Schulart-Normalisierung am echten Bestand (34.094 Datensätze):
npx tsx scripts/lade-schulen.ts > schulen.json
SCHULEN_JSON=schulen.json npx vitest run scripts/analyse-schularten.test.ts

# Import in eine Datenbank (Schema: db/migrations/)
SCHULEN_JSON=schulen.json DATABASE_URL=postgres://… npx tsx scripts/importiere.ts
```

**Kein PostGIS nötig.** Geprüft an echten Daten: `cube` und `earthdistance`
leisten die Entfernungsprüfung auf den Kilometer genau und die Umkreissuche in
1,4 ms über 27.393 Schulen. Polygone oder Routing braucht das Portal nirgends.

Der Rohbestand liegt bewusst nicht im Repository (rund 12 MB). Er wird von
`https://jedeschule.codefor.de/schools/` geladen; ohne die Datei überspringt der
Messlauf sich selbst.

Die Tests halten insbesondere die Stellen fest, an denen die Spezifikation rechnerisch nicht
aufging: die Ampelgrenzen des Aggressionsindex ließen zwei Wertebereiche undefiniert, und der
Faktor 20 hätte eine tote Zone zwischen 0 und 20 erzeugt — die Skala wird deshalb normalisiert
statt multipliziert.

## Entschieden am 26.08.2026

Alle vierzehn zuvor offenen Punkte sind entschieden — das Protokoll steht in Abschnitt 15
des Entwicklungsplans. Die wichtigsten:

- **SCHULINDEX auf schulindex.com**, Name korrigiert
- **Konten für alle Altersgruppen**, Anmeldung per Magic Link — die Developer Specification muss an dieser Stelle geändert werden
- **Telefonnummer als primärer Kontaktweg** (WhatsApp, dann SMS), E-Mail nur als Rückfall
- **Score auf einer Skala von 0 bis 10**, Farbgrenzen an den Antwortstufen: ab 7,5 grün, ab 5,0 gelb
- **Ab 10 Bewertungen** wird ein Schulprofil ausgewertet, ab 20 erscheint die Schule in Ranglisten
- **Durchgehend du**, auch gegenüber Eltern und Lehrkräften
- **Verlosung schon im MVP** — Launch damit bei 13 Sprints statt elf

Drei Punkte stehen ausdrücklich zur Abnahme durch die Kanzlei: Elterneinwilligung per
Checkbox, Haftung für die selbst verfassten KI-Zusammenfassungen, Verlosung für Minderjährige.

## Grundsatz zum KI-Einsatz

Die Claude API übernimmt alles Sprachliche: Freitext-Zusammenfassungen je Schule,
Themenextraktion, Moderationsvorprüfung, Datenbereinigung beim Import. **Zahlen erzeugt sie
nicht.** Scores, Aggregate, Ranglisten und Trends stammen aus deterministischem,
unit-getestetem Code — sie müssen reproduzierbar und gegenüber einer Schule Zeile für Zeile
belegbar sein. Abschnitt 10 des Entwicklungsplans.
