import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { holeSchuldatensatz } from "@/db/schulverwaltung";
import { verlangeAnmeldung } from "../../sitzung";
import Schulformular from "../formular";

export const metadata: Metadata = { title: "Schule bearbeiten", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export default async function Schulpflegeseite({ params }: { params: Promise<{ id: string }> }) {
  const moderatorin = await verlangeAnmeldung();
  const { id } = await params;
  const schule = await holeSchuldatensatz(id);
  if (schule === null) notFound();

  return (
    <section className="abschnitt schmal">
      <p className="hinweis">
        <a href="/moderation/schulen">← Alle Schulen</a>
      </p>
      <h1>{schule.name}</h1>

      <ul className="hinweisliste">
        <li>
          <strong>Öffentliches Profil:</strong>{" "}
          <a href={`/schule/${schule.slug}`}>/schule/{schule.slug}</a>{" "}
          <span className="gedaempft">
            (der Slug bleibt beim Umbenennen stehen - sonst brechen alle geteilten Links)
          </span>
        </li>
        <li>
          <strong>Bewertungen:</strong>{" "}
          {schule.bewertungen === 0 ? "noch keine" : schule.bewertungen}
        </li>
        <li>
          <strong>Herkunft:</strong>{" "}
          {schule.quell_id.startsWith("manuell:")
            ? "von Hand angelegt"
            : `aus der Quelle (${schule.quell_id})`}
          {schule.manuell_gepflegt ? " · von Hand bearbeitet, wird vom Import nicht überschrieben" : ""}
        </li>
        <li>
          <strong>Zuletzt geändert:</strong> {ZEIT.format(schule.aktualisiert_am)}
        </li>
      </ul>

      <Schulformular
        darfAendern={moderatorin.rolle === "leitung"}
        werte={{
          id: schule.id,
          name: schule.name,
          bundesland: schule.bundesland,
          schularten: schule.schularten,
          schulartOriginal: schule.schulart_original ?? "",
          strasse: schule.strasse ?? "",
          plz: schule.plz ?? "",
          ort: schule.ort ?? "",
          traeger: schule.traeger ?? "",
          website: schule.website ?? "",
          telefon: schule.telefon ?? "",
          email: schule.email ?? "",
          lat: schule.lat === null ? "" : String(schule.lat),
          lon: schule.lon === null ? "" : String(schule.lon),
          istAktiv: schule.ist_aktiv,
        }}
      />
    </section>
  );
}
