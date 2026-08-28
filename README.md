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

Begonnen mit dem Domänenkern - dem Teil, der von den offenen Entscheidungen nicht
abhängt und bei dem Korrektheit am meisten zählt:

| Modul | Inhalt |
|---|---|
| `src/domain/fragebogen.ts` | Alle 61 Fragen, sechs Kategorien, drei Antwortskalen, Gewichtungen, Du-/Sie-Varianten |
| `src/domain/scoring.ts` | Kategoriescores, 70/30-Aufteilung der Kategorie A, Gesamtscore, Aggressionsindex, Ampelstufen |
| `src/domain/aggregation.ts` | Zusammenfassung aller Bewertungen einer Schule, Sichtbarkeitsschwellen, Trend |
| `src/domain/geopruefung.ts` | Entfernungsprüfung bei der Abgabe, 150-km-Grenze |
| `src/domain/bewertungseingabe.ts` | Prüfung einer eingereichten Bewertung - dieselben Regeln im Browser und auf dem Server |
| `src/domain/kontakt.ts` | Kontaktdaten: Normalisierung, Suchhash, Verschlüsselung, verschleierte Anzeige |
| `src/domain/verifizierung.ts` | Bestätigungstoken - Klartext geht raus, nur der Hash bleibt |
| `src/versand/nachricht.ts` | Versandkette WhatsApp → SMS → E-Mail |
| `src/dienste/bewertungAbgeben.ts` | Der Ablauf der Abgabe, mit hereingereichten Abhängigkeiten |
| `src/domain/betrugspruefung.ts` | Automatische Signale vor der Freigabe - Signale, keine Entscheidungen |
| `src/domain/bewertungsstatus.ts` | Zustände einer Bewertung und die erlaubten Übergänge |
| `src/import/schulart.ts` | Normalisierung der 232 Schulartbezeichnungen aus jedeschule.codefor.de auf die Taxonomie des Portals |
| `src/import/slug.ts` | Slug-Vergabe für Schulprofile - umlautfest und über Re-Importe hinweg stabil |
| `src/import/geokodierung.ts` | Ablauf der Nachgeocodierung: gestufte Anfragen, Genauigkeit, Plausibilitätsprüfung |
| `src/import/photon.ts` | Anbindung an Photon, mit Takt, Wiederholungen und Zwischenspeicher |
| `src/domain/bundesland.ts` | Die 16 Bundesländer als Domänenbegriff |
| `src/import/normalisiere.ts` | Rohdatensatz → Schule: Adresse, Koordinate samt Reparatur vertauschter Werte, Suchtext |
| `src/import/dubletten.ts` | Zusammenführung mehrfach gelieferter Schulen, Standorte bleiben erhalten |
| `src/db/schulsuche.ts` | Autovervollständigung, unscharfe Suche, Umkreissuche, Filter |
| `src/db/schulen.ts` | Suche der Ergebnisseite: Begriff, Filter, Facetten nach Bundesland und Ort |
| `app/(oeffentlich)/schulen/page.tsx` | Ergebnisseite: Filterleiste, Facetten zum Eingrenzen, Bundesländer als Einstieg |
| `app/(oeffentlich)/kategoriewertungen.tsx` | Die sechs Kategoriewertungen auf dem Schulprofil, mit Gewichtung |
| `app/(oeffentlich)/suchfeld.tsx` | Suchfeld mit Vorschlagsliste - Tastaturbedienung, funktioniert auch ohne JavaScript |
| `src/domain/suchhervorhebung.ts` | Markiert die Fundstelle im Vorschlag - und markiert nichts, wenn es keine gibt |
| `app/(oeffentlich)/` | Öffentliches Portal: Startseite, Suche, Schulprofil, Bewertungsformular, Bestätigung |
| `app/moderation/` | Interne Oberfläche: Anmeldung mit zweitem Faktor, Warteschlange, Detailansicht, Entscheidungen |
| `src/domain/totp.ts` | Zweiter Faktor nach RFC 6238, geprüft gegen die Testvektoren des RFC |
| `src/domain/anmeldung.ts` | Kennwortabdruck (scrypt), Sitzungstoken, Sperre nach Fehlversuchen |
| `src/domain/moderation.ts` | Was eine Entscheidung braucht: Ablehnungsgründe, Dringlichkeit, Alarme |
| `src/dienste/moderationsanmeldung.ts` | Der Anmeldevorgang, ohne Datenbank geschrieben und dort geprüft |
| `src/domain/zweiterfaktor.ts` | Schalter für den zweiten Faktor - an, solange nichts anderes gesetzt ist |
| `src/db/moderation.ts` | Warteschlange, Vorgang, Entscheidung, Protokoll |
| `src/db/aggregate.ts` | Neuberechnung der Schulaggregate bei jeder Freigabe |
| `src/ki/vorlage.ts` | Auftrag an das Modell: Systemanweisung und abgegrenzter Bewertungsblock |
| `src/ki/pruefung.ts` | Nachprüfung der Zusammenfassung vor der Veröffentlichung |
| `src/ki/zusammenfassung.ts` | Der Ablauf der Zusammenfassung, ohne Netz und damit prüfbar |
| `src/ki/anthropic.ts` | Claude API mit Structured Outputs - die einzige Datei, die das SDK kennt |
| `src/db/ranglisten.ts` | Beste Schulen und höchster Verbesserungsbedarf, mit Sechs-Monats-Trend |
| `src/domain/karte.ts` | Projektion der Schulkarte - und warum sie ohne fremde Kartenkacheln auskommt |
| `src/db/karte.ts` | Schulbestand als Raster, bewertete Schulen einzeln |
| `app/(oeffentlich)/karte/ansicht.tsx` | Bedienbare Karte: zoomen, ziehen, filtern, Umkreis - ohne fremde Kacheln |
| `src/domain/meldung.ts` | Prüfung der Meldungen nach Art. 16 DSA |
| `src/db/meldungen.ts` | Meldungen annehmen, entscheiden, Missbrauch des Meldewegs erkennen |
| `src/recht/betreiber.ts` | Betreiberangaben aus der Umgebung - fehlende Pflichtangaben werden sichtbar |
| `src/domain/kontozugang.ts` | Anmeldung ohne Kennwort: Token, Fristen, Cookie |
| `src/dienste/kontozugang.ts` | Anmeldelink anfordern - mit immer gleicher Antwort |
| `src/dienste/bewertungAendern.ts` | Änderung einer eigenen Bewertung, als neue Fassung |
| `src/db/konto.ts` | Eigene Bewertungen, Sitzungen, Löschung samt Neuberechnung |
| `src/domain/verlosung.ts` | Lose, Ziehung und ihre Nachrechenbarkeit |
| `src/db/verlosung.ts` | Teilnahmen, Ziehung, Nachweis |
| `src/domain/schulzugang.ts` | Nachweis für die Rolle „Schulsupport“ - und warum die Domäne allein nichts belegt |
| `src/db/schulzugang.ts` | Anfrage, Einlösung, Sitzung, Handprüfung |
| `src/domain/aufbewahrung.ts` | Die Fristen als Daten - Grundlage des Aufräumlaufs **und** der Datenschutzerklärung |
| `src/db/aufraeumen.ts` | Setzt die Fristen um, trocken oder löschend, mit Spur |
| `src/domain/einstellungen.ts` | Der Katalog der einstellbaren Grenzwerte - Vorgaben, Grenzen, Prüfung |
| `src/db/einstellungen.ts` | Gespeicherte Abweichungen von den Vorgaben, mit Änderungsverlauf |
| `src/domain/formularstempel.ts` | Signierter Zeitstempel: warum die Dauer vom Server kommt und nicht aus dem Browser |
| `src/domain/klickmuster.ts` | Auswertung des Klickverhaltens, millisekundengenau - und was die Aufbewahrung der Folge bedeutet |
| `src/domain/schulpflege.ts` | Prüfung von Hand eingetragener Schulangaben - fängt vertauschte Koordinaten |
| `src/geo/mmdb.ts` | Standortbestimmung aus der IP - lokal, ohne fremden Dienst, ohne Speicherung |
| `src/geo/tar.ts` | So viel tar, wie das MaxMind-Archiv braucht - ohne Abhängigkeit |
| `src/db/analytik.ts` | Auswertungen für die Moderation: Lage, Signale, Verlauf, einzelne Schule |
| `src/domain/risiko.ts` | Aus Signalpunkten wird eine Risikostufe - Lesehilfe, kein Urteil |
| `src/ki/betrugsanalyse.ts` | Zweitmeinung des Modells zu einer Welle von Bewertungen |
| `src/domain/geheimnis.ts` | Zugangsschlüssel verschlüsseln - zweckgetrennt von den Kontaktdaten |
| `app/moderation/analytik/` | Auswertung, Risikoanzeige, KI-Analyse, Ablehnen aus der Liste |
| `src/db/schulverwaltung.ts` | Bestand im Panel: Lage, Liste, Bearbeiten, Anlegen |
| `app/moderation/schulen/` | Schulbestand ansehen, korrigieren, ergänzen - Import lässt Handarbeit in Ruhe |
| `app/moderation/einstellungen/` | Panel der Leitung: Grenzwerte der Betrugserkennung nachziehen |
| `src/dienste/umgebung.ts` | Anbindung des Abgabedienstes an Postgres - das einzige SQL außerhalb der Abfrageschicht |
| `messages/de.json` | Alle Oberflächentexte |
| `db/migrations/` | Datenbankschema |
| `scripts/lade-schulen.ts` | Abruf des Schulbestands, mit Abgleich gegen die Statistik der Quelle |
| `scripts/importiere.ts` | Import in die Datenbank, wiederholbar |
| `scripts/geokodiere.ts` | Holt fehlende Koordinaten nach, wiederaufnehmbar |
| `scripts/pruefe-koordinaten.test.ts` | Qualitätstor: prüft die Koordinaten gegen die Datenbank |
| `scripts/suche.test.ts` | Prüft die Suche an den echten Daten |
| `scripts/trefferseite.test.ts` | Prüft Filter, Facetten und Sortierung der Ergebnisseite an den echten Daten |
| `scripts/durchstich.test.ts` | Durchstich: echte Schulen, Bewertungen, Aggregation |
| `scripts/moderator-anlegen.ts` | Legt ein Moderationskonto an, gibt Kennwort und App-URL einmalig aus |
| `scripts/zusammenfassen.ts` | Erzeugt die Freitext-Zusammenfassungen der fälligen Schulen |
| `scripts/verlosung-ziehen.ts` | Zieht die monatliche Verlosung, `--pruefen` rechnet sie nach |
| `src/db/demodaten.ts` | Demobestand zählen und entfernen - über die Kennzeichnung, nie über Verdachtsmerkmale |
| `scripts/demodaten.ts` | Erzeugt Demobewertungen für den Testbetrieb, gekennzeichnet und wieder entfernbar |
| `scripts/aggregate-neu.ts` | Rechnet alle Schulaggregate neu - nach jeder Änderung an der Formel |
| `scripts/aufraeumen.ts` | Aufräumlauf nach den Fristen; zählt nur, `--loeschen` löscht wirklich |
| `scripts/aufraeumen.test.ts` | Prüft an der Datenbank, dass keine Frist zu viel löscht |

