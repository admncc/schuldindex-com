/**
 * Datenbankverbindung für die Anwendung.
 *
 * Eine einzige Verbindungsgruppe je Prozess. In der Entwicklung überlebt sie
 * das Neuladen der Module, sonst öffnet jeder Speichervorgang neue Verbindungen,
 * bis die Datenbank keine mehr annimmt.
 */
import postgres from "postgres";

const global_ = globalThis as unknown as { __sql?: postgres.Sql };

export const sql: postgres.Sql =
  global_.__sql ??
  postgres(process.env["DATABASE_URL"] ?? "", {
    max: 10,
    idle_timeout: 20,
    onnotice: () => {},
  });

if (process.env["NODE_ENV"] !== "production") global_.__sql = sql;
