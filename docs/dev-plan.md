# Entwicklungsplan — SCHULINDEX (Portal in deutscher Sprache)

**Stand:** 26.08.2026 · **Status:** Entwurf zur Abstimmung · **Repo:** `admncc/schuldindex-com`

---

## 0. Kurzfassung

SCHULINDEX ist ein anonymes, aber verifiziertes Schulbewertungsportal für Deutschland.
Das Repository ist leer — dies ist eine Neuentwicklung auf der grünen Wiese.

Dieser Plan setzt die vier vorliegenden Spezifikationen (Project Brief, Developer
Specification, Full Rating Questionnaire, Safety Scoring Spec) in einen umsetzbaren
Entwicklungsplan um und trifft dabei zwei Kernentscheidungen:

1. **Deutsch ist die einzige Sprache zum Launch.** Sämtliche Oberflächen, Fragebögen,
   E-Mails, SMS, Fehlermeldungen und Rechtstexte werden auf Deutsch ausgeliefert. Die
   Anwendung wird trotzdem von Beginn an i18n-fähig gebaut (`de-DE` als einzige aktive
   Locale), damit die in Phase 2 vorgesehene Mehrsprachigkeit ohne Refactoring nachrüstbar ist.
2. **Die Widersprüche zwischen den Specs werden aufgelöst** (Abschnitt 2) — insbesondere
   beim Umgang mit Kontaktdaten und IP-Adressen, wo Project Brief und Developer
   Specification einander direkt widersprechen.
3. **Das Feedback vom 26.08.2026 ist eingearbeitet** — Verifizierung über E-Mail und
   WhatsApp mit SMS nur als Rückfallebene, Elterneinwilligung für unter 16-Jährige,
   Klassenstufenabfrage und der Profilbegriff (siehe E6, E10–E12).

Geschätzter Aufwand bis MVP-Launch: **ca. 16 Wochen mit 2 Entwickler:innen**
(1× Frontend, 1× Backend) zzgl. anteilig Design und externer Rechtsberatung.

---

## 1. Ausgangslage & Quellen

| Dokument | Rolle in diesem Plan |
|---|---|
| Project brief — SCHULiNDEX | Funktionsumfang, API-Entwurf, Datenmodell, Anti-Fraud-Regeln |
| Schuldindex Developer Specification | **Führend** bei Stack, Datenschutz-Regeln, Gewichtungen, Verlosung |
| Full Rating Questionnaire | **Führend** beim Fragenkatalog (5 Kategorien A–E) |
| Safety Scoring & Public Display Spec | **Führend** bei Scoring-Formel und Sicherheitsindikator |

Bei Konflikten gilt: **Developer Specification > Project Brief**, da sie die jüngere und
technisch konkretere Fassung ist. Abweichungen davon sind in Abschnitt 2 einzeln begründet.

### 1.1 Hinweis zum Namen

Die Dokumente verwenden drei Schreibweisen nebeneinander: *SCHULiNDEX*, *Schuldindex* und
die Domain *schulindex.com*; das Repository heißt `schuldindex-com`.

Für ein deutschsprachiges Portal ist das relevant: **„Schuldindex" liest sich für deutsche
Nutzer:innen als „Index der Schulden" bzw. „der Schuld"** — inhaltlich das Gegenteil der
Produktabsicht. „Schulindex" (Schul-Index) ist die korrekte Bildung.
**Empfehlung:** vor Sprint 0 verbindlich auf **SCHULINDEX / schulindex.de** festlegen und
`schulindex.de` als primäre Domain registrieren (`.de` schlägt bei deutscher Zielgruppe
`.com` in Vertrauen und SEO). Die Entscheidung blockiert Logo, Domain, E-Mail-Absender und
alle Rechtstexte — deshalb zuerst klären.

---

## 2. Produktentscheidungen (Auflösung der Spec-Widersprüche)

