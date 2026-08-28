import type { Metadata } from "next";
import { BUNDESLAENDER } from "@/domain/bundesland";
import { verlangeAnmeldung } from "../../sitzung";
import Schulformular from "../formular";

export const metadata: Metadata = { title: "Schule anlegen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NeueSchuleSeite() {
  const moderatorin = await verlangeAnmeldung();

  return (
    <section className="abschnitt schmal">
      <p className="hinweis">
        <a href="/moderation/schulen">← Alle Schulen</a>
      </p>
      <h1>Schule anlegen</h1>
      <p className="hinweis">
        Für Schulen, die in der Quelle fehlen - Neugründungen etwa, oder Schulen in freier
        Trägerschaft, die dort nicht geführt werden. Vorher bitte suchen: Eine Dublette lässt
        sich nachträglich nur zusammenführen, indem eine der beiden stillgelegt wird, und die
        Bewertungen bleiben dann getrennt.
      </p>

      <Schulformular
        neu
        darfAendern={moderatorin.rolle === "leitung"}
        werte={{
          name: "",
          bundesland: BUNDESLAENDER[0]!,
          schularten: [],
          schulartOriginal: "",
          strasse: "",
          plz: "",
          ort: "",
          traeger: "",
          website: "",
          telefon: "",
          email: "",
          lat: "",
          lon: "",
          istAktiv: true,
        }}
      />
    </section>
  );
}
