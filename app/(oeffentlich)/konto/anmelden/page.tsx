import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { holeAngemeldetesKonto } from "../sitzung";
import Anmeldeformular from "./formular";
import { einer } from "@/domain/suchparameter";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const GRUND_TEXT: Readonly<Record<string, string>> = {
  abgelaufen: "Dieser Anmeldelink ist abgelaufen. Fordere dir einen neuen an.",
  ungueltig: "Dieser Anmeldelink ist nicht mehr gültig. Fordere dir einen neuen an.",
};

export default async function Kontoanmeldung({
  searchParams,
}: {
  searchParams: Promise<{ grund?: string | string[] }>;
}) {
  const grund = einer((await searchParams).grund);
  if (await holeAngemeldetesKonto()) redirect("/konto");

  return (
    <section className="abschnitt schmal">
      <h1>Deine Bewertungen</h1>
      {grund && GRUND_TEXT[grund] ? (
        <p className="fehler" role="alert">{GRUND_TEXT[grund]}</p>
      ) : null}
      <p className="hinweis">
        Gib den Kontakt an, mit dem du bewertet hast. Wir schicken dir einen Anmeldelink - ein
        Kennwort brauchst du hier nicht.
      </p>
      {/* Der Weg heraus aus der Sackgasse: Wer bewertet hat und die
          Bestätigung nie bekam, kam nirgendwo mehr hin - nicht anmelden, nicht
          erneut bewerten, nichts nachfordern. Dasselbe Formular schickt jetzt
          den Bestätigungslink, wenn das Konto noch unbestätigt ist. */}
      <p className="hinweis">
        Ist deine Bewertung noch nicht bestätigt - weil die Nachricht nie ankam oder die 24
        Stunden abgelaufen sind -, schicken wir dir stattdessen den Bestätigungslink noch einmal.
        Dasselbe Formular, dieselbe Angabe.
      </p>
      <Anmeldeformular />
    </section>
  );
}
