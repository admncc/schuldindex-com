# Fragebogen — deutsche Fassung (kanonisch)

**Diese Datei ist die Quelle für die Fragebogeninhalte des Portals.** Die maschinenlesbare
Fassung liegt in `src/domain/fragebogen.ts`; Struktur und Wertung werden dort durch Tests
abgesichert. Die englischen
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

Zusätzlich bei jeder Frage verfügbar: **„Kann ich nicht beurteilen“** — fließt nicht in die
Berechnung ein und wird als fehlender Wert behandelt. (Ohne diese Option raten Befragte bei
Fragen außerhalb ihrer Wahrnehmung, etwa Eltern zur Ausstattung der Fachräume, was die
Datenqualität senkt.)

---

## 2. Kategorie A — Sicherheit & Schulklima
**Gewichtung 3 · Pflichtkategorie · 11 Fragen**

Kategorie A ist intern zweigeteilt: **A2 und A3 bilden den Aggressionsindex** (Teilbereich
„Aggression & Mobbing“, Häufigkeitsskala), alle übrigen Fragen den Teilbereich
„Sicherheit & Klima“.

| Nr. | Frage | Skala | Teilbereich |
|---|---|---|---|
| A1 | Wie sicher fühlst du dich generell auf dem Schulgelände (Klassenräume, Flure, Schulhof)? | S | Klima |
| A2 | Wie häufig erlebst du Mobbing, Drohungen oder aggressives Verhalten unter Schülerinnen und Schülern? | H | **Aggression** |
| A3 | Wie häufig erlebst du Mobbing, Drohungen oder aggressives Verhalten gegenüber Lehrkräften? | H | **Aggression** |
| A4 | Wie wirksam reagiert die Schule auf Vorfälle wie Mobbing oder Gewalt? | Q | Klima |
| A5 | Wie fair und einheitlich sind die Schulregeln und Disziplinarmaßnahmen? | Q | Klima |
| A6 | Wie respektvoll ist der Umgang zwischen Schülerinnen und Schülern und den Lehrkräften? | Q | Klima |
| A7 | Wie sicher fühlst du dich vor Belästigung oder Einschüchterung im schulischen Umfeld (auch online)? | S | Klima |
| A8 | Wie unterstützend ist das Schulpersonal bei persönlichen oder schulischen Problemen? | Q | Klima |
| A9 | Wie offen ist das Schulumfeld gegenüber Schülerinnen und Schülern unterschiedlicher Herkunft? | Q | Klima |
| A10 | Wie gut geht die Schule mit Konflikten zwischen Schülerinnen und Schülern um? | Q | Klima |
| A11 | Wie bewertest du insgesamt die Sicherheit und das soziale Klima der Schule? | Q | Klima |

**Freitext (optional):** „Weitere Anmerkungen zu Sicherheit und Schulklima.“

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
| B10 | Wie bewertest du insgesamt die Unterrichts- und Lernqualität an dieser Schule? |

**Freitext (optional):** „Weitere Anmerkungen zu Unterricht und Lernen.“

---

## 4. Kategorie C — Ausstattung & Lernmittel
**Gewichtung 2 · Pflichtkategorie · 10 Fragen · durchgehend Skala Q**

| Nr. | Frage |
|---|---|
| C1 | Wie bewertest du den Zustand der Klassenräume (Mobiliar, Beleuchtung, Belüftung)? |
| C2 | Wie ausreichend und aktuell sind Schulbücher und Lernmaterialien? |
| C3 | Wie zuverlässig und nutzbar sind das Internet und die digitale Infrastruktur der Schule? |
| C4 | Wie gut ausgestattet sind Fachräume (zum Beispiel Naturwissenschafts-, Werk- oder Kunsträume)? |
| C5 | Wie sauber und funktionsfähig sind die Sanitäranlagen (Toiletten, Waschräume)? |
| C6 | Wie gut sind die Sportanlagen und die Sportausstattung? |
| C7 | Wie zugänglich und nützlich sind Bibliothek oder Lernräume? |
| C8 | Wie gut instand gehalten und sicher sind Schulgebäude und Außenanlagen? |
| C9 | Wie ausreichend stehen digitale Endgeräte (Computer, Tablets) zur Verfügung? |
| C10 | Wie bewertest du insgesamt die Ausstattung und die Lernmittel der Schule? |

**Freitext (optional):** „Weitere Anmerkungen zu Ausstattung und Lernmitteln.“

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
| D6 | Wie leicht erreichst du die zuständige Ansprechperson in der Verwaltung? |
| D7 | Wie gut arbeitet die Schule mit Eltern und Erziehungsberechtigten zusammen? |
| D8 | Wie aktiv arbeitet die Schulleitung an der Verbesserung der Schulqualität? |
| D9 | Wie fair und einheitlich sind Verwaltungsabläufe, die Schülerinnen und Schüler betreffen? |
| D10 | Wie bewertest du insgesamt die Schulleitung und die Verwaltung? |

**Freitext (optional):** „Weitere Anmerkungen zu Schulleitung und Verwaltung.“

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
| E10 | Wie bewertest du insgesamt das Engagement der Schule für Umwelt und Nachhaltigkeit? |

**Freitext (optional):** „Weitere Anmerkungen zu Umwelt und Nachhaltigkeit.“

---