| # | Konflikt | Entscheidung | Begründung |
|---|---|---|---|
| E1 | Brief: Kontaktdaten werden **dauerhaft gespeichert** (für spätere Bearbeitung). Dev-Spec: Kontaktdaten werden **sofort nach Verifizierung gelöscht**. | **Klartext-Kontakt wird nach Verifizierung gelöscht.** Gespeichert bleiben: HMAC-Hash des Kontakts (Dublettenerkennung), Verifizierungszeitpunkt, Verifizierungsmethode. Die Bearbeitbarkeit wird über einen **Bearbeitungs-Token** gelöst (siehe E2). | Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO). Erfüllt beide Anforderungen ohne PII-Vorhaltung. |
| E2 | Brief fordert Review-Bearbeitung + Versionierung, was ohne Kontaktdaten unmöglich scheint. | Bei erfolgreicher Verifizierung erhält die Person **einmalig einen persönlichen Bearbeitungslink** (`/bewertung/aktualisieren?token=…`) in derselben Nachricht. Serverseitig wird nur der HMAC-Hash des Tokens gespeichert. Wer den Link verliert, kann die Bewertung nicht mehr ändern — das wird im UI klar kommuniziert. | Ermöglicht Versionierung **und** Löschung der Kontaktdaten. Der Token ist ein pseudonymer Besitznachweis, kein Personenbezug. |
| E3 | Brief: `source_ip` und `ip_geo` werden in der Tabelle `reviews` gespeichert. Dev-Spec: IP wird **unmittelbar nach der Prüfung gelöscht**. | **Die IP-Adresse wird nie in Postgres persistiert.** Sie existiert nur im Request-Kontext und in Redis (gehasht, TTL 72 h) für Ratelimits. In `reviews` landen ausschließlich die **abgeleiteten** Werte: Entfernung in km, Bundesland/Land der Geolokalisierung, Provider-Konfidenz, `ip_unknown`-Flag. | Moderator:innen brauchen die Entfernung, nicht die IP. Reduziert das Risiko einer Datenpanne erheblich. |
| E4 | Brief: 4 Kategorien à 10 Fragen. Dev-Spec-Fließtext: 4 Kategorien. Fragebogen + Scoring-Spec: **5 Kategorien A–E**, A mit **11** Fragen. | **5 Kategorien A–E, Kategorie A mit 11 Fragen.** A/B/C sind Pflicht, D/E optional. Gewichtung 3/2/2/2/1. | Fragebogen und Scoring-Spec sind konsistent zueinander und detaillierter. |
| E5 | Brief nennt eine einheitliche Antwortskala. Dev-Spec nennt **drei** Skalen (Häufigkeit / Qualität / Sicherheit). | **Drei Skalen**, pro Frage fest zugeordnet (siehe `fragebogen-de.md`). Intern immer 1–5. | Sonst ergeben Fragen wie „Wie häufig erleben Sie Mobbing?" mit „Sehr gut/Sehr schlecht" keinen Sinn. |
| E6 | Verifizierung per **E-Mail oder WhatsApp** (Dev-Spec) bzw. **E-Mail oder SMS** (Brief). | **MVP: E-Mail + WhatsApp. SMS ausschließlich als Rückfallebene**, wenn die Nummer kein WhatsApp-Konto hat oder die Zustellung fehlschlägt. Umgesetzt als Anbieter-Kette `WhatsApp → SMS` hinter einer gemeinsamen Schnittstelle. | Vorgabe des Auftraggebers (26.08.). WhatsApp-Authentifizierungsnachrichten sind in Deutschland je Nachricht günstiger als SMS, und die Abdeckung in der Zielgruppe ist sehr hoch. SMS bleibt nötig, weil eine fehlende WhatsApp-Registrierung sonst den kompletten Flow blockiert. |
| E7 | Gesamtscore-Formel `… × 20` ergibt einen Wertebereich von **20–100**, nicht 0–100. | Formel wie spezifiziert beibehalten, aber im UI als **„x von 100 Punkten"** mit Erläuterungs-Tooltip ausweisen. Alternative (Normalisierung auf 0–100 via `(Ø−1)/4×100`) ist eine offene Entscheidung, siehe Abschnitt 14. | Eine Schule kann faktisch nie unter 20 fallen; das muss entweder kommuniziert oder korrigiert werden. |
| E8 | Schwellen des Aggressionsindex (`≤ 2,0` grün / `2,1–3,4` gelb / `≥ 3,5` rot) lassen die Bereiche 2,0–2,1 und 3,4–3,5 undefiniert. | Implementierung als lückenlose Intervalle: **`≤ 2,0` grün, `> 2,0 und < 3,5` gelb, `≥ 3,5` rot.** | Der Index ist ein Mittelwert mit Nachkommastellen; Lücken würden zu Laufzeitfehlern führen. |
| E9 | Verlosung für Schüler:innen erfordert Speicherung von Kontaktdaten — auch bei Minderjährigen. | **Teilnahme erst ab 16 Jahren** (selbstauskunftbasierte Altersabfrage im Opt-in). Unter 16 wird die Checkbox ausgeblendet. Verlosung insgesamt **Post-MVP**. | Art. 8 DSGVO: Einwilligung in Diensten der Informationsgesellschaft ist in Deutschland erst ab 16 Jahren ohne Zustimmung der Erziehungsberechtigten wirksam. |
| E10 | Feedback spricht von „create a **profile** and start rating" — die Specs beschreiben dagegen eine kontolose Einzelbewertung mit anschließender Kontaktlöschung. | **Pseudonymes Leichtgewichts-Profil**, Schlüssel ist der verifizierte Kontakt. Damit ein Profil überhaupt funktionieren kann, wird der Kontakt **verschlüsselt aufbewahrt statt gelöscht** — solange das Profil besteht. Löschung erfolgt bei Profilauflösung oder nach 24 Monaten Inaktivität. Kein Passwort, Anmeldung per Einmal-Link („magic link"). | Ein Profil ohne dauerhaften Kontakt ist technisch nicht möglich. **Achtung: das kehrt E1 um und widerspricht der Developer Specification** — Punkt 1 in Abschnitt 14, muss vom Auftraggeber bestätigt werden. |
| E11 | Minderjährige unter 16 sollen bewerten dürfen, brauchen aber eine Einwilligung der Eltern. | Rollenauswahl trennt **„Schüler/in unter 16 Jahre"** und **„Schüler/in ab 16 Jahre"**. Bei unter 16 erscheint eine **verpflichtende, nicht vorangekreuzte Checkbox**: „Meine Eltern sind damit einverstanden, dass ich diese Bewertung abgebe und meine Kontaktdaten gespeichert werden." Zeitpunkt und Textfassung werden protokolliert. | Art. 8 Abs. 1 DSGVO (Altersgrenze 16 in Deutschland). Entspricht der Vorgabe des Auftraggebers und der Marktpraxis (schulen.de). Zur Belastbarkeit siehe Abschnitt 9.1. |
| E12 | Feedback: Schüler:innen sollen eine **Klassenstufe** angeben. | Pflichtfeld **„Welche Klassenstufe besuchst du?"** für beide Schülerrollen, Auswahl **1–13** (Grundschule ab Klasse 1, anders als schulen.de mit 5–13). Ehemalige geben stattdessen das **Abgangsjahr** an. Wird als Filter- und Auswertungsmerkmal gespeichert, aber **nicht öffentlich je Bewertung angezeigt** (Re-Identifizierungsrisiko an kleinen Schulen). | Erhöht die Aussagekraft der Auswertung erheblich (Grundschul- vs. Oberstufenperspektive) — bei öffentlicher Anzeige wäre die Kombination Schule + Klassenstufe + Zeitpunkt aber oft eindeutig. |

---

## 3. Sprachkonzept — „Portal auf Deutsch"

Deutsch betrifft weit mehr als die sichtbaren Buttons. Der Umfang wird hier explizit
festgehalten, damit nichts als „später übersetzen" durchrutscht.

### 3.1 Umfang