```bash
npm install
npm test        # 675 Tests (37 davon gegen die eingespielten Echtdaten)
npm run typecheck
cp .env.example .env  # Schlüssel erzeugen, siehe Kommentare in der Datei
npm run dev          # Anwendung unter http://localhost:3000

# Freitext-Zusammenfassungen (Abschnitt 10.2 des Entwicklungsplans).
# --trocken zeigt den Auftrag an das Modell, ohne die API aufzurufen:
ANTHROPIC_API_KEY=… npx tsx scripts/zusammenfassen.ts --grenze 20
npx tsx scripts/zusammenfassen.ts --schule <slug> --trocken

# Testbestand: erfundene Bewertungen über viele Schulen. Sie sind als Demodaten
# gekennzeichnet und im Panel unter Aufbewahrung mit einem Klick wieder weg.
npx tsx scripts/demodaten.ts   # Vorgabe: 900 Bewertungen über 40 Schulen

# Zugang zur Moderation anlegen (Ausgabe erscheint genau einmal):
npx tsx scripts/moderator-anlegen.ts anna "Anna Beispiel" --leitung
# Die ausgegebene otpauth://-URL in eine Authenticator-App übernehmen,
# danach anmelden unter http://localhost:3000/moderation

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
Faktor 20 hätte eine tote Zone zwischen 0 und 20 erzeugt - die Skala wird deshalb normalisiert
statt multipliziert.

## Entschieden am 26.08.2026

Alle vierzehn zuvor offenen Punkte sind entschieden - das Protokoll steht in Abschnitt 15
des Entwicklungsplans. Die wichtigsten:

- **SCHULINDEX auf schulindex.com**, Name korrigiert
- **Konten für alle Altersgruppen**, Anmeldung per Magic Link - die Developer Specification muss an dieser Stelle geändert werden
- **Telefonnummer als primärer Kontaktweg** (WhatsApp, dann SMS), E-Mail nur als Rückfall
- **Score auf einer Skala von 0 bis 10**, Farbgrenzen an den Antwortstufen: ab 7,5 grün, ab 5,0 gelb
- **Ab 10 Bewertungen** wird ein Schulprofil ausgewertet, ab 20 erscheint die Schule in Ranglisten
- **Durchgehend du**, auch gegenüber Eltern und Lehrkräften
- **Verlosung schon im MVP** - Launch damit bei 13 Sprints statt elf

Vier Punkte stehen ausdrücklich zur Abnahme durch die Kanzlei: Elterneinwilligung per
Checkbox, Haftung für die selbst verfassten KI-Zusammenfassungen, Verlosung für Minderjährige
und - seit dem 27.08. - die Aufbewahrung der vollständigen Klickfolgen (Abschnitt 7.2 des
Entwicklungsplans).

## Grundsatz zum KI-Einsatz

Die Claude API übernimmt alles Sprachliche: Freitext-Zusammenfassungen je Schule,
Themenextraktion, Moderationsvorprüfung, Datenbereinigung beim Import. **Zahlen erzeugt sie
nicht.** Scores, Aggregate, Ranglisten und Trends stammen aus deterministischem,
unit-getestetem Code - sie müssen reproduzierbar und gegenüber einer Schule Zeile für Zeile
belegbar sein. Abschnitt 10 des Entwicklungsplans.
