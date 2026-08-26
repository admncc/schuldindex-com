# Fragebogen — deutsche Fassung (kanonisch)

**Diese Datei ist die Quelle für die Fragebogeninhalte des Portals.** Die englischen
Fassungen in den Spezifikationsdokumenten sind Vorlage, nicht Auslieferungsstand — für ein
deutschsprachiges Portal ist die deutsche Fassung das Original.

Grundlage: *Full Rating Questionnaire* und *Developer Specification* (Kategorien A–E,
Gewichtungen, Pflicht/optional). Die Zuordnung der Antwortskala je Frage ist neu und ergibt
sich aus dem Fragetyp — siehe Entscheidung E5 im Entwicklungsplan.

---

## 1. Antwortskalen

Drei Skalen, intern immer als 1–5 kodiert. Je Frage ist genau eine Skala hinterlegt.

### Skala Q — Qualität
| Label | Wert |
|---|---|
| Sehr gut | 5 |
| Gut | 4 |
| Befriedigend | 3 |
| Schlecht | 2 |
| Sehr schlecht | 1 |

### Skala S — Sicherheit
| Label | Wert |
|---|---|
| Sehr sicher | 5 |
| Eher sicher | 4 |
| Teils, teils | 3 |
| Eher unsicher | 2 |
| Sehr unsicher | 1 |

### Skala H — Häufigkeit (Rohwert; für das Scoring invertiert)
| Label | Rohwert | Invertiert (6 − Rohwert) |
|---|---|---|
| Nie | 1 | 5 |
| Selten | 2 | 4 |
| Gelegentlich | 3 | 3 |
| Häufig | 4 | 2 |
| Sehr häufig | 5 | 1 |

Zusätzlich bei jeder Frage verfügbar: **„Kann ich nicht beurteilen"** — fließt nicht in die
Berechnung ein und wird als fehlender Wert behandelt. (Ohne diese Option raten Befragte bei
Fragen außerhalb ihrer Wahrnehmung, etwa Eltern zur Ausstattung der Fachräume, was die
Datenqualität senkt.)

---

## 2. Kategorie A — Sicherheit & Schulklima
**Gewichtung 3 · Pflichtkategorie · 11 Fragen**

