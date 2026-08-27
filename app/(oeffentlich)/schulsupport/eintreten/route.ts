import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loeseZugangEin } from "@/db/schulzugang";
import { ZUGANG_TAGE } from "@/domain/schulzugang";
import { schulcookie } from "../sitzung";

/** Wie beim Konto: das Einlösen gehört in einen Route-Handler, nicht in eine Seite. */
export const dynamic = "force-dynamic";

export async function GET(anfrage: Request): Promise<NextResponse> {
  const url = new URL(anfrage.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/schulsupport/anfordern", url));

  const ergebnis = await loeseZugangEin(token);
  if (!ergebnis.ok) {
    return NextResponse.redirect(new URL(`/schulsupport/anfordern?grund=${ergebnis.grund}`, url));
  }

  const sicher = process.env.NODE_ENV === "production";
  (await cookies()).set(schulcookie(sicher), ergebnis.sitzung, {
    httpOnly: true,
    secure: sicher,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + ZUGANG_TAGE * 24 * 3600_000),
  });

  return NextResponse.redirect(new URL("/schulsupport", url));
}
