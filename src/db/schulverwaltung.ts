/**
 * Der Schulbestand für das Panel: nachsehen, bearbeiten, anlegen.
 *
 * Der Bestand ist die Grundlage von allem anderen - ohne Schule keine
 * Bewertung, kein Profil, kein Kartenpunkt. Bisher war er nur über den Import
 * erreichbar; eine falsch geschriebene Schule ließ sich nicht korrigieren, ohne
 * in die Datenbank zu greifen.
 *
 * Zwei Dinge, die dabei zusammenpassen müssen:
 *
 *  - **Der Suchtext wird mitgeschrieben.** Er ist eine eigene Spalte, aus Name,
 *    Ort, Postleitzahl und Schulart zusammengesetzt (`import/normalisiere.ts`).
 *    Wer den Namen ändert und den Suchtext stehen lässt, macht eine Schule
 *    unauffindbar, ohne dass es jemandem auffällt.
 *  - **Handarbeit wird markiert.** `manuell_gepflegt` sorgt dafür, dass der
 *    nächste Import die Korrektur nicht überschreibt (Migration 0019).
 */

import { randomUUID } from "node:crypto";
import { sql } from "./verbindung";
import { baueSuchtext } from "../import/normalisiere";
import { slugify, kuerze } from "../import/slug";
import type { Bundesland } from "../domain/bundesland";
import type { Schulart } from "../import/schulart";
import type { Gepruefte } from "../domain/schulpflege";

export interface Importlage {
  readonly gesamt: number;
  readonly aktiv: number;
  readonly stillgelegt: number;
  readonly mitKoordinate: number;
  readonly ohneKoordinate: number;
  readonly manuell: number;
  readonly bewertet: number;
  /** Stand der Quelle, ältester und jüngster Datensatz. */
  readonly quelleAeltester: Date | null;
  readonly quelleJuengster: Date | null;
  /** Wann zuletzt eine Zeile geschrieben wurde - der letzte Importlauf. */
  readonly zuletztGeschrieben: Date | null;
  readonly jeBundesland: readonly { bundesland: Bundesland; anzahl: number }[];
}

export async function importlage(): Promise<Importlage> {
  const [zahlen] = await sql<
    {
      gesamt: number;
      aktiv: number;
      mit: number;
      manuell: number;
      aeltester: Date | null;
      juengster: Date | null;
      geschrieben: Date | null;
    }[]
  >`
    select count(*)::int as gesamt,
           count(*) filter (where ist_aktiv)::int as aktiv,
           count(*) filter (where lat is not null)::int as mit,
           count(*) filter (where manuell_gepflegt)::int as manuell,
           min(quelle_stand) as aeltester,
           max(quelle_stand) as juengster,
           max(aktualisiert_am) as geschrieben
    from schulen
  `;

  const [bewertet] = await sql<{ n: number }[]>`
    select count(*)::int as n from schul_aggregate where anzahl > 0
  `;

  const jeBundesland = await sql<{ bundesland: Bundesland; anzahl: number }[]>`
    select bundesland, count(*)::int as anzahl
    from schulen where ist_aktiv
    group by bundesland order by count(*) desc
  `;

  const gesamt = zahlen?.gesamt ?? 0;
  return {
    gesamt,
    aktiv: zahlen?.aktiv ?? 0,
    stillgelegt: gesamt - (zahlen?.aktiv ?? 0),
    mitKoordinate: zahlen?.mit ?? 0,
    ohneKoordinate: gesamt - (zahlen?.mit ?? 0),
    manuell: zahlen?.manuell ?? 0,
    bewertet: bewertet?.n ?? 0,
    quelleAeltester: zahlen?.aeltester ?? null,
    quelleJuengster: zahlen?.juengster ?? null,
    zuletztGeschrieben: zahlen?.geschrieben ?? null,
    jeBundesland,
  };
}

export interface Schulzeile {
  id: string;
  slug: string;
  name: string;
  ort: string | null;
  plz: string | null;
  bundesland: Bundesland;
  schularten: Schulart[];
  ist_aktiv: boolean;
  manuell_gepflegt: boolean;
  hat_koordinate: boolean;
  bewertungen: number;
}

export interface Listenfilter {
  readonly suche?: string | undefined;
  readonly bundesland?: Bundesland | undefined;
  readonly nur?: "alle" | "manuell" | "ohne_koordinate" | "stillgelegt" | "bewertet" | undefined;
  readonly seite?: number | undefined;
}

export const SEITENGROESSE = 50;

export async function listeSchulen(
  f: Listenfilter = {},
): Promise<{ zeilen: Schulzeile[]; gesamt: number }> {
  const seite = Math.max(1, f.seite ?? 1);
  const suche = f.suche?.trim().toLowerCase() ?? "";

  // Dieselbe Bedingung für Zählung und Ausschnitt: Zwei Formulierungen liefen
  // beim ersten Entwurf auseinander, und die Seitenzahl stimmte nicht.
  const bedingung = sql`
    where true
      ${suche.length >= 2 ? sql`and s.suchtext like ${"%" + suche + "%"}` : sql``}
      ${f.bundesland ? sql`and s.bundesland = ${f.bundesland}::bundesland` : sql``}
      ${f.nur === "manuell" ? sql`and s.manuell_gepflegt` : sql``}
      ${f.nur === "ohne_koordinate" ? sql`and s.lat is null` : sql``}
      ${f.nur === "stillgelegt" ? sql`and not s.ist_aktiv` : sql``}
      ${f.nur === "bewertet" ? sql`and coalesce(a.anzahl, 0) > 0` : sql``}
  `;

  const [zahl] = await sql<{ n: number }[]>`
    select count(*)::int as n
    from schulen s left join schul_aggregate a on a.schule_id = s.id
    ${bedingung}
  `;

  const zeilen = await sql<Schulzeile[]>`
    select s.id, s.slug, s.name, s.ort, s.plz, s.bundesland, s.schularten,
           s.ist_aktiv, s.manuell_gepflegt,
           s.lat is not null as hat_koordinate,
           coalesce(a.anzahl, 0) as bewertungen
    from schulen s left join schul_aggregate a on a.schule_id = s.id
    ${bedingung}
    order by coalesce(a.anzahl, 0) desc, s.name
    limit ${SEITENGROESSE} offset ${(seite - 1) * SEITENGROESSE}
  `;

  return { zeilen, gesamt: zahl?.n ?? 0 };
}

