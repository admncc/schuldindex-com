import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { holeAngemeldetesKonto } from "../sitzung";
import Anmeldeformular from "./formular";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const GRUND_TEXT: Readonly<Record<string, string>> = {
  abgelaufen: "Dieser Anmeldelink ist abgelaufen. Fordere dir einen neuen an.",
  ungueltig: "Dieser Anmeldelink ist nicht mehr gültig. Fordere dir einen neuen an.",
};

export default async function Kontoanmeldung({
  searchParams,
}: {
  searchParams: Promise<{ grund?: string }>;
}) {
  const { grund } = await searchParams;
  if (await holeAngemeldetesKonto()) redirect("/konto");

  return (
    <section className="abschnitt schmal">
      <h1>Deine Bewertungen</h1>
      {grund && GRUND_TEXT[grund] ? (
        <p className="fehler" role="alert">{GRUND_TEXT[grund]}</p>
      ) : null}
      <p className="hinweis">
        Gib den Kontakt an, mit dem du deine Bewertung bestätigt hast. Wir schicken dir einen
        Anmeldelink - ein Kennwort brauchst du hier nicht.
      </p>
      <Anmeldeformular />
    </section>
  );
}
