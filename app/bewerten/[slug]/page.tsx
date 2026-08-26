import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { holeSchule } from "@/db/schulen";
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

export default async function Bewertungsseite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const schule = await holeSchule(slug);
  if (!schule) notFound();

  return (
    <>
      <section className="schulkopf">
        <div>
          <p className="hinweis">Bewertung abgeben</p>
          <h1>{schule.name}</h1>
          <p className="anschrift">
            {[schule.strasse, [schule.plz, schule.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
          </p>
        </div>
        <p className="hinweis">
          Deine Bewertung erscheint immer anonym. Wir fragen deine Kontaktdaten nur, um zu
          bestätigen, dass sie von einem Menschen kommt.
        </p>
      </section>

      <section className="abschnitt">
        <Bewertungsformular schulSlug={schule.slug} schulname={schule.name} />
      </section>
    </>
  );
}
