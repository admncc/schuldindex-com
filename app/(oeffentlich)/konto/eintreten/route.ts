import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { erzeugeKontositzung, kontocookie } from "@/domain/kontozugang";
import { loeseAnmeldelinkEin } from "@/db/konto";
import { anfrageIstSicher } from "../../../sichere-verbindung";

/**
 * Löst den Anmeldelink ein.
 *
 * Bewusst ein Route-Handler und keine Seite: ein Cookie lässt sich nur in einer
 * Server Action oder einem Route-Handler setzen. Der erste Entwurf hatte das
 * Einlösen in der Anmeldeseite - die Sitzung entstand, das Cookie kam nie an,
 * und die Anmeldung endete wieder auf dem Formular.
 */
export const dynamic = "force-dynamic";

export async function GET(anfrage: Request): Promise<NextResponse> {
  const url = new URL(anfrage.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/konto/anmelden", url));

  const sitzung = erzeugeKontositzung();
  const ergebnis = await loeseAnmeldelinkEin(token, sitzung);

  if (!ergebnis.ok) {
    // „unbekannt“ und „verbraucht“ sagen dasselbe: wer einen fremden Link
    // ausprobiert, soll nicht erfahren, ob es ihn gibt.
    const grund = ergebnis.grund === "abgelaufen" ? "abgelaufen" : "ungueltig";
    return NextResponse.redirect(new URL(`/konto/anmelden?grund=${grund}`, url));
  }

  const sicher = anfrageIstSicher(anfrage);
  (await cookies()).set(kontocookie(sicher), sitzung.klartext, {
    httpOnly: true,
    secure: sicher,
    sameSite: "lax",
    path: "/",
    expires: sitzung.gueltigBis,
  });

  return NextResponse.redirect(new URL("/konto", url));
}
