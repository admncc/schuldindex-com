import type { Metadata } from "next";
import Meldeformular from "./formular";

export const metadata: Metadata = {
  title: "Inhalt melden",
  description: "Inhalte melden, die gegen Recht oder gegen unsere Nutzungsbedingungen verstoßen (Art. 16 DSA).",
};

export default function Meldeseite() {
  return (
    <section className="abschnitt rechtstext">
      <h1>Inhalt melden</h1>
      <p>
        Hältst du einen Inhalt auf SCHULINDEX für rechtswidrig, kannst du ihn hier melden. Wir
        sehen uns jede Meldung an, entscheiden über sie und teilen dir das Ergebnis mit. Dieses
        Verfahren erfüllt Art. 16 des Digital Services Act.
      </p>
      <p className="hinweis">
        Für falsche Stammdaten - Adresse, Schulart, Website - brauchst du dieses Formular nicht;
        eine kurze Nachricht an die Adresse im <a href="/impressum">Impressum</a> genügt.
      </p>

      <Meldeformular />
    </section>
  );
}
