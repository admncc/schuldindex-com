-- Diagnosezugang und Ereignisprotokoll.
--
-- Zwei Dinge, die zusammengehören: eine Schnittstelle, über die sich der
-- Zustand des Systems von außen ablesen lässt, und ein Protokoll, das genug
-- festhält, damit es dabei etwas zu lesen gibt. Bisher verschwand jeder
-- Serverfehler in die Konsole des Dienstes; wer nicht in derselben Minute
-- `journalctl` offen hatte, erfuhr nichts davon.
--
-- Der Zugang ist ausdrücklich befristet und wird bei jeder Freischaltung neu
-- erzeugt. Eine Hintertür, die dauerhaft offensteht, ist keine Diagnose
-- mehr, sondern ein zweiter Weg ins System - und dieses System verwahrt die
-- Angaben Minderjähriger unter der Zusage, dass sie anonym bleiben.
--
-- Das Protokoll wird nach 72 Stunden gelöscht. Das ist die einzige Stelle im
-- Portal, an der etwas ohne Klick verschwindet, und der Unterschied zur Regel
-- „keine automatische Löschung“ ist wesentlich: Dort geht es um die Angaben
-- der Menschen, hier um Betriebsspuren über sie.

create type ereignisart as enum ('fehler', 'warnung', 'info', 'zugriff');

create table ereignisse (
  id           bigserial primary key,
  art          ereignisart not null,
  -- Grobe Einordnung: 'abgabe', 'versand', 'verlosung', 'moderation',
  -- 'diagnose', 'anfrage'. Bewusst freier Text und kein Enum - ein neuer
  -- Bereich soll keine Migration kosten.
  bereich      text not null,
  meldung      text not null,
  -- Alles Weitere. Wird vor dem Schreiben von Kontakten, Token und Freitexten
  -- befreit (`src/domain/diagnose.ts`).
  einzelheiten jsonb not null default '{}',
  pfad         text,
  status       int,
  dauer_ms     int,
  erstellt_am  timestamptz not null default now()
);

create index ereignisse_zeit    on ereignisse (erstellt_am desc);
create index ereignisse_art     on ereignisse (art, erstellt_am desc);
create index ereignisse_bereich on ereignisse (bereich, erstellt_am desc);

comment on table ereignisse is
  'Betriebsprotokoll fuer die Diagnose. Wird nach 72 Stunden geloescht. Enthaelt keine Kontaktdaten und keine Freitexte aus Bewertungen.';

create table diagnosezugang (
  id                 uuid primary key default gen_random_uuid(),
  -- Nur der Hash, wie bei den Bestaetigungstoken und den Moderationssitzungen:
  -- wer die Datenbank liest, soll den Zugang nicht mitbenutzen koennen.
  token_hash         text not null unique,
  erstellt_von       uuid references moderatoren(id) on delete set null,
  erstellt_am        timestamptz not null default now(),
  gueltig_bis        timestamptz not null,
  beendet_am         timestamptz,
  letzter_zugriff_am timestamptz,
  zugriffe           int not null default 0
);

-- Der offene Zugang wird oft gesucht und ist hoechstens einer: Jede
-- Freischaltung beendet den vorigen in derselben Transaktion
-- (`src/db/diagnosezugang.ts`). Als Datenbankbedingung ginge das nur ueber
-- einen Index auf einen konstanten Ausdruck - eine Spitzfindigkeit, die eine
-- Migration auf dem Produktivsystem scheitern lassen kann. Die Regel steht
-- deshalb im Code, mit `for update` gegen zwei gleichzeitige Klicks.
create index diagnosezugang_offen on diagnosezugang (erstellt_am desc)
  where beendet_am is null;

alter type protokollaktion add value if not exists 'diagnose_freigeschaltet';
alter type protokollaktion add value if not exists 'diagnose_beendet';