## 7. Kategorie F — Außerunterrichtliches Angebot & Schulleben
**Gewichtung 1 · optional · 10 Fragen · durchgehend Skala Q**

Neu aufgenommen am 26.08.2026. Die fünf bestehenden Kategorien decken Sicherheit,
Unterricht, Ausstattung, Verwaltung und Umwelt ab — aber nichts von dem, was für Eltern bei
der Schulwahl oft den Ausschlag gibt: Arbeitsgemeinschaften, Klassenfahrten, Ganztag,
Austausch, Berufsorientierung. Die Lücke ist echt und schließt sich gut.

| Nr. | Frage |
|---|---|
| F1 | Wie vielfältig ist das Angebot an Arbeitsgemeinschaften und Kursen außerhalb des Unterrichts? |
| F2 | Wie gut organisiert sind Ausflüge, Exkursionen und Projekttage? |
| F3 | Wie angemessen ist die Anzahl der Ausflüge und Klassenfahrten im Schuljahr? |
| F4 | Wie gut sind die Sport- und Bewegungsangebote außerhalb des Unterrichts? |
| F5 | Wie gut ist das musisch-künstlerische Angebot (Chor, Orchester, Theater, Kunst)? |
| F6 | Wie gut ist das Ganztags- und Betreuungsangebot (Hausaufgabenbetreuung, Nachmittagsangebote)? |
| F7 | Wie gut bereitet die Schule auf Beruf und Studium vor (Praktika, Berufsorientierung, Beratung)? |
| F8 | Wie gut unterstützt die Schule Schüleraustausch und internationale Programme? |
| F9 | Wie gut unterstützt die Schule Eigeninitiative (Schülervertretung, Schülerzeitung, eigene Projekte)? |
| F10 | Wie bewertest du insgesamt das außerunterrichtliche Angebot und das Schulleben? |

**Freitext (optional):** „Weitere Anmerkungen zu außerunterrichtlichen Angeboten und Schulleben.“

**Zwei Hinweise zur Ausgestaltung:**

1. **Alle Fragen bewusst auf Skala Q**, nicht auf die Häufigkeitsskala. Bei „Wie häufig
   finden Ausflüge statt?“ wäre *häufiger = besser* — die Umkehrung der Aggressionsfragen,
   wo *häufiger = schlechter* gilt. Zwei gegenläufige Häufigkeitsregeln in derselben
   Scoring-Engine sind eine sichere Fehlerquelle. „Wie angemessen ist die Anzahl?“ misst
   dasselbe ohne diesen Bruch.
2. **Möglicher elfter Punkt zur Abstimmung:** „Wie gut sorgt die Schule dafür, dass
   kostenpflichtige Angebote wie Klassenfahrten für alle Familien bezahlbar bleiben?"
   Sozial aussagekräftig und in keinem Vergleichsportal zu finden — aber auch die
   politischste Frage des Fragebogens. Aufnehmen oder nicht, ist eine Produktentscheidung.

**Auswirkung auf die Länge:** Der Fragenkatalog wächst von 51 auf 61 Fragen. Da D, E und F
alle optional sind, bleibt der Pflichtteil unverändert bei 31 Fragen (A–C). Die drei
optionalen Kategorien werden nach Abschluss des Pflichtteils **einzeln und eingeklappt**
angeboten („Möchten Sie noch etwas bewerten?“), nicht als eine Wand aus 30 weiteren Fragen.
Mehr als drei optionale Kategorien sollten es nicht werden.

---

## 8. Ansprache

**Das Portal duzt durchgehend** — auch gegenüber Eltern und Lehrkräften (Entscheidung vom
26.08.2026). Es gibt nur einen Textstand. Eine Sie-Form existiert nicht mehr, weder hier noch
im Code; ein Test in `src/domain/fragebogen.test.ts` schlägt an, sobald eine Frage in der
Sie-Form nachgetragen wird.

Von den 61 Fragen sprechen zwölf überhaupt jemanden direkt an — A1, A2, A3, A7, A11, B10, C1,
C10, D6, D10, E10 und F10. Alle übrigen sind neutral formuliert („Wie gut unterstützt die
Schule …“) und bleiben davon unberührt.

**Gendern:** durchgehend Doppelnennung oder neutrale Form („Schülerinnen und Schüler“,
„Lehrkräfte“, „Erziehungsberechtigte“). Keine Sonderzeichen-Formen in Fragebogentexten — sie
stören Screenreader und wirken in einer Bewertungsfrage positionierend.

---

## 9. Hinweistext über dem Freitextfeld

Verpflichtend einzublenden, nicht wegklickbar. Er muss zwei Dinge sagen — was mit dem Text
passiert und was nicht hineingehört (Begründung: Abschnitte 7, 9 und 10 des Entwicklungsplans):

> **Dein Text wird nicht veröffentlicht.** Er fließt zusammen mit anderen Bewertungen in eine
> kurze Zusammenfassung für diese Schule ein. **Bitte nenne keine Namen** — weder von
> Lehrkräften noch von Mitschülerinnen und Mitschülern. Bewertungen mit Namen werden abgelehnt.

---

## 10. Formularfelder außerhalb des Fragenkatalogs

Vollständige Feldliste einschließlich Rollenauswahl, Elterneinwilligung für unter
16-Jährige, Klassenstufe und Kontaktart: **Abschnitt 7.1 des Entwicklungsplans.**
