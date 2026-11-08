# Betrieb

Wie das Portal in der Produktion steht, und warum an den Stellen, an denen es
nicht selbsterklärend ist.

## Die Kette

```
Besucherin → Cloudflare → Caddy (Port 443) → Next (127.0.0.1:3000) → PostgreSQL
```

Drei Dinge hängen daran zusammen und müssen zusammen stimmen:

**Next lauscht nur lokal.** In `/etc/systemd/system/schulindex.service.d/lokal.conf`:

```ini
[Service]
ExecStart=
ExecStart=/usr/bin/npm start -- -H 127.0.0.1
```

Die leere erste `ExecStart=`-Zeile ist nötig, sonst hängt systemd den zweiten
Befehl an den ersten an, statt ihn zu ersetzen. Und der Hostname muss als Flag
kommen: `next start` liest `HOSTNAME` **nicht** - in der CLI-Definition hat nur
der Port eine Umgebungsvariable hinterlegt. Die Variable auszuwerten versucht
allein der `standalone`-Server, den wir nicht benutzen. Ein
`Environment=HOSTNAME=127.0.0.1` sieht richtig aus und tut nichts.

Ohne diese Bindung ist die Anwendung unter `http://<IP>:3000` direkt
erreichbar. Das ist nicht nur unsauber: Solche Aufrufe kommen ohne
`X-Forwarded-Proto` an, gelten damit als unsichere Verbindung, und das
Sitzungscookie der Moderation bekommt kein `Secure`. Genau daran fiel die
Anmeldung im Testbetrieb bei jedem Klick zurück.

**`VERTRAUTE_PROXYS` zählt die Proxys, nicht die Server.** Mit Cloudflare davor
sind es zwei (Cloudflare und Caddy), ohne Cloudflare einer. Die Anwendung nimmt
aus `X-Forwarded-For` den Eintrag `n` Stellen von rechts; alles links davon kann
der Browser selbst schreiben. Steht der Wert zu niedrig, liest sie die Adresse
des Cloudflare-Knotens statt die der Besucherin - und die Entfernungsprüfung,
das schwerste Signal der Betrugserkennung, misst ab dann Unsinn.

**Der Wert muss mitwandern, wenn die Wolke im Cloudflare-Panel umgeschaltet
wird.** Prüfen lässt sich das von außen:

```bash
curl -sI https://schulindex.com/ | grep -i cf-ray
```

Kommt ein `cf-ray` zurück, läuft es über Cloudflare → `VERTRAUTE_PROXYS=2`.
Kommt keiner → `1`.

## Cloudflare

Zwei Einstellungen, die das Ganze sonst umwerfen:

- **SSL/TLS-Modus „Full (strict)"**, nicht „Flexible". Caddy hat ein echtes
  Let's-Encrypt-Zertifikat und leitet Port 80 auf 443 um. Bei „Flexible"
  spricht Cloudflare den Ursprung über HTTP an, Caddy leitet um, Cloudflare
  fragt wieder über HTTP - Endlosschleife für alle Besucherinnen.
- **Bot Fight Mode aus** oder höchstens „Managed". Er schiebt eine
  JavaScript-Prüfung vor Anfragen und trifft damit auch die Abgabe des
  Formulars und den Bestätigungsweg.

**Managed robots.txt ist aus.** Cloudflare schiebt sonst einen eigenen Block mit
`Allow: /` vor unseren. Beide sprechen `User-agent: *` an; Suchmaschinen führen
solche Gruppen zusammen, und bei gleich langem Pfad gewinnt die weniger strenge
Regel - unser `Disallow: /` liefe ins Leere. Was Cloudflares Block an Sperren
für KI-Sammler mitbrachte, steht seitdem in `app/robots.ts`.

## Suchmaschinen

`INDEXIERUNG=an` in der `.env` ist die einzige Freigabe. Fehlt sie, sperrt
`/robots.txt` alles und jede Seite trägt `noindex`. Voreingestellt ist zu:
Eine Seite, die zu spät in den Index kommt, verliert ein paar Wochen
Sichtbarkeit; eine, die zu früh hineingerät, verliert die Menschen, die zuerst
da waren.