| Bereich | Anforderung |
|---|---|
| Öffentliche Oberfläche | Vollständig Deutsch, inkl. Leerzustände, Ladezustände, 404/500-Seiten |
| Fragebogen | Deutsche Fassung ist **das Original**, nicht die Übersetzung (siehe `fragebogen-de.md`) |
| Antwortskalen | Deutsche Skalenlabels, drei Varianten (Häufigkeit / Qualität / Sicherheit) |
| Formularvalidierung | Alle Fehlermeldungen Deutsch, keine Framework-Defaults („Required", „Invalid email") |
| E-Mails | Betreff + Body Deutsch, deutscher Absendername, Fußzeile mit Impressumsangaben |
| SMS/WhatsApp (Phase 2/3) | Deutsche Templates, ≤ 160 Zeichen für SMS |
| Moderationsoberfläche | Deutsch (die Moderation ist ein deutschsprachiges Team) |
| Rechtstexte | Deutsch, juristisch geprüft — nicht maschinell übersetzt |
| SEO | `<html lang="de">`, deutsche Titles/Descriptions, `hreflang="de-DE"`, deutsche Schema.org-Felder |
| URLs / Slugs | Deutsche Pfade: `/schule/…`, `/bewerten`, `/ranglisten`, `/karte`, `/impressum` |
| Formate | `de-DE`: Datum `26.08.2026`, Dezimaltrennzeichen Komma (`4,2 von 5`), Tausenderpunkt |
| Sortierung | Deutsche Kollation inkl. Umlauten (`ä = a`, `ß = ss`) in Suche und Ranglisten |
| Fehler-/Statusseiten | Deutsch, auch bei Wartungsmodus und Ratelimit-Sperren |

### 3.2 Technische Umsetzung

- **`next-intl`** mit `de-DE` als einziger aktiver Locale. Kein Sprachumschalter im MVP.
- Keine hartkodierten Strings in Komponenten — alles über Message-Keys. Ein ESLint-Regelsatz
  (`no-literal-string` für JSX) erzwingt das ab Sprint 0; nachträgliche Extraktion ist teuer.
- Message-Dateien nach Domäne getrennt: `messages/de/{common,suche,bewertung,fragebogen,schule,ranglisten,moderation,recht,mails}.json`.
- Pluralisierung und Genus über ICU MessageFormat (`{count, plural, one {# Bewertung} other {# Bewertungen}}`).
- E-Mail-Templates als React Email-Komponenten mit denselben Message-Keys — keine zweite
  Übersetzungsquelle.
- Zahl-/Datumsformatierung ausschließlich über `Intl.NumberFormat`/`Intl.DateTimeFormat`
  mit `de-DE`; kein manuelles String-Basteln.
- Postgres: `de-DE-x-icu` Kollation für Namensspalten, `unaccent` + `pg_trgm` für die
  umlauttolerante Suche („Grunewald" findet „Grünewald", „Strasse" findet „Straße").

### 3.3 Ansprache (du/Sie)

Zielgruppen sind Schüler:innen (überwiegend duzen) **und** Eltern/Lehrkräfte (überwiegend siezen).

**Entscheidung:** rollenabhängige Ansprache über ICU-Varianten. Der Fragebogen wird nach
Rollenauswahl in der passenden Variante gerendert (`anrede: "du" | "sie"`), die generische
Oberfläche nutzt neutrale Formulierungen. Die kanonische Fassung in `fragebogen-de.md` ist
die Sie-Form; die Du-Variante ist ein zweiter Wertesatz derselben Keys, keine zweite Datei
mit eigenen Fragen.

**Gendern:** durchgängig Doppelnennung oder neutrale Form („Schülerinnen und Schüler",
„Lehrkräfte", „Erziehungsberechtigte"). Keine Sonderzeichen-Formen (`*`, `:`) in
Fragebogentexten — sie stören Screenreader und wirken in einer Bewertungsfrage
positionierend. In der übrigen UI ist die Doppelpunktform zulässig, sofern konsistent.

### 3.4 Deutsche Fachtaxonomien

Schularten werden als deutsche Enums geführt und nicht aus den englischen Specs übersetzt:
`Grundschule`, `Hauptschule`, `Realschule`, `Mittel-/Oberschule`, `Gesamtschule`,
`Gymnasium`, `Förderschule`, `Berufliche Schule`, `Waldorf-/Freie Schule`, `Sonstige`.
Dazu die 16 Bundesländer als eigenes Enum. Beides wird beim Import aus jedeschule.codefor.de
auf diese Taxonomie gemappt (die Quelle nutzt je Bundesland abweichende Bezeichnungen).

---

## 4. Technischer Stack & Architektur

Der in der Developer Specification vorgeschlagene Stack wird übernommen, mit drei Präzisierungen.

| Ebene | Wahl | Anmerkung |
|---|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, React Server Components | Serverseitiges Rendering ist für SEO auf Schulprofilseiten zwingend |
| Styling | Tailwind CSS + shadcn/ui | |
| i18n | next-intl | siehe 3.2 |
| API | Next.js Route Handlers | Ein separater Fastify-Dienst ist für MVP-Lastprofil nicht nötig; API-Verträge aus dem Brief bleiben unverändert |
| Datenbank | PostgreSQL 16 + **PostGIS** | PostGIS für Entfernungsprüfung und Kartenabfragen |
| ORM / Migrationen | Drizzle ORM + drizzle-kit | Typsicher, SQL-nah, gute PostGIS-Verträglichkeit |
| Jobs / Queue | **pg-boss** (Postgres-basiert) | Vermeidet einen zweiten Datenspeicher; ausreichend für Mailversand, Geo-Anreicherung, Aggregat-Neuberechnung |
| Cache / Ratelimit | Upstash Redis (EU) | Nur flüchtige Daten: IP-Hashes, Ratelimits, Autocomplete-Cache |
| Karten | MapLibre GL JS + OpenStreetMap-Tiles | Lizenzkostenfrei; Mapbox nur, falls Vektortiles selbst gehostet werden sollen |
| E-Mail | Postmark oder Brevo (**EU-Region**) | AV-Vertrag nach Art. 28 DSGVO erforderlich |
| Geo-IP | ipinfo.io oder MaxMind GeoLite2 (**lokal**) | Lokale MaxMind-DB bevorzugt: kein Drittlandtransfer der IP |
| Hosting | Vercel (Region `fra1`) + Neon/Supabase Postgres (Frankfurt) | Datenhaltung ausschließlich EU |
| Monitoring | Sentry (EU-Region) + Vercel Analytics | |
| CI | GitHub Actions: Lint, Typecheck, Tests, Migrations-Dry-Run | |

