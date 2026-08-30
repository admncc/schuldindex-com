import type { Metadata } from "next";
import { sql } from "@/db/verbindung";
import { PRUEFUNG_HINWEIS, hashe, pruefeToken } from "@/domain/verifizierung";
import { ausloeserNachBestaetigung } from "@/domain/betrugspruefung";
import { wechsle } from "@/domain/bewertungsstatus";
import { zahl } from "@/domain/einstellungen";
import { holeEinstellungen } from "@/db/einstellungen";
import { aktualisiereAggregate } from "@/db/aggregate";
import { einer } from "@/domain/suchparameter";
import { empfehlungslink, teilentext } from "@/domain/empfehlung";
import { empfehlungscodeFuer } from "@/db/empfehlungen";
import { Teilen } from "./teilen";

export const metadata: Metadata = { title: "Bewertung bestätigen" };
export const dynamic = "force-dynamic";

interface Wartend {
  id: string;
  schule_id: string;
  signalpunkte: number | null;
  signale: { art: string }[];
}

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
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const token = einer((await searchParams).token);

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
  // weiterschicken. In einer Transaktion, damit kein Zwischenzustand entsteht,
  // in dem das Token verbraucht, das Konto aber unbestätigt ist.
  //
  // **Nicht pauschal freigeben.** Bei der Abgabe wartet eine erste Bewertung
  // zuerst auf die Bestätigung; ihre Betrugssignale sind gespeichert, aber noch
  // nicht angewandt. Wer hier stumpf auf „freigegeben“ setzte, ließe jede
  // Erstabgabe ungeprüft durch - mit einer frischen E-Mail-Adresse also jede.
  const schwelle = zahl(await holeEinstellungen(), "halteschwelle");

  const bearbeitet = await sql.begin(async (tx) => {
    await tx`update verifizierungstoken set verbraucht_am = now() where id = ${gespeichert!.id}`;
    await tx`update konten set verifiziert_am = coalesce(verifiziert_am, now()) where id = ${gespeichert!.konto_id}`;

    const wartende = await tx<Wartend[]>`
      select id, schule_id, signalpunkte, coalesce(signale, '[]'::jsonb) as signale
      from bewertungen
      where konto_id = ${gespeichert!.konto_id} and status = 'wartet_auf_verifizierung'
      for update
    `;

    let veroeffentlicht = 0;
    for (const b of wartende) {
      const ausloeser = ausloeserNachBestaetigung(b.signalpunkte, b.signale, schwelle);
      const uebergang = wechsle("wartet_auf_verifizierung", ausloeser);
      if (!uebergang.ok) continue;
      if (uebergang.nach === "freigegeben") veroeffentlicht += 1;
      await tx`
        update bewertungen set status = ${uebergang.nach}::bewertungsstatus, aktualisiert_am = now()
        where id = ${b.id}
      `;
    }

    // Ohne diese Zeile bleibt die Bewertung sichtbar freigegeben, das
    // Schulprofil zeigt aber weiter den Stand von vorher. Die Aggregate rechnen
    // ohnehin nur mit freigegebenen Bewertungen.
    await aktualisiereAggregate(wartende.map((z) => z.schule_id), tx);
    return { gesamt: wartende.length, veroeffentlicht };
  });

  // Der eigene Link entsteht erst hier - nicht schon bei der Abgabe: Wer
  // bewertet und nie bestätigt, braucht keinen.
  const code = await empfehlungscodeFuer(gespeichert!.konto_id);
  const basis = process.env["BASIS_URL"] ?? new URL("/", "http://localhost:3000").origin;

  // **Ein Text für beide Ausgänge.** Ob eine Bewertung sofort erscheint oder
  // erst noch angesehen wird, steht hier bewusst nicht: Sonst wäre die Seite
  // eine Rückmeldung darüber, ob die Prüfung angeschlagen hat.
  return (
    <>
      <Rueckmeldung
        titel="Danke - deine Bewertung ist bestätigt"
        text={
          bearbeitet.gesamt > 0
            ? "Sie wird noch geprüft und erscheint danach auf dem Schulprofil. Von jetzt an kannst du weitere Schulen bewerten, ohne dich erneut zu bestätigen."
            : "Dein Konto ist bestätigt. Von jetzt an kannst du Schulen bewerten, ohne dich erneut zu bestätigen."
        }
        gut
      />
      {code !== null ? (
        <section className="abschnitt">
          <Teilen
            link={empfehlungslink(basis, code)}
            text={teilentext("deine Schule", empfehlungslink(basis, code))}
          />
        </section>
      ) : null}
    </>
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