Der Riegel darf erst fallen, wenn in der Produktion tatsächlich
Bestätigungsnachrichten hinausgehen. Vorher läuft jede Besucherin aus einer
Trefferliste in eine Sackgasse: Bewertung abgegeben, Nachricht kommt nie, der
eine Versuch ist verbraucht.

Umlegen und neu starten reicht - `robots.txt` läuft dynamisch, ein neuer Build
ist nicht nötig.

## Eine neue Fassung ausrollen

```bash
cd /srv/schulindex
git pull origin <branch>
psql "$DATABASE_URL" -f db/migrations/<neue>.sql   # nur bei neuer Migration
npm ci                                             # nur bei geänderten Abhängigkeiten
npm run build
systemctl restart schulindex
```

Ohne `systemctl restart` läuft der alte Build weiter - `npm run build` allein
ändert nichts an dem, was ausgeliefert wird. Das hat schon zweimal wie ein
Fehler in der Anwendung ausgesehen.

Migrationen, die `alter type ... add value` enthalten, **nicht** mit `psql -1`
fahren.

## Ursprung gegen Umgehung schnüren (offen)

Der Server ist unter seiner IP weiterhin direkt erreichbar; wer sie kennt,
umgeht Cloudflare. Caddy lässt sich auf die Cloudflare-Bereiche einschnüren.
Die Liste nicht abschreiben, sondern holen - sie ändert sich:

```bash
python3 - <<'PY' > /etc/caddy/cloudflare.caddy
import json, urllib.request
d = json.load(urllib.request.urlopen("https://api.cloudflare.com/client/v4/ips"))["result"]
print("@nicht_cloudflare not remote_ip " + " ".join(d["ipv4_cidrs"] + d["ipv6_cidrs"]))
PY
```

Die erzeugte Zeile in den Domain-Block der `Caddyfile` einbinden und mit
`abort @nicht_cloudflare` beantworten. Vorher prüfen, dass `caddy validate`
zufrieden ist - ein Fehler hier sperrt alle aus, nicht nur die Umgehung.

## Karte

Die Karte zeichnet einen echten Kartenhintergrund aus **Vektorkacheln, die auf
unserem eigenen Server liegen**. Das ist keine Bequemlichkeitsfrage: Eine Karte
von Mapbox, MapTiler oder openstreetmap.org lädt beim Betrachter Bilder von
einem fremden Server und schickt dabei dessen IP-Adresse dorthin - dieselbe
Frage wie bei den Google-Schriften, die aus genau diesem Grund aus dem Projekt
geflogen sind (LG München I, 3 O 17493/20). Und es hätte einen zweiten, ganz
praktischen Preis: Ein fremder Kartendienst ist nichts, was nach § 25 Abs. 2
Nr. 2 TDDDG „erforderlich" wäre - das Portal bräuchte ein Einwilligungsbanner.

**Ohne Kachelarchiv ist nichts kaputt.** Die Karte fällt dann auf ihre alte
Darstellung zurück, in der der Schulbestand die Umrisse des Landes selbst
zeichnet. Die Seite prüft das bei jedem Aufruf, höchstens aber einmal je
Minute - ein eingespieltes Archiv erscheint also ohne Neustart.

### Einrichten

Zwei Teile, getrennt, weil der eine Minuten und der andere eine gute Stunde
dauert.

**Zeichenbilder** (rund 2 MB), einmalig:

```bash
cd /srv/schulindex
npx tsx scripts/kartendaten.ts
```

**Kachelarchiv** (rund 2 GB). Der Auszug wird aus dem täglichen Gesamtbestand
von Protomaps gezogen - über Bereichsabrufe, es wird also nicht der ganze
Planet geladen. Dafür das Werkzeug `pmtiles` von den Releases des Projekts
`protomaps/go-pmtiles` holen, dann:

