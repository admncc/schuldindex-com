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
