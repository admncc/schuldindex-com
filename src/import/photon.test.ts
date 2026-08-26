import { describe, expect, it, vi } from "vitest";
import { PhotonGeocoder, mitZwischenspeicher } from "./photon.js";
import type { Geocoder } from "./geokodierung.js";

/** Antwort im Format von Photon. GeoJSON führt [Länge, Breite]. */
function antwort(lon: number | null, lat?: number, postcode?: string) {
  const body =
    lon === null
      ? { features: [] }
      : { features: [{ geometry: { coordinates: [lon, lat] }, properties: { postcode } }] };
  return new Response(JSON.stringify(body), { status: 200 });
}

function geocoder(holen: typeof fetch, extra = {}) {
  return new PhotonGeocoder({
    holen,
    warten: async () => {}, // Takt im Test überspringen
    ...extra,
  });
}

describe("Photon-Anbindung", () => {
  it("liest die Koordinate in der richtigen Reihenfolge aus", async () => {
    // Der klassische Fehler: GeoJSON liefert [Länge, Breite], nicht [Breite, Länge].
    // Verwechselt man sie, landet jede deutsche Schule im Südsudan.
    const holen = vi.fn(async () => antwort(8.6157, 53.7836));
    const treffer = await geocoder(holen as unknown as typeof fetch).suche("Nordweg 75");
    expect(treffer).toMatchObject({ lat: 53.7836, lon: 8.6157 });
  });

  it("liefert null, wenn nichts gefunden wurde", async () => {
    const holen = vi.fn(async () => antwort(null));
    expect(await geocoder(holen as unknown as typeof fetch).suche("Unfug")).toBeNull();
  });

  it("fragt auf Deutsch und mit Gewichtung auf die Mitte Deutschlands", async () => {
    const holen = vi.fn(async () => antwort(8.6, 53.7));
    await geocoder(holen as unknown as typeof fetch).suche("Testschule");
    const url = new URL((holen.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("lang")).toBe("de");
    expect(url.searchParams.get("q")).toBe("Testschule");
    expect(Number(url.searchParams.get("lat"))).toBeCloseTo(51.16, 1);
  });

  it("versucht es bei Überlastung erneut", async () => {
    let aufrufe = 0;
    const holen = vi.fn(async () => {
      aufrufe++;
      return aufrufe === 1 ? new Response("", { status: 429 }) : antwort(8.6, 53.7);
    });
    const g = geocoder(holen as unknown as typeof fetch);
    expect(await g.suche("Testschule")).toMatchObject({ lat: 53.7, lon: 8.6 });
    expect(aufrufe).toBe(2);
  });

  it("gibt nach den festgelegten Versuchen auf, statt endlos zu wiederholen", async () => {
    const holen = vi.fn(async () => new Response("", { status: 503 }));
    const g = geocoder(holen as unknown as typeof fetch, { versuche: 3 });
    expect(await g.suche("Testschule")).toBeNull();
    expect(holen).toHaveBeenCalledTimes(3);
    expect(g.fehler).toBe(1);
  });

  it("übersteht einen Netzabbruch", async () => {
    let aufrufe = 0;
    const holen = vi.fn(async () => {
      if (++aufrufe === 1) throw new Error("Verbindung abgebrochen");
      return antwort(8.6, 53.7);
    });
    expect(await geocoder(holen as unknown as typeof fetch).suche("Testschule")).not.toBeNull();
  });

  it("zählt Anfragen, Treffer und Fehler für den Bericht", async () => {
    const holen = vi.fn(async () => antwort(8.6, 53.7));
    const g = geocoder(holen as unknown as typeof fetch);
    await g.suche("a");
    await g.suche("b");
    expect(g.anfragen).toBe(2);
    expect(g.treffer).toBe(2);
    expect(g.fehler).toBe(0);
  });

  it("hält den Mindestabstand zwischen Anfragen ein", async () => {
    const gewartet: number[] = [];
    const holen = vi.fn(async () => antwort(8.6, 53.7));
    const g = new PhotonGeocoder({
      holen: holen as unknown as typeof fetch,
      proSekunde: 2,
      warten: async (ms) => {
        gewartet.push(ms);
      },
    });
    await g.suche("a");
    await g.suche("b");
    await g.suche("c");
    // Die erste Anfrage geht sofort, danach wird getaktet.
    expect(gewartet.filter((ms) => ms > 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe("Zwischenspeicher", () => {
  it("fragt dieselbe Anfrage nur einmal", async () => {
    const innen: Geocoder = { name: "Test", suche: vi.fn(async () => ({ lat: 53.7, lon: 8.6 })) };
    const speicher = new Map();
    const aussen = mitZwischenspeicher(innen, speicher);

    await aussen.suche("Nordweg 75");
    await aussen.suche("Nordweg 75");
    expect(innen.suche).toHaveBeenCalledTimes(1);
  });

  it("merkt sich auch, dass nichts gefunden wurde", async () => {
    // Sonst fragt ein Wiederholungslauf genau die aussichtslosen Adressen erneut.
    const innen: Geocoder = { name: "Test", suche: vi.fn(async () => null) };
    const aussen = mitZwischenspeicher(innen, new Map());
    await aussen.suche("Unfug");
    await aussen.suche("Unfug");
    expect(innen.suche).toHaveBeenCalledTimes(1);
  });
});

describe("Postleitzahl", () => {
  it("reicht die Postleitzahl des Treffers weiter", async () => {
    // Sie ist die einzige Handhabe gegen den Fehlgriff „richtige Straße,
    // falscher Ort“ — dafür muss sie erst einmal ankommen.
    const holen = vi.fn(async () => antwort(8.8941, 54.8023, "25899"));
    const treffer = await geocoder(holen as unknown as typeof fetch).suche("Schulstraße 5");
    expect(treffer?.plz).toBe("25899");
  });

  it("kommt ohne Postleitzahl im Treffer zurecht", async () => {
    const holen = vi.fn(async () => antwort(8.6, 53.7));
    expect((await geocoder(holen as unknown as typeof fetch).suche("x"))?.plz).toBeNull();
  });
});