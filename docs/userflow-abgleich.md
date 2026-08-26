# Abgleich: SchoolUserFlow gegen die Projektbeschreibung

**Grundlage:** `SchoolUserFlow.pdf` — eine Leinwand mit fünf Bahnen (School search, Auth,
Reviews, Profile, Verification), abgeglichen gegen Project Brief, Developer Specification,
Full Rating Questionnaire und Safety Scoring Spec sowie gegen `dev-plan.md`.

**Gesamturteil:** Der Flow ist handwerklich gut und an mehreren Stellen **besser als unsere
Specs** — vor allem beim Anmeldeverfahren und bei den Zuständen, die unsere Dokumente
schlicht auslassen (Fehlerseiten, Leerzustände, erneutes Senden). Er beschreibt aber ein
**kontobasiertes Produkt**, während die Developer Specification ein kontoloses beschreibt.
Das ist kein Detail, sondern die Grundsatzfrage aus E10 — der Flow beantwortet sie
faktisch mit „Konto", ohne dass die Entscheidung je getroffen wurde.

Außerdem fehlen im Flow **alle deutschen Pflichtbestandteile**: Rollenauswahl,
Elterneinwilligung unter 16, Klassenstufe, Einwilligungs-Checkboxen und Rechtsseiten.

---

## 1. Übernehmen — das ist besser als unsere Specs