```bash
pmtiles extract https://build.protomaps.com/$(date -d yesterday +%Y%m%d).pmtiles \
  /srv/schulindex/daten/karten/basis.pmtiles \
  --bbox=5.7,47.1,15.3,55.3 --maxzoom=14
```

Bequemer geht es über die Oberfläche auf `build.protomaps.com`: Ausschnitt
wählen, herunterladen, als `daten/karten/basis.pmtiles` ablegen.

Prüfen:

```bash
ls -lh /srv/schulindex/daten/karten/
curl -s -o /dev/null -w '%{http_code}\n' -H 'Range: bytes=0-1023' \
  https://schulindex.com/karten/basis.pmtiles
```

Erwartet: `206`. Eine `200` hiesse, dass der Bereichsabruf nicht ankommt - dann
lüde jeder Kartenaufruf zwei Gigabyte.

**Der Platzbedarf gehört auf die Rechnung.** Zwei Gigabyte auf einem Server mit
40 GB Platte sind kein Problem, aber sie sind da; vor dem Einspielen einmal
`df -h` ansehen.

### Auffrischen

Der Auszug ist ein Stand, kein Abonnement. Ein- bis zweimal im Jahr denselben
Befehl mit neuem Datum laufen lassen, die Datei austauschen, fertig - ein
Neustart ist nicht nötig, weil die Auslieferung die Datei bei jedem Abruf
liest.

## Zugriffsprotokolle

Die Datenschutzerklärung sagt zu, dass die Zugriffsprotokolle des Servers nach
einer bestimmten Frist gelöscht werden. Diese Frist muss jemand durchsetzen -
sonst ist es keine Frist, sondern ein Satz.

**Caddy schreibt ohne `log`-Anweisung keine Zugriffsprotokolle.** Was ohne sie
im systemd-Journal landet, sind Fehlermeldungen, und das Journal löscht nach
Größe, nicht nach Zeit. Beides zusammen hieße: Die Erklärung beschreibt
Protokolle, die es so nicht gibt, und nennt eine Frist, die nichts durchsetzt.

Deshalb wird protokolliert, und zwar mit Verfallsdatum. Im Domainblock der
`Caddyfile`:

```
log {
    output file /var/log/caddy/zugriff.log {
        roll_size 20MiB
        roll_keep 30
        roll_keep_for 2160h
    }
}
```

`roll_keep_for 2160h` sind neunzig Tage.

**Die Frist muss zum genannten Zweck passen, nicht umgekehrt.** Für die reine
Abwehr von Angriffen wären sieben Tage der übliche Rahmen, und neunzig wären
begründungsbedürftig. Der Grund, der hier trägt, steht deshalb ausdrücklich in
der Datenschutzerklärung: Der Versuch, die Wertung einer Schule zu drehen,
läuft über Wochen und fällt erst auf, wenn das Muster erkennbar wird - ohne
Protokolle aus dieser Zeit lässt sich hinterher nicht mehr klären, was
geschehen ist. Wer die Frist ändert, ändert den Absatz dort mit.

`roll_keep 30` bei `roll_size 20MiB` deckelt den Platzbedarf auf 600 MiB. Die
Zahl ist bewusst so hoch, dass die **Zeit** die Grenze ist und nicht die
Größe: Bei fünf Dateien à 10 MiB wären die Protokolle nach starkem Verkehr
früher weg als nach neunzig Tagen, und dann stünde in der Erklärung wieder
eine Frist, die nichts beschreibt.

Dazu das Journal auf dieselbe Frist, damit nicht der zweite Weg offenbleibt:

```bash
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=90day\n' > /etc/systemd/journald.conf.d/frist.conf
systemctl restart systemd-journald
```

Anschließend `BETREIBER_PROTOKOLLFRIST="90 Tagen"` in der `.env` - der Wert
steht in der Erklärung im Satz „die Protokolle werden nach … gelöscht", daher
der Dativ.

Prüfen, dass die Protokolle wirklich entstehen und wirklich rollen:

```bash
ls -lh /var/log/caddy/
journalctl --disk-usage
```

## Einwilligungsbanner und Reichweitenmessung

