import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { holeAngemeldete } from "../sitzung";
import Anmeldeformular from "./formular";
import { OHNE_2FA_HINWEIS, zweiterFaktorPflicht } from "@/domain/zweiterfaktor";
import { holeEinstellungen } from "@/db/einstellungen";

export const metadata: Metadata = { title: "Moderation - Anmeldung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Anmeldeseite() {
  if (await holeAngemeldete()) redirect("/moderation");
  const mitCode = zweiterFaktorPflicht(await holeEinstellungen());

  return (
    <section className="abschnitt schmal">
      <h1>Moderation</h1>
      <p className="hinweis">
        Zugang nur für die Redaktion.{" "}
        {mitCode
          ? "Neben Kennung und Kennwort ist der Code aus deiner Authenticator-App nötig."
          : "Zurzeit genügen Kennung und Kennwort."}
      </p>
      {mitCode ? null : (
        <p className="alarm" role="status">
          {OHNE_2FA_HINWEIS}
        </p>
      )}
      <Anmeldeformular mitCode={mitCode} />
    </section>
  );
}
