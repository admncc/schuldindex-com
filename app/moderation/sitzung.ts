/**
 * Zugangsprüfung der Moderationsoberfläche.
 *
 * Jede Seite unter `/moderation` ruft `verlangeAnmeldung()` als erstes auf.
 * Bewusst kein Middleware-Schutz: Middleware läuft in einer Umgebung ohne
 * Datenbankzugriff, könnte also nur das Vorhandensein eines Cookies prüfen,
 * nicht seine Gültigkeit. Ein abgelaufenes oder beendetes Cookie käme durch.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SITZUNGSCOOKIE_NAMEN } from "@/domain/anmeldung";
import { holeSitzung, type AngemeldeteModeratorin } from "@/db/moderation";

export async function holeAngemeldete(): Promise<AngemeldeteModeratorin | null> {
  const laden = await cookies();
  const wert = SITZUNGSCOOKIE_NAMEN.map((name) => laden.get(name)?.value).find((v) => v !== undefined);
  if (!wert) return null;
  return holeSitzung(wert);
}

export async function verlangeAnmeldung(): Promise<AngemeldeteModeratorin> {
  const angemeldet = await holeAngemeldete();
  if (angemeldet === null) redirect("/moderation/anmelden");
  return angemeldet;
}
