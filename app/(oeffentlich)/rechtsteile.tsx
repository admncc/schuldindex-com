import { FELDNAME, type Betreiberangaben } from "@/recht/betreiber";

/**
 * Fehlende Pflichtangabe - sichtbar, nicht stillschweigend.
 *
 * Eine Impressumsseite, die eine fehlende Angabe einfach ausblendet, sieht
 * vollständig aus und ist es nicht. Genau daran hängt die Abmahnung.
 */
export function Fehlt({ feld }: { feld: keyof Betreiberangaben }) {
  return <mark className="fehlt">{FELDNAME[feld]} fehlt - bitte eintragen</mark>;
}

export function Angabe({
  angaben,
  feld,
}: {
  angaben: Betreiberangaben;
  feld: keyof Betreiberangaben;
}) {
  const wert = angaben[feld];
  return wert === null ? <Fehlt feld={feld} /> : <>{wert}</>;
}