| # | Aus dem Flow | Warum übernehmen |
|---|---|---|
| Ü1 | **Magic-Link-Anmeldung statt Passwort** | Deckt sich exakt mit dem Vorschlag aus E10. Kein Passwort heißt: keine Passwortwiederherstellung, kein Passwort-Hashing-Risiko, weniger Abbrüche. Übernehmen. |
| Ü2 | **Verifizierung am Konto statt an jeder einzelnen Bewertung** | Deutlich bessere Nutzerführung: einmal verifizieren, danach reibungslos bewerten. Unsere Specs verifizieren jede Bewertung neu — das kostet bei der zweiten Bewertung fast alle Nutzer:innen. **Wichtige Bedingung:** die Betrugsprüfungen (Geo, Ratelimit, Muster) müssen trotzdem **je Bewertung** laufen, nicht nur bei der Kontoanlage. Sonst wird ein einmal verifiziertes Konto zum Freifahrtschein. |
| Ü3 | **Der OTP-Bildschirm sieht immer gleich aus**, egal ob die Nummer bereits registriert ist | Schutz vor Konto-Enumeration — man kann über das Formular nicht herausfinden, wer auf der Plattform registriert ist. Steht in keiner unserer Specs und gehört hinein. |
| Ü4 | **Rücksprung an die Ausgangsstelle** nach abgeschlossener Verifizierung („continue according to the step from which the user entered") | Verhindert, dass eine halb ausgefüllte Bewertung nach der Verifizierung verloren geht. |
| Ü5 | **Zweistufige Rückfrage vor dem Abbruch der Verifizierung** | Ehrliche Erwartungssteuerung: ohne Verifizierung keine Bewertung. Besser als eine stille Sackgasse. |
| Ü6 | **Eigene „Oops"-Seite** für fehlgeschlagene Anmeldung, mit konkreten Gründen (Link abgelaufen usw.) und Auffangmeldung | Genau die Zustände, die in Projekten regelmäßig vergessen und dann kurz vor Launch nachgebaut werden. |
| Ü7 | **Leerzustand der Bewertungsliste** mit Aufforderung zur ersten Bewertung | Kleiner Baustein, spürbare Wirkung auf die Konversionsrate. |
| Ü8 | **Willkommens-E-Mail mit Suchbaustein**, der direkt angemeldet in die Schulsuche führt | Sinnvolle Verbindung von Anmeldung und erstem Nutzen. |
| Ü9 | **Bewertungsverlauf als Thread** („Review story", „Add/update review in thread") | Macht die in Brief §2.4 geforderte Versionierung sichtbar — für die **eigene** Bewertung. Siehe A3 zur Frage der Öffentlichkeit. |
| Ü10 | **„Erneut schreiben"-Link in der Ablehnungs-E-Mail** | Gut und nach Art. 17 DSA ohnehin nötig: eine Ablehnung braucht Begründung und einen Weg zurück. |
| Ü11 | **Schulvorschläge nach Standort** („Send user to school list close to their location") | Passt zum Geo-Ansatz des Projekts und verkürzt die Suche spürbar. |
| Ü12 | **Merkliste und Teilen-Funktion** | Nicht in den Specs, kein MVP-Blocker — als Phase 7 aufnehmen. |

---

## 2. Anpassen — grundsätzlich gut, aber so nicht umsetzbar

### A1 — Schulsuche über die Google-API
> „When typing, the name should be pulled from the Google API."

**Das können wir nicht übernehmen.** Vier Gründe:

1. **Falsche Datenbasis.** Google Places kennt keine deutsche Schulart, keinen Träger und
   kein Bundesland. Genau danach wird aber gefiltert und ranggelistet.
2. **Zuordnungsproblem.** Bewertungen müssen an **unsere** Schul-ID hängen, sonst
   funktioniert keine Aggregation. Eine Google-Place-ID müsste ohnehin auf unseren Datensatz
   abgebildet werden — mit unvermeidbaren Fehlzuordnungen.
3. **Kosten.** Places Autocomplete rechnet je Eingabesitzung ab. Eine Suchfunktion auf der
   Startseite eines Bewertungsportals ist der teuerstmögliche Einsatzort.
4. **Datenschutz.** Jeder Tastendruck im Suchfeld ginge an Google. Bei einem Portal, dessen
   Hauptnutzergruppe minderjährig ist, ist das kaum vertretbar.

**Stattdessen:** eigene Datenbank aus jedeschule.codefor.de mit `pg_trgm` und `unaccent`
(bereits in Arbeitspaket 1.5 geplant). Die im Flow zu Recht geforderte Qualität —
„nicht nur die Adresse anzeigen, sondern Treffervorschläge" — erreichen wir damit besser,
weil wir Schulart und Ort mit ausgeben können. Google bleibt allenfalls als Rückfall für den
Fall „Schule nicht gefunden", und auch das erst nach einer Datenschutzabwägung.

### A2 — „Verboten-Wörter-Prüfung im Frontend"
Gute Idee als **Sofortrückmeldung**, aber sie ersetzt keine Prüfung: eine Frontend-Prüfung
lässt sich mit zwei Klicks in den Entwicklerwerkzeugen umgehen. Also **beides**: im Frontend
als freundlicher Hinweis beim Tippen, im Backend als verbindliche Prüfung. Und der Filter
muss zusätzlich **Namen einzelner Lehrkräfte** erkennen (Abschnitt 7 des Entwicklungsplans) —
das ist das größte rechtliche Risiko des Projekts und im Flow nicht erwähnt.

### A3 — Bewertungsverlauf: für wen sichtbar?
Der Flow zeigt „Check review history" und einen „Link to review history page". Unsere Specs
sagen: frühere Fassungen werden intern gespeichert und sind **nicht öffentlich** sichtbar.

**Vorschlag:** Verlauf sichtbar nur für die verfassende Person im eigenen Profil, öffentlich
lediglich „zuletzt aktualisiert am …". Sonst wird aus jeder Korrektur ein dauerhaft
einsehbarer Widerspruch, und Schulen können Änderungen gegen Bewertende verwenden.

### A4 — „Shadow mode"
> „so users can hide their reviews and post them anonymously"

In unserem Modell sind **alle** Bewertungen öffentlich anonym — es werden nie Namen
angezeigt. Ein Schalter für Anonymität suggeriert, dass es auch nicht-anonyme Bewertungen
gäbe, und weckt genau das Misstrauen, das er ausräumen soll. **Weglassen.** Was stattdessen
gebraucht wird: ein deutlich sichtbarer, dauerhafter Hinweis „Deine Bewertung erscheint immer
anonym."

### A5 — E-Mail **und** Telefonnummer für jede Person
Der Flow verlangt E-Mail für die Anmeldung und zusätzlich eine Telefonnummer für die
Verifizierung. Damit speichern wir **zwei** personenbezogene Merkmale statt einem — bei
Minderjährigen doppelt heikel.

Zwei gangbare Wege:
- **Sparsam:** ein Kontaktweg genügt, die Person wählt E-Mail **oder** WhatsApp/SMS. Entspricht Brief und Developer Specification.
- **Betrugsresistent:** E-Mail zur Anmeldung, Telefonnummer zusätzlich als knappe Ressource gegen Mehrfachkonten. Das ist der Vorschlag des Flows.

Der zweite Weg ist sicherer gegen Manipulation, der erste datenschutzrechtlich deutlich
leichter zu verteidigen. **Entscheidung nötig** — siehe offener Punkt 11.

---

## 3. Fehlt im Flow — muss ergänzt werden

| # | Fehlt | Wo einzufügen |
|---|---|---|
| F1 | **Rollenauswahl** (Schüler:in unter 16 / ab 16 / Eltern / Lehrkraft / Ehemalige) | Erster Schritt des „Review Quiz". Steuert Fragebogen, Folgefelder und die spätere Anzeige. |
| F2 | **Elterneinwilligung für unter 16-Jährige** | Direkt nach der Rollenauswahl, verpflichtend. War deine ausdrückliche Vorgabe und ist eine Rechtspflicht (Art. 8 DSGVO), im Flow aber an keiner Stelle vorhanden. |
| F3 | **Klassenstufe** (1–13) bzw. Abgangsjahr bei Ehemaligen | Ebenfalls im „Review Quiz", abhängig von der Rolle. |
| F4 | **Einwilligungs-Checkbox zur Datenverarbeitung** | Sowohl bei der Kontoanlage als auch beim Absenden der Bewertung. Ohne sie fehlt die Rechtsgrundlage. |
| F5 | **Dritter Bewertungszustand: „in Prüfung"** | Der Flow kennt nur „verifiziert ja/nein" → angenommen oder abgelehnt. Unsere Specs kennen `on_hold_geo` und `on_hold_fraud`: die Bewertung ist dann **weder angenommen noch abgelehnt**, sondern wartet auf Moderation. Es fehlen der Bildschirm „Deine Bewertung wird geprüft", die zugehörige E-Mail und der Zustand in der Bewertungsliste. **Wichtigste inhaltliche Lücke.** |
| F6 | **Rückfrage der Moderation** („request more info") | Im Brief vorgesehen, im Flow nicht abgebildet. |
| F7 | **Impressum, Datenschutzerklärung, Nutzungsbedingungen** | Die Hauptseite listet nur „About" und „Contacts". In Deutschland ist ein Impressum nach § 5 DDG Pflicht und muss von jeder Seite erreichbar sein. |
| F8 | **Meldeformular für Schulen und Betroffene** | Pflicht nach Art. 16 DSA. Gehört auf die Schulseite. |
| F9 | **Verlosung** | Im Flow nicht vorhanden. Post-MVP, aber der Einstiegspunkt gehört in den Bewertungsflow (nur Schülerrolle ab 16). |
| F10 | **Eine Bewertung je Schule und Konto** | Der Flow prüft „erste Bewertung für diese Schule?" und leitet sonst auf die Bearbeitung um — das ist die richtige Regel, aber sie muss serverseitig erzwungen werden, nicht nur in der Wegführung. |
| F11 | **Sicherheitsindikator, Kategoriescores, Ranglisten, Trend** | Der Knoten „School page" ist im Flow leer. Inhalt dafür: Abschnitt 6 des Entwicklungsplans. |
| F12 | **Deutsche Oberflächentexte** | Der Flow ist durchgehend englisch. Das ist für einen Wireframe in Ordnung — bei der Umsetzung sind aber alle Bildschirmnamen und Texte in der deutschen Fassung zu führen, nicht zu übersetzen. |

---

## 4. Was der Flow für die offene Frage E10 bedeutet

Der Flow ist an dieser Stelle unmissverständlich: er beschreibt Konten mit Profil,
Bewertungsverlauf, Merkliste und Einstellungen. Das ist **die Gegenposition zur Developer
Specification**, die eine sofortige Löschung der Kontaktdaten nach der Verifizierung verlangt.

Beides gleichzeitig geht nicht. Wenn der Flow gebaut werden soll — und er ist gut —, dann
ist die Konsequenz:

- Kontaktdaten bleiben **dauerhaft** gespeichert (verschlüsselt), solange das Konto besteht.
- Die Developer Specification muss an dieser Stelle **geändert** werden; sonst bauen wir
  gegen ein Dokument, das etwas anderes zusagt, als das Produkt tut — und die
  Datenschutzerklärung wird unrichtig.
- Für unter 16-Jährige empfiehlt sich weiterhin der kontolose Weg (Abschnitt 9.1 des
  Entwicklungsplans): bewerten ohne Konto, Kontakt nach der Bestätigung gelöscht. Damit
  entfällt die Frage der elterlichen Einwilligung in eine dauerhafte Speicherung.

---

## 5. Auswirkung auf den Plan

Aufgenommen als Entscheidungen **E13–E15** und als zusätzliche Arbeitspakete in den Phasen
2 und 3 des Entwicklungsplans. Der Aufwand steigt dadurch um **etwa einen Sprint**:
Kontoverwaltung, Profilseite, Merkliste und die zusätzlichen Zustandsbildschirme sind in der
bisherigen Schätzung nicht enthalten gewesen.