export interface Schuldatensatz extends Schulzeile {
  quell_id: string;
  schulart_original: string | null;
  strasse: string | null;
  traeger: string | null;
  website: string | null;
  telefon: string | null;
  email: string | null;
  lat: number | null;
  lon: number | null;
  quelle_stand: Date | null;
  aktualisiert_am: Date;
}

export async function holeSchuldatensatz(id: string): Promise<Schuldatensatz | null> {
  const [zeile] = await sql<Schuldatensatz[]>`
    select s.id, s.slug, s.name, s.ort, s.plz, s.bundesland, s.schularten, s.ist_aktiv,
           s.manuell_gepflegt, s.lat is not null as hat_koordinate,
           coalesce(a.anzahl, 0) as bewertungen,
           s.quell_id, s.schulart_original, s.strasse, s.traeger, s.website, s.telefon, s.email,
           s.lat, s.lon, s.quelle_stand, s.aktualisiert_am
    from schulen s left join schul_aggregate a on a.schule_id = s.id
    where s.id = ${id}
  `;
  return zeile ?? null;
}

/**
 * Ein freier Slug.
 *
 * Der Slug steht in jedem geteilten Link. Beim Anlegen wird er aus dem Namen
 * gebildet; beim Bearbeiten bleibt er, **auch wenn sich der Name ändert** -
 * sonst führen alle bestehenden Verweise ins Leere.
 */
async function freierSlug(name: string, ort: string | null): Promise<string> {
  const grund = kuerze(slugify([name, ort].filter(Boolean).join(" ")), 80) || "schule";
  for (let versuch = 0; versuch < 50; versuch++) {
    const kandidat = versuch === 0 ? grund : `${grund}-${versuch + 1}`;
    const [belegt] = await sql<{ n: number }[]>`
      select count(*)::int as n from schulen where slug = ${kandidat}
    `;
    if ((belegt?.n ?? 0) === 0) return kandidat;
  }
  return `${grund}-${randomUUID().slice(0, 8)}`;
}

function suchtextAus(g: Gepruefte): string {
  return baueSuchtext([g.name, g.ort, g.plz, g.schulartOriginal]);
}

export async function speichereSchule(
  id: string,
  g: Gepruefte,
  moderatorId: string,
  beschreibung: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      update schulen set
        name = ${g.name},
        bundesland = ${g.bundesland}::bundesland,
        schularten = ${g.schularten}::schulart[],
        schulart_original = ${g.schulartOriginal},
        strasse = ${g.strasse}, plz = ${g.plz}, ort = ${g.ort},
        traeger = ${g.traeger}, website = ${g.website},
        telefon = ${g.telefon}, email = ${g.email},
        lat = ${g.lat}, lon = ${g.lon},
        ist_aktiv = ${g.istAktiv},
        suchtext = ${suchtextAus(g)},
        -- Ab jetzt ist diese Zeile Handarbeit und wird vom Import in Ruhe
        -- gelassen.
        manuell_gepflegt = true,
        aktualisiert_am = now()
      where id = ${id}
    `;
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('schule_geaendert', ${moderatorId}, '', ${beschreibung})
    `;
  });
}

export async function legeSchuleAn(
  g: Gepruefte,
  moderatorId: string,
): Promise<{ id: string; slug: string }> {
  const slug = await freierSlug(g.name, g.ort);
  // `manuell:` kommt in keiner Lieferung vor - die Zeile wird also von keinem
  // Import je getroffen, auch nicht versehentlich.
  const quellId = `manuell:${randomUUID()}`;

  return sql.begin(async (tx) => {
    const [zeile] = await tx<{ id: string }[]>`
      insert into schulen (
        quell_id, slug, name, bundesland, schularten, schulart_original,
        strasse, plz, ort, traeger, website, telefon, email, lat, lon,
        suchtext, ist_aktiv, manuell_gepflegt
      ) values (
        ${quellId}, ${slug}, ${g.name}, ${g.bundesland}::bundesland,
        ${g.schularten}::schulart[], ${g.schulartOriginal},
        ${g.strasse}, ${g.plz}, ${g.ort}, ${g.traeger}, ${g.website},
        ${g.telefon}, ${g.email}, ${g.lat}, ${g.lon},
        ${suchtextAus(g)}, ${g.istAktiv}, true
      )
      returning id
    `;
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('schule_geaendert', ${moderatorId}, '', ${`Schule angelegt: ${g.name} (${slug})`})
    `;
    return { id: zeile!.id, slug };
  });
}

/** Die letzten Eingriffe in den Bestand - für die Übersicht im Panel. */
export async function letzteAenderungen(grenze = 8): Promise<
  { erstellt_am: Date; begruendung: string | null; moderator: string | null }[]
> {
  return sql<{ erstellt_am: Date; begruendung: string | null; moderator: string | null }[]>`
    select p.erstellt_am, p.begruendung, m.name as moderator
    from moderationsprotokoll p
    left join moderatoren m on m.id = p.moderator_id
    where p.aktion = 'schule_geaendert'
    order by p.erstellt_am desc
    limit ${grenze}
  `;
}
