import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { holeSchule } from "@/db/schulen";
import { holeFassungZumAendern } from "@/db/konto";
import { holeAngemeldetesKonto } from "../../konto/sitzung";
import { erzeugeStempel, stempelText } from "@/domain/formularstempel";
import { Bewertungsformular } from "./formular";
import { einer } from "@/domain/suchparameter";
import { erlaubteKontaktarten } from "@/domain/einstellungen";
import { holeEinstellungen } from "@/db/einstellungen";

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
  searchParams: Promise<{ aendern?: string | string[] }>;
}) {
  const { slug } = await params;
  const aendern = einer((await searchParams).aendern);
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
      <section className="schulkopf formularkopf">
        <div>
          <p className="hinweis">{aenderung ? "Bewertung ändern" : "Bewertung abgeben"}</p>
          <h1>{schule.name}</h1>
          <p className="anschrift">
            {[schule.strasse, [schule.plz, schule.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
          </p>
        </div>
        <p className="hinweis">
          {aenderung
            ? "Deine Antworten stehen schon da. Änderungen werden noch einmal geprüft."
            : "Anonym - deine Nummer brauchen wir nur zur Bestätigung."}
        </p>
      </section>

      <section className="abschnitt">
        {/* Der Landeplatz sagt es, diese Seite sagte es nicht - dabei landet
            man hier vom Schulprofil aus. Ohne JavaScript tat der Knopf
            „Weiter" gar nichts: kein Schritt, keine Meldung, keine geänderte
            Adresse. Eine stumme Sackgasse. */}
        <noscript>
          <p className="fehlerkasten">
            Für das Bewertungsformular brauchst du JavaScript - ohne bewegt sich hier nichts.
            Schulsuche und Schulprofile funktionieren auch ohne.
          </p>
        </noscript>

        {/* Der Stempel wird hier ausgestellt und beim Absenden zurückgeschickt.
            Aus ihm rechnet der Server die Dauer - eine Angabe des Browsers wäre
            wertlos (siehe domain/formularstempel.ts). */}
        <Bewertungsformular
          schulSlug={schule.slug}
          schulname={schule.name}
          aenderung={aenderung}
          stempel={stempelText(erzeugeStempel(schule.slug))}
          kontaktwege={erlaubteKontaktarten(await holeEinstellungen())}
        />
      </section>
    </>
  );
}
