-- Zugangsschlüssel, die im Panel hinterlegt werden.
--
-- Bisher stand der Claude-Schlüssel nur in der Umgebung des Servers. Das
-- verlangt Serverzugang für jede Änderung; läuft der Schlüssel ab, steht die
-- Redaktion vor einem Panel, das die Zusammenfassungen nicht mehr erzeugt, und
-- kann nichts dagegen tun.
--
-- Gespeichert wird **nur verschlüsselt** (AES-256-GCM, Schlüssel abgeleitet aus
-- KONTAKT_CHIFFRE_SCHLUESSEL mit eigener Zweckkennung, siehe
-- src/domain/geheimnis.ts). Wer einen Datenbankabzug hat, hat damit noch keinen
-- API-Schlüssel.
--
-- Die Umgebungsvariable geht weiterhin vor: Was im Betrieb gesetzt wurde, soll
-- sich nicht aus einer Oberfläche heraus überschreiben lassen.

create table geheimnisse (
  name           text primary key,
  chiffre        bytea not null,
  -- Die letzten Zeichen im Klartext, damit sich im Panel erkennen lässt, welcher
  -- Schlüssel hinterlegt ist, ohne ihn zu entschlüsseln.
  hinweis        text not null,
  gesetzt_am     timestamptz not null default now(),
  gesetzt_von    uuid references moderatoren(id) on delete set null
);

comment on table geheimnisse is
  'Im Panel hinterlegte Zugangsschluessel, verschluesselt. Niemals im Klartext ausgeben.';
