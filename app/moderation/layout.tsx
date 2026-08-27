import { holeAngemeldete } from "./sitzung";
import { abmelden } from "./aktionen";

/**
 * Rahmen der Moderationsoberfläche.
 *
 * Eigene Kopfzeile mit Kennung und Abmeldung: wer zwischen mehreren Konten
 * wechselt, muss ohne Umweg sehen, in welchem er gerade arbeitet — sonst wird
 * unter der falschen Kennung entschieden, und das Protokoll ist wertlos.
 */
export default async function Moderationslayout({ children }: { children: React.ReactNode }) {
  const angemeldet = await holeAngemeldete();

  return (
    <main className="huelle moderation">
      {angemeldet ? (
        <div className="moderationskopf">
          <span className="marke klein">Moderation</span>
          <nav>
            <a href="/moderation">Warteschlange</a>
            <a href="/moderation/meldungen">Meldungen</a>
            <a href="/moderation/verlosung">Verlosung</a>
            <a href="/moderation/schulzugang">Schulzugänge</a>
            <a href="/moderation/aufbewahrung">Aufbewahrung</a>
            <a href="/moderation/einstellungen">Betrugserkennung</a>
          </nav>
          <form action={abmelden} className="anmeldung">
            <span>
              {angemeldet.name} <span className="gedaempft">({angemeldet.kennung})</span>
            </span>
            <button className="knopf zweitrangig klein">Abmelden</button>
          </form>
        </div>
      ) : null}
      {children}
    </main>
  );
}