Beides steht **nicht im Code**, sondern im Panel unter `/moderation/einbettungen`
(nur die Leitung). Dahinter liegen zwei Felder: das Banner des Anbieters
(InMobi CMP oder ein anderes) und danach die Messung, zum Beispiel Google
Analytics.

Vor der ersten Nutzung einmal die Migration einspielen:

```
psql "$DATABASE_URL" -f db/migrations/0031_einbettungen.sql
```

### Was geprüft wird, und was nicht

Der eingetragene Schnipsel wird zerlegt (`src/domain/einbettung.ts`). Erlaubt
sind `<script>`-Elemente und HTML-Kommentare; ein `<noscript>`-Teil wird
verworfen. Abgelehnt werden `<iframe>`, `<img>`, Stylesheets,
Ereignisattribute wie `onload`, Adressen ohne `https`, ein Skript mit `src`
*und* Code zugleich sowie alles, was `</script` im Inhalt trägt.

**Das begrenzt die Form, nicht die Macht.** Ein Skript von `cmp.inmobi.com`
kann alles, was JavaScript kann - Formulare mitlesen inbegriffen. Die Prüfung
sorgt dafür, dass die Entscheidung bewusst fällt (welchem Anbieter öffne ich
die Seite?) und nicht als Nebenwirkung eines Tippfehlers. Deshalb: nur
Schnipsel eintragen, die beim Anbieter selbst erzeugt wurden.

### Reihenfolge und Auslieferung

Der ganze Schnipsel geht als **ein** Skript hinaus, das die Elemente selbst in
der eingetragenen Reihenfolge anlegt (`app/skripte.tsx`). Grund: React zieht
`<script async src>` in den Dokumentkopf und liefert es vor den übrigen aus -
damit stünde der Lader des Anbieters vor dem Stub, der `window.__tcfapi`
anlegt. Die Prüfung in `app/skripte.test.tsx` hält das fest.

Ausgeliefert wird nur in den Gruppen `(oeffentlich)` und `(kampagne)`, nicht in
der Moderation. Die Messung läuft außerdem **nur**, wenn auch das Banner aktiv
ist: Messen ohne vorherige Einwilligung wäre nach § 25 Abs. 1 TDDDG
rechtswidrig, und das Panel sagt das an der Stelle, an der es auffällt.

### Seiten mit Geheimnis in der Adresse

Auf `/bestaetigen?token=…` und den `eintreten`-Routen wird **nichts** Fremdes
geladen (`src/domain/geheimeadresse.ts`, gesetzt in `middleware.ts`). Sonst
ginge der Bestätigungstoken als Teil der Seitenadresse an den Anbieter der
Messung - der ihn einlösen könnte. Dieselben Seiten senden
`Referrer-Policy: no-referrer`, damit der Token nicht über `document.referrer`
auf der nächsten Seite ankommt. Wer eine neue Route mit einem Geheimnis in der
Adresse baut, trägt sie dort ein.

### SMS einrichten (GTX Messaging)

Per SMS geht ein **sechsstelliger Code** hinaus, kein Link: Ein Link wird
umgebrochen, von manchen Geräten nicht erkannt, von Mobilfunkanbietern als
Spam eingestuft - und er reisst die Person aus dem Formular in einen Browser,
womöglich einen anderen als den, in dem sie gerade bewertet hat.

In `/srv/schulindex/.env`:

```
SMS_BENUTZER=…
SMS_KENNWORT=…
SMS_ABSENDER=SCHULINDEX
BETREIBER_SMSDIENST="GTX Messaging GmbH, Bonn, Deutschland"
```

Danach `systemctl restart schulindex`. Der Weg schaltet sich selbst frei:
`zustellbareArten()` nimmt SMS auf, sobald Zugangsdaten da sind. Im Panel
unter *Einstellungen → Wege der Bestätigung* muss „SMS" zusätzlich angehakt
sein.

**Zwei Eigenheiten der GTX-Schnittstelle**, beide im Code berücksichtigt:

