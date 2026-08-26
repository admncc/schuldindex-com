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

```bash
npm install
npm test        # 44 Tests
npm run typecheck
```

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