Kategorie A ist intern zweigeteilt: **A2 und A3 bilden den Aggressionsindex** (Teilbereich
„Aggression & Mobbing", Häufigkeitsskala), alle übrigen Fragen den Teilbereich
„Sicherheit & Klima".

| Nr. | Frage | Skala | Teilbereich |
|---|---|---|---|
| A1 | Wie sicher fühlen Sie sich generell auf dem Schulgelände (Klassenräume, Flure, Schulhof)? | S | Klima |
| A2 | Wie häufig erleben Sie Mobbing, Drohungen oder aggressives Verhalten unter Schülerinnen und Schülern? | H | **Aggression** |
| A3 | Wie häufig erleben Sie Mobbing, Drohungen oder aggressives Verhalten gegenüber Lehrkräften? | H | **Aggression** |
| A4 | Wie wirksam reagiert die Schule auf Vorfälle wie Mobbing oder Gewalt? | Q | Klima |
| A5 | Wie fair und einheitlich sind die Schulregeln und Disziplinarmaßnahmen? | Q | Klima |
| A6 | Wie respektvoll ist der Umgang zwischen Schülerinnen und Schülern und den Lehrkräften? | Q | Klima |
| A7 | Wie sicher fühlen Sie sich vor Belästigung oder Einschüchterung im schulischen Umfeld (auch online)? | S | Klima |
| A8 | Wie unterstützend ist das Schulpersonal bei persönlichen oder schulischen Problemen? | Q | Klima |
| A9 | Wie offen ist das Schulumfeld gegenüber Schülerinnen und Schülern unterschiedlicher Herkunft? | Q | Klima |
| A10 | Wie gut geht die Schule mit Konflikten zwischen Schülerinnen und Schülern um? | Q | Klima |
| A11 | Wie bewerten Sie insgesamt die Sicherheit und das soziale Klima der Schule? | Q | Klima |

**Freitext (optional):** „Weitere Anmerkungen zu Sicherheit und Schulklima."

---

## 3. Kategorie B — Unterrichts- & Lernqualität
**Gewichtung 2 · Pflichtkategorie · 10 Fragen · durchgehend Skala Q**

| Nr. | Frage |
|---|---|
| B1 | Wie verständlich erklären die Lehrkräfte die Unterrichtsinhalte? |
| B2 | Wie fachkundig sind die Lehrkräfte in den Fächern, die sie unterrichten? |
| B3 | Wie interessant und motivierend ist der Unterricht? |
| B4 | Wie hilfreich und konstruktiv sind die Rückmeldungen der Lehrkräfte? |
| B5 | Wie gut unterstützt die Schule Schülerinnen und Schüler mit Lernschwierigkeiten oder besonderem Förderbedarf? |
| B6 | Wie angemessen ist das fachliche Niveau des Unterrichts? |
| B7 | Wie fair und nachvollziehbar sind Benotung und Leistungsbewertung? |
| B8 | Wie wirksam werden moderne Unterrichtsmethoden und digitale Werkzeuge eingesetzt? |
| B9 | Wie gut bereitet der Unterricht auf Prüfungen oder den nächsten Bildungsabschnitt vor? |
| B10 | Wie bewerten Sie insgesamt die Unterrichts- und Lernqualität an dieser Schule? |

**Freitext (optional):** „Weitere Anmerkungen zu Unterricht und Lernen."

---

## 4. Kategorie C — Ausstattung & Lernmittel
**Gewichtung 2 · Pflichtkategorie · 10 Fragen · durchgehend Skala Q**

| Nr. | Frage |
|---|---|
| C1 | Wie bewerten Sie den Zustand der Klassenräume (Mobiliar, Beleuchtung, Belüftung)? |
| C2 | Wie ausreichend und aktuell sind Schulbücher und Lernmaterialien? |
| C3 | Wie zuverlässig und nutzbar sind das Internet und die digitale Infrastruktur der Schule? |
| C4 | Wie gut ausgestattet sind Fachräume (zum Beispiel Naturwissenschafts-, Werk- oder Kunsträume)? |
| C5 | Wie sauber und funktionsfähig sind die Sanitäranlagen (Toiletten, Waschräume)? |
| C6 | Wie gut sind die Sportanlagen und die Sportausstattung? |
| C7 | Wie zugänglich und nützlich sind Bibliothek oder Lernräume? |
| C8 | Wie gut instand gehalten und sicher sind Schulgebäude und Außenanlagen? |
| C9 | Wie ausreichend stehen digitale Endgeräte (Computer, Tablets) zur Verfügung? |
| C10 | Wie bewerten Sie insgesamt die Ausstattung und die Lernmittel der Schule? |

**Freitext (optional):** „Weitere Anmerkungen zu Ausstattung und Lernmitteln."

---

## 5. Kategorie D — Schulleitung, Kommunikation & Verwaltung
**Gewichtung 2 · optional · 10 Fragen · durchgehend Skala Q**

| Nr. | Frage |
|---|---|
| D1 | Wie verständlich kommuniziert die Schulleitung wichtige Informationen? |
| D2 | Wie transparent und nachvollziehbar sind Verwaltungsentscheidungen? |
| D3 | Wie zuverlässig reagiert die Verwaltung auf Anfragen von Schülerinnen und Schülern, Eltern oder Lehrkräften? |
| D4 | Wie wirksam geht die Schulleitung mit Konflikten oder Beschwerden um? |
| D5 | Wie unterstützend ist die Schulleitung gegenüber Lehrkräften und Personal? |
| D6 | Wie leicht erreichen Sie die zuständige Ansprechperson in der Verwaltung? |
| D7 | Wie gut arbeitet die Schule mit Eltern und Erziehungsberechtigten zusammen? |
| D8 | Wie aktiv arbeitet die Schulleitung an der Verbesserung der Schulqualität? |
| D9 | Wie fair und einheitlich sind Verwaltungsabläufe, die Schülerinnen und Schüler betreffen? |
| D10 | Wie bewerten Sie insgesamt die Schulleitung und die Verwaltung? |

**Freitext (optional):** „Weitere Anmerkungen zu Schulleitung und Verwaltung."

---

## 6. Kategorie E — Umwelt & Nachhaltigkeit
**Gewichtung 1 · optional · 10 Fragen · durchgehend Skala Q**

| Nr. | Frage |
|---|---|
| E1 | Wie umweltbewusst handelt die Schule im Schulalltag? |
| E2 | Wie gut fördert die Schule Mülltrennung und Recycling? |
| E3 | Wie energieeffizient sind die Schulgebäude (Beleuchtung, Heizung, Dämmung)? |
| E4 | Wie gut reduziert die Schule unnötigen Papierverbrauch und fördert digitale Alternativen? |
| E5 | Wie sauber und gepflegt sind Außenbereiche und Grünflächen? |
| E6 | Welchen Stellenwert hat Umweltbildung an der Schule? |
| E7 | Wie aktiv werden Schülerinnen und Schüler in Umwelt- und Nachhaltigkeitsprojekte einbezogen? |
| E8 | Wie verantwortungsvoll gestaltet die Schule die Verpflegung (zum Beispiel Abfallvermeidung, nachhaltige Angebote)? |
| E9 | Wie gut fördert die Schule umweltbewusstes Verhalten bei Schülerinnen, Schülern und Personal? |
| E10 | Wie bewerten Sie insgesamt das Engagement der Schule für Umwelt und Nachhaltigkeit? |

**Freitext (optional):** „Weitere Anmerkungen zu Umwelt und Nachhaltigkeit."

---

## 7. Ansprache: Du-Variante

Kanonisch oben ist die **Sie-Form**. Für die beiden Schülerrollen wird dieselbe
Message-Struktur in der **Du-Form** ausgeliefert (Entscheidung 3.3 im Entwicklungsplan) —
gleiche Schlüssel, anderer Wertesatz, keine inhaltlich abweichenden Fragen.

| Schlüssel | Sie-Form | Du-Form |
|---|---|---|
| `fragebogen.A1` | Wie sicher fühlen Sie sich generell auf dem Schulgelände …? | Wie sicher fühlst du dich generell auf dem Schulgelände …? |
| `fragebogen.A2` | Wie häufig erleben Sie Mobbing …? | Wie häufig erlebst du Mobbing …? |
| `fragebogen.D6` | Wie leicht erreichen Sie die zuständige Ansprechperson …? | Wie leicht erreichst du die zuständige Ansprechperson …? |

Nur Fragen mit direkter Anrede benötigen eine Variante — das betrifft A1, A2, A3, A7, A8
sowie D3 und D6. Alle übrigen Fragen sind bereits neutral formuliert („Wie gut unterstützt
die Schule …") und werden in beiden Varianten identisch verwendet.

---

## 8. Hinweistext über dem Freitextfeld

Verpflichtend einzublenden, nicht wegklickbar (Begründung: Abschnitt 7 und 9 des
Entwicklungsplans):

> **Bitte keine Namen nennen.** Bewerten Sie die Schule als Einrichtung. Angaben zu einzelnen
> Lehrkräften, Mitschülerinnen und Mitschülern oder anderen Personen werden nicht
> veröffentlicht und führen dazu, dass Ihre Bewertung abgelehnt wird.

Du-Variante:

> **Bitte keine Namen nennen.** Bewerte die Schule als Einrichtung. Angaben zu einzelnen
> Lehrkräften, Mitschülerinnen und Mitschülern oder anderen Personen werden nicht
> veröffentlicht und führen dazu, dass deine Bewertung abgelehnt wird.

---

## 9. Formularfelder außerhalb des Fragenkatalogs

Vollständige Feldliste einschließlich Rollenauswahl, Elterneinwilligung für unter
16-Jährige, Klassenstufe und Kontaktart: **Abschnitt 7.1 des Entwicklungsplans.**
