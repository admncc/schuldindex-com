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
npm test        # 39 Tests
npm run typecheck
```

Die Tests halten insbesondere die beiden Stellen fest, an denen die Spezifikation
rechnerisch nicht aufging: der Gesamtscore reicht von 20 bis 100 statt von 0 bis 100,
und die Ampelgrenzen des Aggressionsindex ließen zwei Wertebereiche undefiniert.

## Offene Entscheidungen

Vierzehn Punkte warten auf eine Freigabe des Auftraggebers und blockieren teilweise den
Start — siehe Abschnitt 15 des Entwicklungsplans. Die dringendsten:

1. **Name und Domain** — „Schuldindex" bedeutet auf Deutsch „Index der Schulden"; korrekt wäre „Schulindex".
2. **Profil ja oder nein** — ein Profil erfordert dauerhafte Kontaktspeicherung und widerspricht der Developer Specification.
3. **Unter 16-Jährige** — Umfang der Datenspeicherung bei minderjährigen Bewertenden.

## Grundsatz zum KI-Einsatz

Die Claude API übernimmt alles Sprachliche: Freitext-Zusammenfassungen je Schule,
Themenextraktion, Moderationsvorprüfung, Datenbereinigung beim Import. **Zahlen erzeugt sie
nicht.** Scores, Aggregate, Ranglisten und Trends stammen aus deterministischem,
unit-getestetem Code — sie müssen reproduzierbar und gegenüber einer Schule Zeile für Zeile
belegbar sein. Abschnitt 10 des Entwicklungsplans.