**Architekturhinweis:** Öffentliche Leseseiten (Schulprofil, Ranglisten, Karte) werden über
ISR mit kurzer Revalidierung ausgeliefert und bei Aggregat-Änderung gezielt per Tag
invalidiert. Schreibpfade (Bewertung, Verifizierung, Moderation) laufen ungecacht.

---

## 5. Datenmodell

Abgeleitet aus dem Brief, angepasst an die Entscheidungen E1–E3.

```
schools
  id uuid pk, external_id text, name text, slug text unique,
  school_type school_type_enum, provider text,
  street text, postcode text, city text, state bundesland_enum,
  location geography(Point,4326),        -- PostGIS
  website text, is_active bool,
  created_at, updated_at

school_aliases                            -- Namensvarianten für die Suche
  school_id fk, alias text

reviews
  id uuid pk, school_id fk,
  role role_enum,                         -- schueler|eltern|lehrkraft|personal|ehemalig|sonstige
  status review_status_enum,              -- pending|verified|on_hold_geo|on_hold_fraud|approved|rejected
  current_version int,
  contact_hash text,                      -- HMAC(Kontakt, Server-Secret) — kein Klartext (E1)
  contact_method contact_method_enum,     -- email|sms|whatsapp
  verified_at timestamptz,
  edit_token_hash text,                   -- HMAC(Bearbeitungs-Token) (E2)
  edit_count int, last_edited_at timestamptz,
  geo_distance_km numeric,                -- abgeleitet, keine IP (E3)
  geo_country text, geo_state text, geo_confidence text, geo_unknown bool,
  consent_at timestamptz, consent_version text,
  created_at, updated_at

review_versions                           -- Versionshistorie, nicht öffentlich
  id uuid pk, review_id fk, version int,
  answers jsonb,                          -- {"A1":5,"A2":2,…,"E10":3}
  free_text jsonb,                        -- {"A":"…","B":null,…}
  score_a numeric, score_b numeric, score_c numeric, score_d numeric, score_e numeric,
  aggression_index numeric, overall_score numeric,
  created_at

verification_tokens
  id uuid pk, review_id fk, token_hash text, purpose text,  -- verify|edit
  expires_at timestamptz, consumed_at timestamptz, send_count int

school_aggregates                         -- materialisiert, inkrementell aktualisiert
  school_id pk, avg_a…avg_e numeric, overall_score numeric,
  aggression_index numeric, aggression_level text,
  review_count int, review_count_by_role jsonb,
  overall_score_6m_ago numeric, trend_direction text, trend_delta numeric,
  last_review_at timestamptz, updated_at

moderation_actions
  id uuid pk, review_id fk, moderator_id fk,
  action text,                            -- approve|reject|request_info|spam
  reason_code text, note text, created_at

audit_logs
  id, actor_id, action, object_type, object_id, payload jsonb, created_at

users                                     -- Moderation & Verwaltung
  id, email, password_hash, role,         -- admin|moderator|schulsupport (Phase 3)
  totp_secret, last_login_at

raffle_entries                            -- Post-MVP
  id, review_id fk, contact_encrypted bytea, age_confirmed bool,
  draw_month date, is_winner bool, notified_at, delete_after date
```

**Aufbewahrungsfristen** (per Cron-Job durchgesetzt, nicht nur dokumentiert):
`verification_tokens` 30 Tage nach Ablauf · abgelehnte Bewertungen 90 Tage, dann
Anonymisierung · `raffle_entries` 30 Tage nach Ziehung · `audit_logs` 12 Monate ·
Redis-IP-Hashes 72 Stunden.

---

## 6. Scoring & Aggregation

Vollständig aus der Safety Scoring Spec, mit den Korrekturen E7/E8.

**Skalenkodierung (intern 1–5):**
- Qualität: Sehr gut 5 · Gut 4 · Befriedigend 3 · Schlecht 2 · Sehr schlecht 1
- Sicherheit: Sehr sicher 5 · Eher sicher 4 · Teils, teils 3 · Eher unsicher 2 · Sehr unsicher 1
- Häufigkeit (**roh**): Nie 1 · Selten 2 · Gelegentlich 3 · Häufig 4 · Sehr häufig 5

**Kategorie A ist zweigeteilt:**
- `A2` (Aggression & Mobbing) = Fragen **A2 und A3** (die beiden Häufigkeitsfragen)
- `A1` (Sicherheit & Klima) = die übrigen 9 Fragen

```
A2_invertiert = 6 − Rohwert                     # Nie→5 … Sehr häufig→1
Score_A       = 0,7 × Ø(A1) + 0,3 × Ø(A2_invertiert)
Score_B…E     = Ø der jeweiligen Kategoriefragen

Gesamtscore   = (A×3 + B×2 + C×2 + D×2* + E×1*) ÷ Σ(aktive Gewichte) × 20
                * optionale Kategorien zählen nur, wenn beantwortet

Aggressionsindex = Ø der ROHEN Häufigkeitswerte von A2/A3   (1–5, nicht invertiert)
   ≤ 2,0        → geringe Häufigkeit  (grün)
   > 2,0 < 3,5  → mittlere Häufigkeit (gelb)
   ≥ 3,5        → hohe Häufigkeit     (rot)
```

**Aggregation:**
- Nur Bewertungen mit `status = approved` fließen ein, und je Bewertung **nur die
  aktuellste Version**.
