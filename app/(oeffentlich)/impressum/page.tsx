import type { Metadata } from "next";
import { betreiber, fehlendeAngaben } from "@/recht/betreiber";
import { Anschrift, Fehlt, Vertreteranschrift } from "../rechtsteile";

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
            {fehlen.length === 1 ? "t" : "en"} noch. Wir tragen sie nach.
          </p>
        </div>
      ) : null}

      <h2>Angaben nach § 5 DDG</h2>
      <Anschrift angaben={a} />
      {a.register && a.registernummer ? (
        <dl>
          <dt>Register</dt>
          <dd>
            {a.register}, {a.registernummer}
          </dd>
          {a.umsatzsteuerId ? (
            <>
              <dt>Umsatzsteuer-ID</dt>
              <dd>{a.umsatzsteuerId}</dd>
            </>
          ) : null}
        </dl>
      ) : a.umsatzsteuerId ? (
        <dl>
          <dt>Umsatzsteuer-ID</dt>
          <dd>{a.umsatzsteuerId}</dd>
        </dl>
      ) : null}

      {/* Der Vertreter in der Union gehoert ins Impressum, nicht nur in die
          Datenschutzerklaerung: Er ist die Stelle, an die sich Behoerden und
          Betroffene wenden, wenn der Anbieter ausserhalb der EU sitzt. */}
      {a.land !== null && a.land !== "Deutschland" ? (
        <>
          <h2>Vertreter in der Europäischen Union</h2>
          <p>Nach Art. 27 DSGVO und Art. 13 DSA benannt:</p>
          {a.euVertreter === null ? (
            <p>
              <Fehlt feld="euVertreter" />
            </p>
          ) : (
            <Vertreteranschrift wert={a.euVertreter} />
          )}
        </>
      ) : null}

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
