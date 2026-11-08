import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Prüfkonfiguration.
 *
 * Bis hierher brauchte es keine: Alle Prüfungen lagen in `src/domain` und
 * importierten einander relativ. Mit der ersten Prüfung an einem Bauteil aus
 * `app/` kommen zwei Dinge dazu, die Next sonst mitbringt und Vitest nicht:
 *
 *  - **`@/…`**, derselbe Alias wie in `tsconfig.json`. Ohne ihn müsste jede
 *    geprüfte Datei andere Importe schreiben als die ungeprüften - und dann
 *    prüft man nicht mehr dasselbe, was ausgeliefert wird.
 *  - **JSX ohne `import React`.** `tsconfig.json` steht auf `preserve`, weil
 *    Next die Umsetzung selbst macht; esbuild braucht die Angabe hier.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  esbuild: { jsx: "automatic" },
});