- Neuberechnung als Job bei jeder Statusänderung; Ziel < 60 Sekunden bis zur Sichtbarkeit
  („near real-time" laut Brief).
- **Mindestanzahl:** Score wird auf dem Schulprofil erst ab **5** verifizierten Bewertungen
  angezeigt, in Ranglisten erst ab **10**. Darunter: „Noch nicht genügend Bewertungen".
  Beide Werte konfigurierbar.
- **Trend:** Vergleich der letzten 6 Monate gegen die 6 Monate davor; Anzeige nur, wenn in
  **beiden** Fenstern die Mindestanzahl erreicht ist. Sonst „Kein Trend verfügbar".

**Deutsche Beschriftungen im UI:** „Gesamtbewertung", „Sicherheit & Schulklima",
„Unterrichts- & Lernqualität", „Ausstattung & Lernmittel", „Schulleitung & Verwaltung",
„Umwelt & Nachhaltigkeit", „Mobbing & Aggression: geringe/mittlere/hohe Häufigkeit".

**Wortwahl der Negativ-Ranglisten:** wie im Brief gefordert nicht stigmatisierend —
**„Schulen mit dem höchsten Verbesserungsbedarf"**, nicht „schlechteste Schulen".

---

## 7. Verifizierung & Anti-Fraud

**Ablauf:**
1. Bewertung wird abgesendet → `status = pending`, Antworten gespeichert, Einwilligung protokolliert.
2. IP wird im Request-Kontext geolokalisiert, Entfernung zur Schule via PostGIS berechnet,
   **nur das Ergebnis** persistiert, IP-Hash für 72 h nach Redis (E3).
3. Verifizierungs-Token (UUIDv4, 24 h gültig) wird erzeugt, HMAC gespeichert, Klartext über
   den gewählten Kanal versendet: **E-Mail** oder **WhatsApp**; schlägt die WhatsApp-Zustellung
   fehl oder existiert kein WhatsApp-Konto zur Nummer, greift automatisch **SMS als
   Rückfallebene** (E6). Maximal 3 erneute Zusendungen.
4. Nach Bestätigung: `verified_at` gesetzt, Kontakt-HMAC gebildet, Bearbeitungs-Token erzeugt
   und in der Bestätigungsnachricht mitgeteilt (E2). Der Klartext-Kontakt wird gelöscht (E1) —
   **es sei denn, das Profilmodell nach E10 wird bestätigt**, dann bleibt er verschlüsselt
   erhalten, solange das Profil besteht.
5. Automatische Prüfungen laufen und setzen den Status:
   - Entfernung > **100 km** (konfigurierbar) → `on_hold_geo`
   - Keine Geolokalisierung möglich (Proxy/VPN) → `on_hold_geo`
   - > 5 Bewertungen desselben IP-Hashes in 10 Minuten → `on_hold_fraud` + Ratelimit
   - Gleicher Kontakt-HMAC für mehrere Schulen in kurzer Zeit → `on_hold_fraud`
   - Freitext-Filter (Beleidigungen, Drohungen, personenbezogene Daten Dritter) → `on_hold_fraud`
   - Ausreißermuster (nur Extremwerte, verdächtige zeitliche Häufung) → `on_hold_fraud`
   - Sonst → `approved`, Aggregat-Neuberechnung wird angestoßen
6. Bei Halt: neutrale deutsche Rückmeldung an die Person („Ihre Bewertung wird geprüft.")
   und Eintrag in die Moderationswarteschlange.

**Deutschland-spezifisch beim Freitextfilter:** Der Filter muss **Namen einzelner Lehrkräfte
erkennen und blocken**. Bewertungen richten sich ausschließlich an die Institution Schule.
Namentliche Aussagen über einzelne Beschäftigte sind das größte rechtliche Risiko des
Projekts (Persönlichkeitsrecht, § 823 BGB, ggf. § 186 StGB). Umsetzung: Abgleich gegen
deutsche Vornamen-/Nachnamenlisten in Kombination mit Anrede-Mustern („Frau …", „Herr …",
„Herrn …") plus verpflichtender Hinweistext direkt über dem Freitextfeld.

Zusätzlich: reCAPTCHA v3 oder **Cloudflare Turnstile** (datenschutzfreundlicher, EU-tauglich —
empfohlen) auf dem Absendeformular.

### 7.1 Pflichtfelder des Bewertungsformulars

Ergebnis des Feedbacks vom 26.08. und des Abgleichs mit `schulen.de/bewerten/…/erstellen/`.

| Feld | Beschriftung (Deutsch) | Typ | Pflicht |
|---|---|---|---|
| Schule | „Schule auswählen" | Suchfeld mit Autovervollständigung | ja |
| Rolle | „Ich bin:" | Auswahl: `Schüler/in unter 16 Jahre` · `Schüler/in ab 16 Jahre` · `Elternteil / Erziehungsberechtigte:r` · `Lehrkraft / Schulpersonal` · `Ehemalige/r` | ja |
| Elterneinwilligung | „Meine Eltern sind damit einverstanden, dass ich diese Bewertung abgebe und meine Kontaktdaten gespeichert werden." | Checkbox, **nur bei Rolle „unter 16"**, nicht vorangekreuzt | ja (bedingt) |
| Klassenstufe | „Welche Klassenstufe besuchst du?" | Auswahl 1–13 | ja, bei Schülerrollen |
| Abgangsjahr | „In welchem Jahr hast du die Schule verlassen?" | Auswahl (Jahr) | ja, bei Rolle „Ehemalige/r" |
| Fragebogen | Kategorien A–C (Pflicht), D–E (optional) | je 5-stufige Auswahl | A–C ja |
| Freitext | „Weitere Anmerkungen (optional)" je Kategorie | Textfeld | nein |
| Kontaktart | „Wie sollen wir dich bestätigen?" | Auswahl: `E-Mail` · `WhatsApp` (SMS-Rückfall automatisch) | ja |
| Kontakt | „E-Mail-Adresse" bzw. „Mobilnummer" | Text mit Formatprüfung (E.164 für Nummern) | ja |
| Datenschutz | „Ich habe die Datenschutzerklärung gelesen und willige in die Verarbeitung meiner Kontaktdaten zur Bestätigung und Missbrauchsprävention ein." | Checkbox, nicht vorangekreuzt | ja |
| Verlosung | „Ich möchte an der monatlichen Verlosung teilnehmen." | Checkbox, nur Schülerrolle **ab 16** (E9) | nein |

Die Rollenauswahl steht bewusst **an erster Stelle**: sie steuert, welche Folgefelder
überhaupt erscheinen (Elterneinwilligung, Klassenstufe, Abgangsjahr, Verlosung).

---

## 8. Moderation

Interne Oberfläche unter `/moderation`, auf Deutsch, Zugang nur mit Login + 2FA (TOTP).

- **Warteschlange:** Filter nach Status, Zeitraum, Bundesland, Schule; Sortierung nach Alter.
- **Detailansicht:** Schulstammdaten, Antworten je Kategorie, Freitexte, Entfernung in km,
  Geo-Bundesland, Verifizierungsstatus, weitere Bewertungen mit gleichem Kontakt-HMAC.
  **Keine IP-Anzeige** — sie existiert nicht mehr.
- **Aktionen:** Freigeben · Ablehnen (mit Ablehnungsgrund aus Vorlagenliste) · Rückfrage
  stellen · Als Spam markieren. Sammelaktionen für offensichtliche Spam-Wellen.
- **Protokollierung:** jede Aktion mit Person, Zeitpunkt, Begründung in `audit_logs`.
- **Ziel-Reaktionszeit:** 48 Stunden; Alarm, wenn die Warteschlange > 100 Einträge oder ein
  Eintrag > 72 Stunden alt ist.
- **Meldewege für Dritte:** öffentliches Formular `/inhalt-melden` für Schulen und Betroffene
  (Pflicht nach Art. 16 DSA), mit deutschem Formular und Eingangsbestätigung.

---

## 9. Recht & Datenschutz (Deutschland)

Ein deutschsprachiges Portal für deutsche Schulen unterliegt deutschem Recht — dieser
Abschnitt ist kein Anhang, sondern Launch-Voraussetzung.

- **Impressum** nach § 5 DDG — in Deutschland zwingend, prominent verlinkt.
- **Datenschutzerklärung** nach Art. 13 DSGVO: Zwecke (Verifizierung, Betrugsprävention),
  Rechtsgrundlage, Empfänger (Mail-Versender, Geo-IP, Hosting), Fristen, Betroffenenrechte.
- **Nutzungsbedingungen** und **Community-Richtlinien** (was darf bewertet werden, was nicht).
- **Einwilligung** vor Absenden: nicht vorangekreuzte Checkbox, Zeitpunkt und Textversion
  werden protokolliert.
- **Auskunft und Löschung:** Selbstbedienung über den Bearbeitungs-Token plus manueller
  Prozess; nach Löschung wird das Aggregat neu berechnet.
- **Art. 8 DSGVO / Minderjährige:** siehe 9.1 — betrifft durch E10/E11 nun den gesamten
  Bewertungsflow, nicht nur die Verlosung.
- **AV-Verträge** nach Art. 28 DSGVO mit allen Auftragsverarbeitern; EU-Regionen wählen.
- **DSA:** Melde- und Abhilfeverfahren, Begründung bei Entfernung von Inhalten,
  Beschwerdemöglichkeit.
- **Rechtsprechung:** Schulbewertungsportale sind in Deutschland grundsätzlich zulässig
  (BGH „spickmich.de", VI ZR 196/08). Die Grenze verläuft bei identifizierbaren
  Einzelpersonen und bei Tatsachenbehauptungen statt Meinungsäußerungen — daher der
  Namensfilter aus Abschnitt 7 und ein zügiges Gegendarstellungsverfahren.
- **Externe Prüfung** aller Rechtstexte durch eine deutsche Kanzlei mit IT-Recht-Schwerpunkt
  ist eingeplant (Phase 5, vor Launch).

### 9.1 Minderjährige unter 16 Jahren

Sobald Kontaktdaten über die reine Bestätigung hinaus gespeichert werden (Profil nach E10,
Verlosung nach E9), ist die Einwilligung von unter 16-Jährigen nach **Art. 8 Abs. 1 DSGVO**
nur mit Zustimmung der Erziehungsberechtigten wirksam.

Die vom Auftraggeber gewünschte **Checkbox „Meine Eltern sind einverstanden"** (E11) wird
umgesetzt und entspricht der Marktpraxis — `schulen.de` verwendet exakt diesen Mechanismus.
Sie ist juristisch aber das **Minimum**, nicht die vollständige Erfüllung: Art. 8 Abs. 2
DSGVO verlangt „angemessene Anstrengungen" zur Überprüfung der Einwilligung. Eine reine
Selbstauskunft ist keine Überprüfung.

Empfohlene Ausgestaltung, ohne den Flow für Jugendliche unzumutbar zu machen:
1. Checkbox wie vorgegeben, nicht vorangekreuzt, mit protokolliertem Zeitstempel und Textstand.
2. Jugendgerechte Kurzfassung der Datenschutzhinweise direkt daneben (Art. 12 Abs. 1 DSGVO
   verlangt für Kinder eine verständliche Sprache — eine verlinkte Juristensprache genügt nicht).
3. **Datensparsamste Variante für unter 16-Jährige:** kein Profil, keine Verlosung, Kontakt
   wird unmittelbar nach der Bestätigung gelöscht. Dann greift Art. 8 gar nicht erst, weil
   über die Verifizierung hinaus nichts gespeichert wird.
4. Punkt 3 verbindlich mit der Kanzlei abstimmen — er ist der wirksamste Risikoabbau des
   gesamten Projekts und kostet nur ein Feature für eine Teilgruppe.

---

## 10. Arbeitspakete

Sprintlänge 2 Wochen. „AP" = Arbeitspaket.

### Phase 0 — Fundament (Sprint 1)
- AP 0.1 Repo-Setup: Next.js 15, TypeScript strict, ESLint (inkl. `no-literal-string`), Prettier, Husky
- AP 0.2 CI-Pipeline (Lint, Typecheck, Test, Migrations-Dry-Run)
- AP 0.3 Postgres + PostGIS aufsetzen, Drizzle-Schema v1, Migrationsworkflow
- AP 0.4 **i18n-Gerüst** `next-intl`, `de-DE`, Message-Struktur, Formatierungs-Helfer
- AP 0.5 Design-System-Basis (Tailwind, shadcn/ui, Typografie, Farben inkl. Ampellogik)
- AP 0.6 Deployment auf Vercel `fra1` + Staging-Umgebung
- AP 0.7 **Meta-Business-Verifizierung und WhatsApp-Absender beantragen** — Vorlaufzeit von
  ein bis drei Wochen, blockiert Phase 2. Muss in Sprint 1 angestoßen werden, auch wenn der
  Code erst später entsteht. Parallel: Template-Freigabe für die Bestätigungsnachricht
  (Kategorie „Authentifizierung") und SMS-Anbieter als Rückfallebene vertraglich anbinden.
- **Ergebnis:** deploybare leere App auf Deutsch, CI grün, WhatsApp-Freigabe läuft

### Phase 1 — Schuldaten & Suche (Sprints 2–3)
- AP 1.1 Import-Pipeline jedeschule.codefor.de → Normalisierung → `schools`
- AP 1.2 Mapping der bundeslandspezifischen Schulartbezeichnungen auf die eigene Taxonomie
- AP 1.3 Nachgeocodierung fehlender Koordinaten (Nominatim, ratelimitkonform), Qualitätsreport
- AP 1.4 Slug-Erzeugung mit Umlautbehandlung (`gymnasium-am-muehlenweg-hamburg`)
- AP 1.5 Suche: `pg_trgm` + `unaccent`, Autocomplete-Endpunkt, Ratelimit
- AP 1.6 Suchseite `/schulen` mit Filtern (Bundesland, Schulart, Ort) auf Deutsch
- **Ergebnis:** alle deutschen Schulen suchbar, Trefferqualität gemessen

### Phase 2 — Bewertungsflow (Sprints 4–5)
- AP 2.1 Fragebogen-Definition als typisierte Konfiguration (Kategorien, Gewichte, Skalen, Pflicht/optional)
- AP 2.2 **Deutsche Fragebogeninhalte** inkl. Du-/Sie-Varianten
- AP 2.3 Mehrschritt-Formular mit Fortschrittsanzeige, Zwischenspeicherung, Mobile-First
- AP 2.4 **Rollenlogik und bedingte Felder** (7.1): Elterneinwilligung unter 16, Klassenstufe,
  Abgangsjahr, Sichtbarkeit der Verlosungs-Checkbox
- AP 2.5 `POST /api/reviews` inkl. Validierung, Einwilligungsprotokoll (Zeitstempel + Textstand
  je Einwilligung), Turnstile
- AP 2.6 **Versandschicht mit Kanalkette**: gemeinsame Schnittstelle, Anbieter WhatsApp Cloud API
  → SMS → E-Mail; Zustellstatus-Webhooks, Wiederholungslogik, automatischer Rückfall auf SMS
- AP 2.7 Deutsche Nachrichten-Templates für alle drei Kanäle (WhatsApp-Template
  freigabepflichtig, SMS ≤ 160 Zeichen)
- AP 2.8 Bestätigungsseite `/bestaetigen`, erneute Zusendung, Ablauf-/Fehlerbehandlung — alles Deutsch
- AP 2.9 Kontaktbehandlung nach Bestätigung + Ausgabe des Bearbeitungs-Tokens (E1/E2/E10)
- **Ergebnis:** Bewertung kann abgegeben und per E-Mail oder WhatsApp bestätigt werden

### Phase 3 — Anti-Fraud & Moderation (Sprints 6–7)
- AP 3.1 Geo-IP-Anbindung (MaxMind lokal), Entfernungsprüfung via PostGIS, Schwelle konfigurierbar
- AP 3.2 Ratelimits und Dublettenerkennung (Redis, Kontakt-HMAC)
- AP 3.3 Freitextfilter inkl. **Lehrkräftenamen-Erkennung** (deutsche Namenslisten)
- AP 3.4 Muster-/Ausreißererkennung
- AP 3.5 Moderationsoberfläche: Warteschlange, Detailansicht, Aktionen, Sammelaktionen
- AP 3.6 Moderator-Login mit 2FA, Rollen, Audit-Log
- AP 3.7 Meldeformular `/inhalt-melden` (DSA)
- **Ergebnis:** Bewertungen werden geprüft, gehalten und moderierbar

### Phase 4 — Scoring, Schulprofil, Ranglisten (Sprints 8–9)
- AP 4.1 Scoring-Engine mit vollständiger Testabdeckung der Formeln aus Abschnitt 6
- AP 4.2 Aggregation, inkrementelle Neuberechnung, Mindestanzahl-Logik
- AP 4.3 Schulprofilseite: Gesamtscore, Kategoriescores, **Sicherheitsindikator mit Ampel und
  deutschem Tooltip**, Bewertungsanzahl, Stand der letzten Aktualisierung
- AP 4.4 Versionierung + Bearbeitungsflow (`/bewertung/aktualisieren`), Bearbeitungssperre (3 Monate)
- AP 4.5 Trendberechnung 6 Monate, Anzeige ▲ ▼ →
- AP 4.6 Ranglisten: bundesweit, je Bundesland, je Ort, je Schulart; Bestenliste und
  „höchster Verbesserungsbedarf"; Sortierung nach Verbesserung/Verschlechterung
- **Ergebnis:** öffentliche Daten sind vollständig sichtbar und korrekt berechnet

### Phase 5 — Startseite, Karte, Recht, SEO (Sprint 10)
- AP 5.1 Startseite: Suche, letzte 5 verifizierte Bewertungen, Top 30, Kartenvorschau
- AP 5.2 Karte `/karte`: MapLibre, Bewertungen der letzten 7 Tage, Ampelmarker, deutsche Tooltips
- AP 5.3 Rechtstexte: Impressum, Datenschutz, Nutzungsbedingungen, Community-Richtlinien
- AP 5.4 SEO: Metadaten, `sitemap.xml` über alle Schulen, `robots.txt`, Schema.org `School`
- AP 5.5 Barrierefreiheit: Tastaturbedienung, Kontraste, Screenreader-Labels (WCAG 2.1 AA)
- **Ergebnis:** vollständiges Portal, extern prüfbar

### Phase 6 — Härtung & Launch (Sprint 11)
- AP 6.1 Lasttests auf Suche, Schulprofil, Karte
- AP 6.2 Sicherheitstest: Injection, Ratelimits, Token-Handling, IDOR auf Bearbeitungs-Token
- AP 6.3 Datenschutz-Abnahme: Löschjobs verifizieren, AV-Verträge, Verarbeitungsverzeichnis
- AP 6.4 Monitoring, Alarme, Runbooks, Moderations-Schulung
- AP 6.5 Redaktionelles Korrektorat **aller** deutschen Texte durch Muttersprachler:in
- **Ergebnis:** Launch-Freigabe

### Phase 7 — Nach dem MVP
Monatliche Verlosung (mit Altersprüfung) · vollwertiges Profil mit Bewertungsübersicht ·
Rolle „Schulsupport" mit eigenem Login und Echtzeitauswertung · Echtzeit-Karte per WebSocket ·
automatisiertes Betrugs-Scoring (ML) · öffentliche Forschungs-API · Mehrsprachigkeit
(Englisch, Türkisch, Arabisch, Ukrainisch — die Locale-Struktur steht bereits).

---

## 11. Meilensteine

| Meilenstein | Ende Sprint | Woche |
|---|---|---|
| M1 — Fundament steht, deutsche App deploybar | 1 | 2 |
| M2 — Alle deutschen Schulen suchbar | 3 | 6 |
| M3 — Bewertung abgebbar und verifizierbar | 5 | 10 |
| M4 — Betrugsprüfung und Moderation aktiv | 7 | 14 |
| M5 — Scores, Profile, Ranglisten öffentlich | 9 | 18 |
| M6 — Feature-vollständig inkl. Recht und Karte | 10 | 20 |
| M7 — Launch-Freigabe | 11 | 22 |

Die Schätzung „ca. 16 Wochen" aus der Kurzfassung gilt für zwei parallel arbeitende
Entwickler:innen mit überlappenden Phasen; die Tabelle zeigt den sequenziellen Verlauf.
Rechtsprüfung und Schuldatenimport sind die beiden Positionen mit dem größten
Verzögerungsrisiko und werden deshalb früh angestoßen.

---

## 12. Teststrategie

- **Unit:** Scoring-Formeln (jede Kategorie, Inversion, optionale Kategorien, Ampelgrenzen
  einschließlich der Werte 2,0 / 2,1 / 3,4 / 3,5), Entfernungsberechnung, Slug-Erzeugung
  mit Umlauten.
- **Integration:** kompletter Bewertungs- und Verifizierungsablauf mit Mail-Mock;
  Ablauf/Wiederverwendung von Token; Löschung des Kontakts nach Verifizierung.
- **E2E (Playwright):** Suche → Bewerten → Bestätigen → Sichtbarkeit auf dem Profil;
  Moderationsablauf; Bearbeitung per Token.
- **Sprachtests:** automatisierter Check, dass für jeden verwendeten Message-Key ein
  deutscher Wert existiert und **keine** englischen Restzeichenketten im Build vorkommen
  (Snapshot-Test über die gerenderten Seiten).
- **Last:** 1.000 gleichzeitige Lesezugriffe auf Suche und Profil.
- **Datenschutz-Test:** nach Verifizierung wird geprüft, dass weder Kontakt noch IP in
  Datenbank oder Logs auffindbar sind.

---

## 13. Betrieb

- Umgebungen: `production`, `staging`, `preview` (pro Pull Request).
- Secrets ausschließlich über Umgebungsvariablen; Rotation des HMAC-Secrets dokumentiert
  (Achtung: Rotation invalidiert bestehende Kontakt-Hashes — Verfahren vorab festlegen).
- Backups: tägliches Postgres-Backup, 30 Tage Aufbewahrung, Restore-Test vierteljährlich.
- Alarme: Warteschlange zu lang, Fehlerrate Mailversand, Häufung `on_hold_geo`,
  Ausfall des Geo-IP-Anbieters, Aggregat-Job-Rückstand.
- Logs ohne personenbezogene Daten; IP-Logging im Reverse-Proxy deaktivieren bzw. kürzen.

---

## 14. Offene Punkte für den Auftraggeber

1. **Name und Domain** — SCHULINDEX vs. Schuldindex, `.de` vs. `.com` (siehe 1.1). *Blockiert Design und Rechtstexte.*
2. **Score-Skala** — Formel `×20` (Bereich 20–100) beibehalten oder auf echte 0–100 normalisieren? (E7)
3. **Mindestanzahl Bewertungen** — Vorschlag 5 für Profilanzeige, 10 für Ranglisten. Bestätigen oder anpassen.
4. **Bearbeitungssperre** — Vorschlag: eine Aktualisierung je 3 Monate.
5. **Verlosung** — Post-MVP und erst ab 16 Jahren (E9). Einverstanden? Preisbudget und Ziehungsverfahren offen.
6. **Rolle „Schulsupport"** — welche Daten sollen Schulen sehen? Einzelbewertungen oder nur Aggregate? Wie erfolgt die Legitimationsprüfung der Schule?
7. **Freitext bei Start** — soll der Freitext im MVP bereits öffentlich sichtbar sein oder zunächst nur in die Moderation fließen? Das ist die größte rechtliche Stellschraube.
8. **Geo-Schwelle 100 km** — bei Internatsschulen und Berufsschulen mit großem Einzugsgebiet regelmäßig zu eng. Ausnahmeliste je Schulart?
9. **Rechtsberatung** — Kanzlei benennen; Vorlaufzeit einplanen.
10. **Ansprache** — Bestätigung der rollenabhängigen Du-/Sie-Variante (3.3).
