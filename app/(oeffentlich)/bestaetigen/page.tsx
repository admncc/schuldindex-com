import type { Metadata } from "next";
import { sql } from "@/db/verbindung";
import { PRUEFUNG_HINWEIS, hashe, pruefeToken } from "@/domain/verifizierung";
import { aktualisiereAggregate } from "@/db/aggregate";

export const metadata: Metadata = { title: "Bewertung bestätigen" };
export const dynamic = "force-dynamic";

interface Gespeichert {
  id: string;
  konto_id: string;
  token_hash: string;
  gueltig_bis: Date;
  verbraucht_am: Date | null;
}

export default async function Bestaetigungsseite({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Rueckmeldung
        titel="Kein Bestätigungslink"
        text="Bitte öffne den Link aus der Nachricht, die wir dir geschickt haben."
      />
    );
  }

  const [gespeichert] = await sql<Gespeichert[]>`
    select id, konto_id, token_hash, gueltig_bis, verbraucht_am
    from verifizierungstoken where token_hash = ${hashe(token)}
  `;

  const ergebnis = pruefeToken(
    token,
    gespeichert
      ? {
          hash: gespeichert.token_hash,
          gueltigBis: gespeichert.gueltig_bis,
          verbrauchtAm: gespeichert.verbraucht_am,
        }
      : null,
  );

  if (!ergebnis.ok) {
    return <Rueckmeldung titel="Link nicht mehr gültig" text={PRUEFUNG_HINWEIS[ergebnis.grund]} />;
  }

  // Bestätigen: Token verbrauchen, Konto verifizieren, wartende Bewertungen
  // freigeben. In einer Transaktion, damit kein Zwischenzustand entsteht, in dem
  // das Token verbraucht, das Konto aber unbestätigt ist.
  const freigegeben = await sql.begin(async (tx) => {
    await tx`update verifizierungstoken set verbraucht_am = now() where id = ${gespeichert!.id}`;
    await tx`update konten set verifiziert_am = coalesce(verifiziert_am, now()) where id = ${gespeichert!.konto_id}`;
    const zeilen = await tx<{ schule_id: string }[]>`
      update bewertungen set status = 'freigegeben', aktualisiert_am = now()
      where konto_id = ${gespeichert!.konto_id} and status = 'wartet_auf_verifizierung'
      returning schule_id
    `;
    // Ohne diese Zeile bleibt die Bewertung sichtbar freigegeben, das
    // Schulprofil zeigt aber weiter den Stand von vorher.
    await aktualisiereAggregate(zeilen.map((z) => z.schule_id), tx);
    return zeilen.length;
  });

  return (
    <Rueckmeldung
      titel="Danke - deine Bewertung ist bestätigt"
      text={
        freigegeben > 0
          ? "Sie erscheint in Kürze auf dem Schulprofil. Von jetzt an kannst du weitere Schulen bewerten, ohne dich erneut zu bestätigen."
          : "Dein Konto ist bestätigt. Von jetzt an kannst du Schulen bewerten, ohne dich erneut zu bestätigen."
      }
      gut
    />
  );
}

function Rueckmeldung({ titel, text, gut = false }: { titel: string; text: string; gut?: boolean }) {
  return (
    <section className="abschnitt">
      <div className="leerzustand">
        <h1>{titel}</h1>
        <p>{text}</p>
        <a className={gut ? "knopf" : "knopf zweitrangig"} href="/">Zur Startseite</a>
      </div>
    </section>
  );
}
