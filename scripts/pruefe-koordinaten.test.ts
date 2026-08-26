/**
 * Prüft die geokodierten Koordinaten gegen die Datenbank.
 *
 *   DATABASE_URL=postgres://… npx vitest run scripts/pruefe-koordinaten.test.ts
 *
 * Der Kerngedanke: **die Quelle prüft sich selbst.** Für die meisten Postleitzahlen
 * kennen wir bereits Koordinaten aus der Quelle. Eine nachgeocodierte Schule muss
 * in deren Nähe liegen — tut sie das nicht, hat der Geocoder danebengegriffen.
 * Das findet Fehler, die keine Bereichsprüfung findet: die richtige Straße in der
 * falschen Stadt desselben Bundeslandes.
 */
import { describe, expect, it } from "vitest";
import postgres from "postgres";

const URL = process.env.DATABASE_URL ?? "";
const vorhanden = URL !== "";

describe.skipIf(!vorhanden)("Geokodierte Koordinaten", () => {
  const verbinde = () => postgres(URL, { onnotice: () => {} });

  it("liegt nah an bekannten Schulen derselben Postleitzahl", async () => {
    const sql = verbinde();
    try {
      const [zeile] = await sql<{ geprueft: number; weit_weg: number; max_km: number }[]>`
        with nachgeocodiert as (
          select id, plz, lat, lon from schulen
          where genauigkeit in ('adresse','plz','ort') and plz is not null and lat is not null
        ),
        bekannt as (
          select plz, avg(lat) as lat, avg(lon) as lon, count(*) as n
          from schulen where genauigkeit = 'quelle' and plz is not null
          group by plz having count(*) >= 2
        )
        select count(*)::int as geprueft,
               count(*) filter (
                 where earth_distance(ll_to_earth(n.lat, n.lon), ll_to_earth(b.lat, b.lon)) > 25000
               )::int as weit_weg,
               coalesce(round(max(earth_distance(ll_to_earth(n.lat,n.lon), ll_to_earth(b.lat,b.lon)))::numeric/1000, 1), 0)::float as max_km
        from nachgeocodiert n join bekannt b using (plz)
      `;
      if (!zeile || zeile.geprueft === 0) return; // noch nichts geokodiert

      const anteil = zeile.weit_weg / zeile.geprueft;
      console.log(
        `\n  geprüft ${zeile.geprueft} · über 25 km entfernt ${zeile.weit_weg} ` +
          `(${(anteil * 100).toFixed(2)} %) · größte Abweichung ${zeile.max_km} km`,
      );
      // Eine Postleitzahl umfasst selten mehr als 25 km. Einzelne Ausreißer sind
      // bei Flächen-PLZ auf dem Land erklärbar, ein größerer Anteil nicht.
      expect(anteil).toBeLessThan(0.02);
    } finally {
      await sql.end();
    }
  });

  it("hält jede Koordinate im Umriss ihres Bundeslandes", async () => {
    const sql = verbinde();
    try {
      const [zeile] = await sql<{ n: number }[]>`
        select count(*)::int as n from schulen
        where lat is not null
          and not (
            case bundesland
              when 'SH' then lat between 53.2 and 55.2 and lon between 7.7 and 11.5
              when 'HH' then lat between 53.2 and 54.1 and lon between 8.3 and 10.5
              when 'NI' then lat between 51.1 and 54.0 and lon between 6.2 and 11.8
              when 'HB' then lat between 52.9 and 53.8 and lon between 8.3 and 9.2
              when 'NW' then lat between 50.2 and 52.7 and lon between 5.7 and 9.6
              when 'HE' then lat between 49.2 and 51.8 and lon between 7.6 and 10.4
              when 'RP' then lat between 48.8 and 51.1 and lon between 6.0 and 8.7
              when 'BW' then lat between 47.4 and 49.9 and lon between 7.4 and 10.7
              when 'BY' then lat between 47.1 and 50.7 and lon between 8.8 and 14.0
              when 'SL' then lat between 49.0 and 49.8 and lon between 6.2 and 7.6
              when 'BE' then lat between 52.2 and 52.8 and lon between 12.9 and 13.9
              when 'BB' then lat between 51.2 and 53.7 and lon between 11.1 and 14.9
              when 'MV' then lat between 53.0 and 54.8 and lon between 10.4 and 14.6
              when 'SN' then lat between 50.0 and 51.8 and lon between 11.7 and 15.2
              when 'ST' then lat between 50.8 and 53.2 and lon between 10.4 and 13.3
              when 'TH' then lat between 50.1 and 51.8 and lon between 9.7 and 12.8
            end
          )
      `;
      console.log(`  außerhalb des eigenen Bundeslandes: ${zeile?.n ?? 0}`);
      expect(zeile?.n ?? 0).toBe(0);
    } finally {
      await sql.end();
    }
  });

  it("hält die Zusicherungen des Schemas ein", async () => {
    const sql = verbinde();
    try {
      const [zeile] = await sql<{ halb: number; ohne_genauigkeit: number }[]>`
        select
          count(*) filter (where (lat is null) <> (lon is null))::int as halb,
          count(*) filter (where (lat is null) <> (genauigkeit is null))::int as ohne_genauigkeit
        from schulen
      `;
      expect(zeile?.halb).toBe(0);
      expect(zeile?.ohne_genauigkeit).toBe(0);
    } finally {
      await sql.end();
    }
  });
});

describe.skipIf(!vorhanden)("Entfernungsrechnung", () => {
  it("stimmt mit der Datenbank überein", async () => {
    // Zwei Wege rechnen dieselbe Entfernung: Haversine in TypeScript bei der
    // Abgabe einer Bewertung (beide Punkte liegen ohnehin vor, ein
    // Datenbankbesuch wäre reine Latenz) und earth_distance in Postgres bei
    // der Umkreissuche. Laufen sie auseinander, prüft die Anwendung anders als
    // die Datenbank — dieser Test hält beide zusammen.
    const { entfernungKm } = await import("../src/domain/geopruefung");
    const sql = postgres(URL, { onnotice: () => {} });
    try {
      const paare = await sql<{ alat: number; alon: number; blat: number; blon: number }[]>`
        select a.lat as alat, a.lon as alon, b.lat as blat, b.lon as blon
        from schulen a, schulen b
        where a.lat is not null and b.lat is not null and a.id < b.id
        limit 200
      `;
      let groesserFehler = 0;
      for (const p of paare) {
        const [zeile] = await sql<{ km: number }[]>`
          select earth_distance(ll_to_earth(${p.alat}, ${p.alon}),
                                ll_to_earth(${p.blat}, ${p.blon})) / 1000 as km
        `;
        const eigen = entfernungKm({ lat: p.alat, lon: p.alon }, { lat: p.blat, lon: p.blon });
        const abweichung = Math.abs(eigen - (zeile?.km ?? 0));
        groesserFehler = Math.max(groesserFehler, abweichung);
      }
      console.log(`  größte Abweichung über ${paare.length} Paare: ${(groesserFehler * 1000).toFixed(0)} m`);
      // Beide Wege nutzen denselben Erdradius; übrig bleibt nur
      // Gleitkomma-Rauschen. Alles über einem Meter wäre ein echter Fehler.
      expect(groesserFehler).toBeLessThan(0.001);
    } finally {
      await sql.end();
    }
  });
});
