import { FELDNAME, type Betreiberangaben } from "@/recht/betreiber";

/**
 * Fehlende Pflichtangabe - sichtbar, nicht stillschweigend.
 *
 * Eine Impressumsseite, die eine fehlende Angabe einfach ausblendet, sieht
 * vollständig aus und ist es nicht. Genau daran hängt die Abmahnung.
 */
export function Fehlt({ feld }: { feld: keyof Betreiberangaben }) {
  return <mark className="fehlt">{FELDNAME[feld]} fehlt - bitte eintragen</mark>;
}

export function Angabe({
  angaben,
  feld,
}: {
  angaben: Betreiberangaben;
  feld: keyof Betreiberangaben;
}) {
  const wert = angaben[feld];
  return wert === null ? <Fehlt feld={feld} /> : <>{wert}</>;
}

/**
 * Die Anschrift des Betreibers als Block.
 *
 * **Warum nicht als Satz.** Vorher stand auf der Datenschutzseite eine Zeile
 * „DH DIGITAL, INC., 3500 South DuPont Hwy., 19901 Dover, Delaware. E-Mail:
 * …" - vier Angaben, durch Kommas getrennt, ohne Land. Eine Anschrift liest
 * man nicht als Satz, sondern als Block: Wer prüfen will, ob er den Anbieter
 * anschreiben kann, sucht die Zeilen einer Briefanschrift und findet in einer
 * Kommakette keine davon wieder. Bei einem Sitz im Ausland kommt dazu, dass
 * das Land in der Kette untergeht, obwohl es die Anschrift erst zustellbar
 * macht.
 *
 * Dasselbe Bauteil auf beiden Rechtsseiten, damit Impressum und
 * Datenschutzerklärung nicht zwei verschiedene Anschriften zeigen können.
 */
export function Anschrift({ angaben: a }: { angaben: Betreiberangaben }) {
  return (
    <address className="anschriftsblock">
      <strong>
        <Angabe angaben={a} feld="name" />
        {a.rechtsform ? ` ${a.rechtsform}` : null}
      </strong>
      <span>
        <Angabe angaben={a} feld="strasse" />
      </span>
      <span>
        <Angabe angaben={a} feld="plz" /> <Angabe angaben={a} feld="ort" />
      </span>
      {a.land ? <span>{a.land}</span> : null}
      {a.vertreten ? <span className="gedaempft">Vertreten durch {a.vertreten}</span> : null}
      <span>
        E-Mail:{" "}
        {a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : <Fehlt feld="email" />}
      </span>
      {a.telefon ? <span>Telefon: {a.telefon}</span> : null}
    </address>
  );
}

/**
 * Der Vertreter in der Union als Briefanschrift.
 *
 * **Warum er zerlegt wird.** In der Umgebung steht er als eine Zeile
 * („Name, Straße, PLZ Ort“), weil eine Umgebungsvariable keine Absätze kennt.
 * Als Satz gelesen ist das dasselbe Problem wie vorher bei der Anschrift des
 * Betreibers: Wer prüfen will, ob er diese Stelle anschreiben kann, sucht die
 * Zeilen einer Anschrift und findet in einer Kommakette keine davon. Art. 27
 * Abs. 4 DSGVO macht ihn zur Anlaufstelle für Betroffene und Behörden - dann
 * muss er auch aussehen wie eine Adresse, an die man schreibt.
 *
 * Zwei Dinge, die der erste Entwurf falsch machte:
 *
 *  - **Der Abstand vor der letzten Zeile.** Den setzt `.anschriftsblock` für
 *    den Betreiberblock, wo unten die E-Mail-Zeile steht und sich von der
 *    Postanschrift absetzen soll. Hier ist die letzte Zeile „10557 Berlin“ -
 *    mitten aus der Anschrift herausgerissen. Deshalb `knapp`.
 *  - **Die Beschriftung stand als eigener Satz darüber.** Ein freistehendes
 *    „Vertreter in der Europäischen Union nach Art. 27 DSGVO:“ über einer
 *    großen weißen Karte liest sich wie zwei Dinge, nicht wie eines. Sie
 *    gehört in die Karte.
 *
 * Getrennt wird am Komma. Das ist die Schreibweise, die `.env.example`
 * vorgibt; steht dort kein Komma, bleibt es eine Zeile - falsch wird es nie.
 */
export function Vertreteranschrift({
  wert,
  beschriftung,
}: {
  wert: string;
  beschriftung?: string;
}) {
  const zeilen = wert
    .split(",")
    .map((z) => z.trim())
    .filter((z) => z !== "");
  return (
    <address className="anschriftsblock knapp">
      {beschriftung ? <span className="anschrift-marke">{beschriftung}</span> : null}
      {zeilen.map((z, i) => (i === 0 ? <strong key={z}>{z}</strong> : <span key={z}>{z}</span>))}
    </address>
  );
}
