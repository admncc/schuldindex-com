import { useTranslations } from "next-intl";
import { scorestufe } from "@/domain/scoring";

const ZAHL = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Wertung als Zahl mit Skala - „8,4 von 10“. */
export function Wertungszahl({ wert, gross = false }: { wert: number; gross?: boolean }) {
  return (
    <span className={gross ? "wertung gross" : "wertung"}>
      <span className="zahl">{ZAHL.format(wert)}</span>
      <span className="skala">von 10</span>
    </span>
  );
}

/** Farbstufe der Gesamtwertung. Nicht zu verwechseln mit der Aggressionsampel. */
export function Wertungsplakette({ wert }: { wert: number }) {
  const t = useTranslations("score");
  const stufe = scorestufe(wert);
  return <span className={`plakette ${stufe}`}>{t(stufe)}</span>;
}
