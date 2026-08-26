# SCHULINDEX

Anonymes, verifiziertes Schulbewertungsportal für Deutschland.
Das Portal wird vollständig deutschsprachig ausgeliefert.

**Der Stand der Planung liegt in `docs/`:**

| Dokument | Inhalt |
|---|---|
| [`docs/dev-plan.md`](docs/dev-plan.md) | Entwicklungsplan: Sprachkonzept, Stack, Datenmodell, Scoring, Anti-Fraud, Recht, Arbeitspakete, Meilensteine, offene Punkte |
| [`docs/fragebogen-de.md`](docs/fragebogen-de.md) | Deutscher Fragebogen (kanonische Fassung), Antwortskalen, Ansprachevarianten |

Der Code entsteht ab Sprint 1 (Arbeitspaket 0.1 im Entwicklungsplan).

## Offene Entscheidungen

Zehn Punkte warten auf eine Freigabe des Auftraggebers und blockieren teilweise den Start —
siehe Abschnitt 14 des Entwicklungsplans. Die dringendsten:

1. **Name und Domain** — „Schuldindex" bedeutet auf Deutsch „Index der Schulden"; korrekt wäre „Schulindex".
2. **Profil ja oder nein** — ein Profil erfordert dauerhafte Kontaktspeicherung und widerspricht der Developer Specification.
3. **Unter 16-Jährige** — Umfang der Datenspeicherung bei minderjährigen Bewertenden.
