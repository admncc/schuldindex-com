import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { holeSchule } from "@/db/schulen";
import { holeFassungZumAendern } from "@/db/konto";
import { holeAngemeldetesKonto } from "../../konto/sitzung";
import { erzeugeStempel, stempelText } from "@/domain/formularstempel";
import { Bewertungsformular } from "./formular";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const schule = await holeSchule(slug);
  return { title: schule ? `${schule.name} bewerten` : "Schule nicht gefunden" };
}

export const dynamic = "force-dynamic";

export default async function Bewertungsseite({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ aendern?: string }>;
}) {
  const { slug } = await params;
  const { aendern } = await searchParams;
  const schule = await holeSchule(slug);
  if (!schule) notFound();

  // Ändern geht nur angemeldet und nur an der eigenen Bewertung. Beides wird
  // hier geprüft und beim Speichern noch einmal - die Seite kann täuschen, die
  // Schnittstelle nicht.
  let aenderung = undefined;
  if (aendern) {
    const konto = await holeAngemeldetesKonto();
    if (konto === null) redirect("/konto/anmelden");
    aenderung = await holeFassungZumAendern(konto.id, aendern, schule.id);
    if (aenderung === null) notFound();
  }

  return (
    <>
      <section className="schulkopf">
        <div>
          <p className="hinweis">{aenderung ? "Bewertung ändern" : "Bewertung abgeben"}</p>
          <h1>{schule.name}</h1>
          <p className="anschrift">
            {[schule.strasse, [schule.plz, schule.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
          </p>
        </div>
        <p className="hinweis">
          {aenderung
            ? "Deine bisherigen Antworten stehen schon da. Was du änderst, wird noch einmal geprüft, bevor es die alte Fassung ersetzt."
            : "Deine Bewertung erscheint immer anonym. Wir fragen deine Kontaktdaten nur, um zu bestätigen, dass sie von einem Menschen kommt."}
        </p>
      </section>

      <section className="abschnitt">
        {/* Der Stempel wird hier ausgestellt und beim Absenden zurückgeschickt.
            Aus ihm rechnet der Server die Dauer - eine Angabe des Browsers wäre
            wertlos (siehe domain/formularstempel.ts). */}
        <Bewertungsformular
          schulSlug={schule.slug}
          schulname={schule.name}
          aenderung={aenderung}
          stempel={stempelText(erzeugeStempel())}
        />
      </section>
    </>
  );
}
