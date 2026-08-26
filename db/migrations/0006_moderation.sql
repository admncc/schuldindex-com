-- Moderationszugang und Protokoll.
--
-- Setzt Abschnitt 8 des Entwicklungsplans um: Zugang nur mit Kennwort und
-- zweitem Faktor, jede Entscheidung mit Person, Zeitpunkt und Begründung
-- protokolliert.
--
-- Was hier bewusst NICHT steht: die IP-Adresse der moderierenden Person und die
-- der bewertenden. Für die eine gibt es keinen Zweck, der die Speicherung
-- trüge; die andere existiert im ganzen System nicht (Entscheidung E3).

create type moderatorrolle as enum ('moderation', 'leitung');

create table moderatoren (
  id                     uuid primary key default gen_random_uuid(),
  kennung                text not null,
  name                   text not null,

  passwort_abdruck       text not null,

  -- Base32, wie die Authenticator-Apps es erwarten. Bleibt bis zur Einrichtung
  -- leer; ohne eingerichteten zweiten Faktor kommt niemand in die Oberfläche.
  totp_geheimnis         text,
  -- Zuletzt eingelöster Zeitschritt. Ohne diese Spalte ließe sich ein
  -- mitgelesener Code innerhalb seiner dreißig Sekunden ein zweites Mal nutzen.
  totp_letzter_schritt   bigint,

  rolle                  moderatorrolle not null default 'moderation',
  aktiv                  boolean not null default true,

  fehlversuche           int not null default 0,
  letzter_fehlversuch_am timestamptz,
  letzte_anmeldung_am    timestamptz,
  erstellt_am            timestamptz not null default now()
);

-- Kennungen unterscheiden sich nicht durch Groß- und Kleinschreibung: sonst
-- gäbe es „Anna“ und „anna“ als zwei Konten, und die Sperre nach Fehlversuchen
-- griffe nur für eines davon.
create unique index moderatoren_kennung on moderatoren (lower(kennung));

create table moderator_sitzungen (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references moderatoren(id) on delete cascade,
  -- Nur der Hash, wie bei den Bestätigungstoken: wer die Datenbank liest, soll
  -- sich nicht in eine laufende Sitzung setzen können.
  token_hash   text not null unique,
  gueltig_bis  timestamptz not null,
  beendet_am   timestamptz,
  erstellt_am  timestamptz not null default now()
);

create index sitzungen_moderator on moderator_sitzungen (moderator_id);
create index sitzungen_aufraeumen on moderator_sitzungen (gueltig_bis) where beendet_am is null;

create type protokollaktion as enum (
  'freigeben',
  'ablehnen',
  'rueckfrage',
  'spam',
  'anmeldung',
  'anmeldung_fehlgeschlagen',
  'abmeldung',
  'einsicht_kontakt'
);

-- Ein Protokoll für alles, was ein Mensch in der Moderation tut — Entscheidungen
-- und Anmeldungen in derselben Tabelle. Getrennte Tabellen hätten bedeutet, bei
-- der Frage „was ist an diesem Abend passiert“ zwei Zeitachsen zu verschränken.
create table moderationsprotokoll (
  id             uuid primary key default gen_random_uuid(),
  aktion         protokollaktion not null,

  -- Leer bei fehlgeschlagener Anmeldung: dann ist die Person unbekannt.
  moderator_id   uuid references moderatoren(id) on delete set null,
  -- Die vorgelegte Kennung, damit ein Angriff auf ein bestimmtes Konto sichtbar
  -- wird. Kennwörter und Codes stehen hier unter keinen Umständen.
  kennung_versuch text,

  bewertung_id   uuid references bewertungen(id) on delete set null,
  -- Redundant zur Bewertung, aber die überlebt eine Löschung nicht, und das
  -- Protokoll soll sie überleben.
  schule_id      uuid references schulen(id) on delete set null,

  von_status     bewertungsstatus,
  nach_status    bewertungsstatus,
  grund_id       text,
  begruendung    text,

  erstellt_am    timestamptz not null default now()
);

create index protokoll_zeit      on moderationsprotokoll (erstellt_am desc);
create index protokoll_bewertung on moderationsprotokoll (bewertung_id, erstellt_am desc);
create index protokoll_moderator on moderationsprotokoll (moderator_id, erstellt_am desc);

-- Wer moderiert hat, war bisher eine lose UUID. Ab jetzt zeigt sie auf die
-- Moderatorentabelle — mit `on delete set null`, damit ein ausgeschiedener
-- Mitarbeiter gelöscht werden kann, ohne die Bewertungen mitzunehmen.
alter table bewertungen
  add constraint bewertungen_moderiert_von_fk
  foreign key (moderiert_von) references moderatoren(id) on delete set null;

-- Die Kennung des verwendeten Ablehnungsgrundes neben dem ausformulierten Text:
-- der Text kann sich ändern, die Auswertung „wie oft lehnen wir wegen Nennung
-- einer Person ab“ soll davon unberührt bleiben.
alter table bewertungen add column ablehnungsgrund_id text;

-- Die Warteschlange fragt nach Alter innerhalb der Prüfzustände. Der bestehende
-- Statusindex trägt das Datum nicht und müsste dafür jedes Mal sortieren.
create index bewertungen_warteschlange on bewertungen (erstellt_am)
  where status in ('in_pruefung_geo', 'in_pruefung_betrug');
