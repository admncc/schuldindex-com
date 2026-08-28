import { getRequestConfig } from "next-intl/server";
import nachrichten from "../messages/de.json";

/** Eine Sprache, fest verdrahtet - der Umschalter kommt erst mit Phase 7. */
export const LOCALE = "de-DE" as const;

export default getRequestConfig(async () => ({
  locale: LOCALE,
  messages: nachrichten,
  timeZone: "Europe/Berlin",
  formats: {
    number: {
      score: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
    },
    dateTime: {
      kurz: { day: "2-digit", month: "2-digit", year: "numeric" },
      monatJahr: { month: "long", year: "numeric" },
    },
  },
}));
