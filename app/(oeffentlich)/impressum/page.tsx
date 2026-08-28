import type { Metadata } from "next";
import { betreiber, fehlendeAngaben } from "@/recht/betreiber";
import { Angabe, Fehlt } from "../rechtsteile";

export const metadata: Metadata = { title: "Impressum" };
export const dynamic = "force-dynamic";

export default function Impressumsseite() {
  const a = betreiber();
  const fehlen = fehlendeAngaben(a);

  return (
    <section className="abschnitt rechtstext">
      <h1>Impressum</h1>

      {fehlen.length > 0 ? (
        <div className="alarm" role="alert">
          <strong>Dieses Impressum ist unvollständig.</strong>
          <p>
            {fehlen.length} Pflichtangabe{fehlen.length === 1 ? "" : "n"} nach § 5 DDG fehl
            {fehlen.length === 1 ? "t" : "en"} noch. Sie werden über Umgebungsvariablen gesetzt
            (siehe <code>.env.example</code>); vor dem Start muss das erledigt sein.
          </p>
        </div>
      ) : null}

      <h2>Angaben nach § 5 DDG</h2>
      <dl>
        <dt>Betreiber</dt>
        <dd>
          <Angabe angaben={a} feld="name" />
          {a.rechtsform ? ` ${a.rechtsform}` : null}
        </dd>
        <dt>Anschrift</dt>
        <dd>
          <Angabe angaben={a} feld="strasse" />
          <br />
          <Angabe angaben={a} feld="plz" /> <Angabe angaben={a} feld="ort" />
        </dd>
        {a.vertreten ? (
          <>
            <dt>Vertreten durch</dt>
            <dd>{a.vertreten}</dd>
          </>
        ) : null}
        <dt>E-Mail</dt>
        <dd>{a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : <Fehlt feld="email" />}</dd>
        {a.telefon ? (
          <>
            <dt>Telefon</dt>
            <dd>{a.telefon}</dd>
          </>
        ) : null}
        {a.register && a.registernummer ? (
          <>
            <dt>Register</dt>
            <dd>
              {a.register}, {a.registernummer}
            </dd>
          </>
        ) : null}
        {a.umsatzsteuerId ? (
          <>
            <dt>Umsatzsteuer-ID</dt>
            <dd>{a.umsatzsteuerId}</dd>
          </>
        ) : null}
      </dl>

      <h2>Verantwortlich für den Inhalt</h2>
      <p>
        Nach § 18 Abs. 2 MStV: {a.verantwortlich ?? <Fehlt feld="verantwortlich" />}
        {a.verantwortlich && a.strasse ? `, ${a.strasse}, ${a.plz ?? ""} ${a.ort ?? ""}` : null}
      </p>

      <h2>Ansprechstelle nach dem Digital Services Act</h2>
      <p>
        Für Behörden und für Nutzerinnen und Nutzer erreichbar unter der oben genannten
        E-Mail-Adresse, auf Deutsch. Inhalte melden kannst du ohne E-Mail direkt über{" "}
        <a href="/inhalt-melden">unser Meldeformular</a> (Art. 16 DSA).
      </p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Zu den Schuldaten</h2>
      <p>
        Die Stammdaten der Schulen stammen aus dem offenen Datenbestand von{" "}
        <a href="https://jedeschule.codefor.de" rel="noopener noreferrer" target="_blank">
          jedeschule.codefor.de
        </a>{" "}
        und aus den Schulverzeichnissen der Länder. Fehlende Koordinaten werden über{" "}
        <a href="https://photon.komoot.io" rel="noopener noreferrer" target="_blank">
          Photon
        </a>{" "}
        ergänzt, das auf OpenStreetMap-Daten beruht (© OpenStreetMap-Mitwirkende, ODbL). Ist eine
        Angabe zu deiner Schule falsch, schreib uns - wir korrigieren sie.
      </p>
    </section>
  );
}
