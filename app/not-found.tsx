import type { Metadata } from "next";

export const metadata: Metadata = { title: "Seite nicht gefunden" };

/**
 * Die 404-Seite für alles außerhalb des öffentlichen Portals.
 *
 * `app/(oeffentlich)/not-found.tsx` greift nur innerhalb dieser Gruppe; eine
 * Adresse wie `/gibtsnicht` fiel daran vorbei und bekam Next.js' eigene Seite -
 * englisch, leer, ohne Weg zurück. Diese hier ist bewusst schlicht: Sie hat
 * kein Layout über sich, also auch keine Kopfzeile, und muss für sich stehen.
 */
export default function NichtGefunden() {
  return (
    <main className="huelle">
      <section className="abschnitt">
        <div className="leerzustand">
          <h1>Diese Seite gibt es nicht</h1>
          <p>Vielleicht ist der Link alt oder es hat sich ein Tippfehler eingeschlichen.</p>
        </div>
        <p className="hinweis">
          Weiter zur <a href="/schulen">Schulsuche</a>, zu den <a href="/ranglisten">Ranglisten</a>{" "}
          oder zur <a href="/">Startseite</a>.
        </p>
      </section>
    </main>
  );
}
