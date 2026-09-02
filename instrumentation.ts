/**
 * Serverfehler landen im Ereignisprotokoll, nicht nur in der Konsole.
 *
 * `onRequestError` ruft Next bei jedem Fehler auf, der beim Aufbau einer Seite
 * oder in einem Route Handler geworfen wird. Vorher verschwand jeder davon in
 * die Ausgabe des Dienstes - wer nicht in derselben Minute `journalctl` offen
 * hatte, erfuhr nichts. Und genau die Fehler, die selten sind, sind die, die
 * man sucht.
 *
 * Der Import steht **in** der Funktion: Diese Datei wird auch in der
 * Edge-Laufzeit geladen, in der es keine Datenbankverbindung gibt.
 */
export async function onRequestError(
  fehler: unknown,
  anfrage: { path?: string; method?: string; headers?: Record<string, string | undefined> },
  zusammenhang: { routerKind?: string; routePath?: string; renderSource?: string },
): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;

  try {
    const { protokolliere } = await import("./src/db/ereignisse");
    const e = fehler instanceof Error ? fehler : new Error(String(fehler));

    await protokolliere({
      art: "fehler",
      bereich: "anfrage",
      meldung: `${e.name}: ${e.message}`,
      pfad: anfrage.path ?? zusammenhang.routePath ?? null,
      einzelheiten: {
        methode: anfrage.method ?? null,
        route: zusammenhang.routePath ?? null,
        routerart: zusammenhang.routerKind ?? null,
        quelle: zusammenhang.renderSource ?? null,
        // Nur die ersten Zeilen: Ein vollständiger Stapel aus einem
        // Next-Build ist mehrere Kilobyte lang und zu 90 Prozent
        // Rahmenwerkzeug. Was zählt, steht oben.
        stapel: (e.stack ?? "").split("\n").slice(0, 12).join("\n"),
        ursache: e.cause instanceof Error ? `${e.cause.name}: ${e.cause.message}` : null,
      },
    });
  } catch {
    // Ein Protokollschreiber, der beim Protokollieren eines Fehlers selbst
    // wirft, verdoppelt den Schaden. Hier endet die Kette.
  }
}