* Der Erfolg steht im **Antworttext**, nicht im HTTP-Status. Ein Fehler kommt
  als HTTP 200 mit `503` im Körper. Wer nur `response.ok` prüft, hält jeden
  Ausfall für eine Zustellung.
* Die Nummer geht **ohne `+`** hinaus (`491701717179`).

**Der Nachrichtentext bleibt im GSM-7-Zeichenvorrat.** Ein einziger Umlaut
zwingt die SMS in UCS-2, und damit schrumpft sie von 160 auf 70 Zeichen - aus
einer Nachricht werden zwei, und zwei werden berechnet. Wer den Text ändert,
prüft das nach.

**Missbrauchskosten.** SMS ist der einzige Weg, der bei Missbrauch Geld
kostet, und die Verlosung ist ein Anreiz. Die Drosselungen greifen je Konto
und je Absenderadresse; eine Tagesobergrenze über alles gibt es noch **nicht**.
Behalte die Guthabenanzeige bei GTX im Blick.

### Der Zähler von Cloudflare

Cloudflare Web Analytics wird in der Cloudflare-Oberfläche ein- und
ausgeschaltet; das Zählskript fügt Cloudflare selbst in die Antwort ein.
**Der Server kann das nicht ablesen.** Darum gibt es `CLOUDFLARE_ZAEHLER` in
der `.env`: Nur bei `an` steht der zugehörige Absatz in der
Datenschutzerklärung und nennt `static.cloudflareinsights.com`. Wer den
Schalter bei Cloudflare umlegt, legt ihn auch hier um - sonst behauptet die
Erklärung etwas, das nicht läuft, oder verschweigt etwas, das läuft.

Nachsehen, was tatsächlich ausgeliefert wird:

```
curl -s -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)' \
  https://schulindex.com/ | grep -c cloudflareinsights
```

### Datenschutzerklärung

`/datenschutz` liest dieselbe Quelle wie die Auslieferung: Abschnitt 2.2 nennt
die eingebundenen Hosts automatisch und sagt ohne Einbettung, dass nicht
gefragt wird, weil es nichts zu fragen gibt. Der erklärende Text daneben
(welche Daten, welche Fristen beim Anbieter) bleibt Handarbeit - nach einem
Anbieterwechsel durchlesen.

Der Widerruf läuft über „Cookie-Einstellungen" in der Fußzeile; der Link
erscheint nur bei aktivem Banner und ruft `__tcfapi('displayConsentUi')` auf.
Antwortet der Anbieter nicht, landet man auf `/datenschutz#einwilligung`.

## Nachrichtenversand

Ohne zugestellte Bestätigung wird **keine einzige Bewertung veröffentlicht**.
Der Versand ist damit kein Beiwerk, sondern die Voraussetzung für alles andere.

Stand: E-Mail stellt zu, sobald SMTP eingerichtet ist. WhatsApp und SMS sind
weiterhin Protokollwege - in der Produktion gesperrt, weil der
Bestätigungslink sonst in der Serverausgabe stünde. Das Formular bietet nur
Wege an, die auch ankommen (`zustellbareArten()`): In der Produktion ohne SMTP
bietet es gar keinen an und sagt das, statt eine Bewertung entgegenzunehmen,
die nie bestätigt werden kann.

### Einrichten

SMTP und nicht die Schnittstelle eines Anbieters: Jeder Anbieter spricht SMTP,
ein Wechsel kostet vier Zeilen in der `.env` und keinen Code.

Anbieter, die zum Versprechen der Seite passen (Verarbeitung in der EU):
**Brevo** (Paris, kostenlos bis 300 Nachrichten am Tag), **Mailjet** (Paris),
**Scaleway TEM** (Paris), **Rapidmail** (Freiburg). Entscheidend ist weniger
der Preis als die Zustellquote - transaktionale Anbieter sind dafür gebaut,
ein gewöhnliches Postfach nicht.

1. Konto anlegen, Domäne `schulindex.com` als Absender eintragen.
2. Die DNS-Einträge, die der Anbieter nennt, bei Cloudflare setzen - **SPF**
   (TXT auf der Domäne) und **DKIM** (TXT auf einer Unterdomäne). Beide auf
   „DNS only" stellen, nicht proxied.
