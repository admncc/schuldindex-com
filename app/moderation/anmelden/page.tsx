import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { holeAngemeldete } from "../sitzung";
import Anmeldeformular from "./formular";

export const metadata: Metadata = { title: "Moderation — Anmeldung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Anmeldeseite() {
  if (await holeAngemeldete()) redirect("/moderation");

  return (
    <section className="abschnitt schmal">
      <h1>Moderation</h1>
      <p className="hinweis">
        Zugang nur für die Redaktion. Neben Kennung und Kennwort ist der Code aus deiner
        Authenticator-App nötig.
      </p>
      <Anmeldeformular />
    </section>
  );
}
