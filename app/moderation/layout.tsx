import { holeAngemeldete } from "./sitzung";
import { OHNE_2FA_HINWEIS, zweiterFaktorPflicht } from "@/domain/zweiterfaktor";
import { holeEinstellungen } from "@/db/einstellungen";
import { abmelden } from "./aktionen";

/**
 * Rahmen der Moderationsoberfläche.
 *
 * Eigene Kopfzeile mit Kennung und Abmeldung: wer zwischen mehreren Konten
 * wechselt, muss ohne Umweg sehen, in welchem er gerade arbeitet - sonst wird
 * unter der falschen Kennung entschieden, und das Protokoll ist wertlos.
 */
export default async function Moderationslayout({ children }: { children: React.ReactNode }) {
  const angemeldet = await holeAngemeldete();
  // Nur für Angemeldete nachgesehen: Die Anmeldeseite fragt selbst, und ohne
  // Sitzung soll die Seite keine Auskunft über die eigene Absicherung geben.
  const ohneZweitenFaktor = angemeldet ? !zweiterFaktorPflicht(await holeEinstellungen()) : false;

  return (
    <main className="huelle moderation">
      {angemeldet ? (
        <div className="moderationskopf">
          <span className="marke klein">Moderation</span>
          <nav>
            <a href="/moderation">Warteschlange</a>
            <a href="/moderation/meldungen">Meldungen</a>
            <a href="/moderation/schulen">Schulen</a>
            <a href="/moderation/analytik">Auswertung</a>
            <a href="/moderation/verlosung">Verlosung</a>
            <a href="/moderation/schulzugang">Schulzugänge</a>
            <a href="/moderation/aufbewahrung">Aufbewahrung</a>
            <a href="/moderation/einstellungen">Einstellungen</a>
          </nav>
          <form action={abmelden} className="anmeldung">
            <span>
              {angemeldet.name} <span className="gedaempft">({angemeldet.kennung})</span>
            </span>
            <button className="knopf zweitrangig klein">Abmelden</button>
          </form>
        </div>
      ) : null}
      {/* Der Hinweis steht auf jeder Seite und nicht nur einmal beim Anmelden:
          Ein abgeschalteter zweiter Faktor soll niemandem entfallen, der
          täglich hier arbeitet. */}
      {ohneZweitenFaktor ? (
        <p className="alarm" role="status">
          {OHNE_2FA_HINWEIS}
        </p>
      ) : null}
      {children}
    </main>
  );
}