3. Dazu ein **DMARC**-Eintrag auf `_dmarc.schulindex.com`, zu Beginn
   beobachtend: `v=DMARC1; p=none; rua=mailto:info@schulindex.com`. Ohne ihn
   sortiert Gmail transaktionale Post zunehmend aus.
4. In `/srv/schulindex/.env` eintragen: `SMTP_HOST`, `SMTP_PORT` (587 für
   STARTTLS, 465 für durchgehendes TLS), `SMTP_BENUTZER`, `SMTP_KENNWORT`,
   `SMTP_ABSENDER`. Dazu `BETREIBER_EMAILDIENST` mit vollem Namen und Sitz -
   er steht dann in der Datenschutzerklärung, wie Art. 13 DSGVO es verlangt.
5. `systemctl restart schulindex` - die Werte werden beim Start gelesen.
6. Unter `/moderation/einstellungen` die **Testnachricht** verschicken. Sie
   geht denselben Weg wie eine echte Bestätigung. Landet sie im Spam statt im
   Posteingang, fehlen SPF oder DKIM - dann landet auch jede echte
   Bestätigung dort.

### Wenn nichts ankommt

Im Ereignisprotokoll steht der Grund, ohne den Empfänger:

```
curl -H "Authorization: Bearer sdx_…" \
  "https://schulindex.com/api/diagnose/ereignisse?bereich=versand"
```

Verschlüsselt wird immer: Port 465 durchgehend, sonst STARTTLS verbindlich
(`requireTLS`). Ein Anbieter ohne TLS wird abgelehnt statt im Klartext
beliefert - der Bestätigungslink **ist** das Geheimnis.

## Schutzköpfe

Stehen in `next.config.ts`, nicht in der Caddy-Konfiguration: So werden sie mit
der Anwendung ausgeliefert und mitversioniert - eine Einstellung auf dem Server
überlebt kein neues Aufsetzen.

| Kopf | Wogegen |
|---|---|
| `Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options: DENY` | Clickjacking. In der Moderation liegt „Freigeben" hinter einem Klick. |
| `X-Content-Type-Options: nosniff` | Geratene Inhaltstypen, vor allem bei den Kartendateien. |
| `Referrer-Policy: strict-origin-when-cross-origin` | Verweisquelle nach draussen. Auf Adressen mit Geheimnis überschreibt die Middleware das mit `no-referrer`. |
| `Permissions-Policy` | Kamera, Mikrofon, Bezahlen. Standort bleibt erlaubt - „in meiner Nähe" braucht ihn. |
| `Strict-Transport-Security: max-age=31536000` | Abfangen des **ersten** Aufrufs über http. Ohne `includeSubDomains` und ohne `preload`, damit es rücknehmbar bleibt. |

Nachsehen:

```
curl -sI https://schulindex.com/ | grep -iE 'frame|content-security|nosniff|referrer|permissions|strict-transport'
```

**Was noch fehlt:** eine vollständige `Content-Security-Policy` mit `script-src`.
Sie ist mit den eingetragenen Fremdskripten vereinbar - die Hosts stehen in
`einbettungen`, und der erzeugte Rahmen liesse sich über seinen Hash erlauben -,
aber Next bringt eigene Skripte mit, die dafür einen Nonce brauchen. Nicht
nebenbei zu machen.

## Diagnose von außen

Unter `/moderation/diagnose` (nur Leitung) lässt sich ein befristeter Zugang zu
`/api/diagnose` freischalten. Jede Freischaltung erzeugt ein **neues** Kennwort
und beendet das vorige; angezeigt wird es genau einmal, gespeichert ist nur
seine Prüfsumme. Dauer wählbar: 1, 8, 24 oder 72 Stunden - einen Dauerzugang
gibt es nicht.

```bash
curl -H "Authorization: Bearer sdx_…" https://schulindex.com/api/diagnose
curl -H "Authorization: Bearer sdx_…" "https://schulindex.com/api/diagnose/ereignisse?art=fehler&grenze=50"
```

