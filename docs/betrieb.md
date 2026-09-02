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