**Die Schnittstelle ist ausschließlich lesend.** Sie führt keine Befehle aus,
gibt keine Kontaktdaten heraus und zeigt keine Freitexte aus Bewertungen. Was
sie liefert, sind Summen, Zustände und das Ereignisprotokoll. Jeder Zugriff
wird protokolliert, auch der mit falschem Kennwort, und der Zähler steht im
Panel: Ein Zugang, der mehr Zugriffe hat als erwartet, fällt dort auf.

### „Absender nicht lokalisierbar" bei jeder Abgabe

Das Ortssignal wiegt 3, die Halteschwelle liegt bei 3 - schlägt es bei jeder
Abgabe an, landet **jede** Bewertung in der Handarbeit. Drei Ursachen sehen
von aussen gleich aus, und `/api/diagnose/netz` unterscheidet sie:

```
curl -H "Authorization: Bearer sdx_…" https://schulindex.com/api/diagnose/netz
```

Das Feld `befund` sagt, woran es liegt:

| Was dort steht | Ursache |
|---|---|
| `VERTRAUTE_PROXYS ist nicht gesetzt` | Der Kopf wird gar nicht gelesen. Richtig ist 2 (Cloudflare + Caddy). |
| `Nur n Eintraege, aber m Proxys erwartet` | `VERTRAUTE_PROXYS` zu hoch - dann ist der Absender *immer* unbekannt. |
| `nicht in der Datenbank gefunden` | Adresse ausserhalb des installierten Auszugs, VPN oder Rechenzentrum. Korrekter Befund, kein Fehler. |
| `In Ordnung` | Kette und Datenbank arbeiten; das Signal kam von der Adresse selbst. |

Die Auskunft gilt **nur für die eigene Anfrage** und wird nirgends gespeichert.
Es gibt bewusst keine Abfrage über fremde Besucher.

Hilft kein Nachziehen, ist nicht `entfernung_km` die Stellschraube, sondern das
Gewicht des Ortssignals. Bei vielen VPN-Nutzern ist „nicht lokalisierbar" der
Normalfall und sollte dann nicht mehr allein zum Anhalten reichen.

## Ereignisprotokoll

Serverfehler, Versandergebnisse und Diagnosezugriffe stehen unter
`/moderation/diagnose` und in `/api/diagnose/ereignisse`. Eingesammelt werden
sie über `instrumentation.ts` (jeder Fehler beim Aufbau einer Seite oder in
einem Route Handler) und an den Stellen, an denen ein Ergebnis sonst
verschwände - vor allem beim Versand der Bestätigungsnachricht, der Stelle, an
der eine Abgabe im Betrieb strandet.

Einträge werden nach **72 Stunden gelöscht**. Das ist die einzige automatische
Löschung im Portal; ausgelöst wird sie beiläufig beim Schreiben und Lesen, weil
es keinen Zeitplan gibt, auf den man sie legen könnte. Vor dem Schreiben werden
Adressen, Telefonnummern und Kennwörter unkenntlich gemacht und verdächtige
Feldnamen (`freitext`, `kontakt`, `token`, …) ganz entfernt - ein Protokoll ist
die bequemste Art, eine Zusage zu brechen.

## Testdaten aufräumen

```bash
DATABASE_URL=… npx tsx scripts/qa-aufraeumen.ts             # nur zeigen
DATABASE_URL=… npx tsx scripts/qa-aufraeumen.ts --wirklich  # löschen
```

Entfernt die Konten der QA-Durchgänge samt Bewertungen, Empfehlungen und Losen
und legt das Moderatorenkonto `qa-schau` still. Konten mit einer freigegebenen
Bewertung oder einem Gewinn bleiben stehen und werden benannt: Die eine steckt
in veröffentlichten Mittelwerten, der andere ist ein Vorgang, über den
Rechenschaft zu geben ist.

Die erzeugten **Demobewertungen** sind etwas anderes - sie tragen `ist_demo` und
gehen im Panel unter „Aufbewahrung" mit einem Klick.
