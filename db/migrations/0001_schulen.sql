-- Grundschema: Schulen.
--
-- Bewusst ohne PostGIS. Geprüft wurde, was wir tatsächlich brauchen:
-- Entfernung zwischen zwei Punkten (150-km-Prüfung) und Umkreissuche. Beides
-- leisten `cube` und `earthdistance`, die in jeder verwalteten Postgres-Instanz
-- verfügbar sind - PostGIS ist es nicht überall. Polygone, Projektionen oder
-- Routing braucht das Portal nirgends. Sollte sich das ändern, ist der Wechsel
-- auf PostGIS eine Migration, keine Umkehr.

create extension if not exists pgcrypto;    -- gen_random_uuid
create extension if not exists cube;
create extension if not exists earthdistance;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create type schulart as enum (
  'grundschule', 'hauptschule', 'realschule', 'oberschule', 'gesamtschule',
  'gymnasium', 'foerderschule', 'berufliche_schule', 'waldorfschule', 'sonstige'
);

create type bundesland as enum (
  'BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH'
);

-- Wie genau die Koordinate ist. Entscheidet, ob eine Schule auf der Karte einen
-- Punkt oder nur eine Umgebungsmarkierung bekommt. Für die 150-km-Prüfung ist
-- jede Stufe außer 'keine' ausreichend.
create type koordinatengenauigkeit as enum ('quelle', 'adresse', 'plz', 'ort');

create table schulen (
  id                uuid primary key default gen_random_uuid(),
  quell_id          text not null unique,          -- z. B. 'NI-43424'
  slug              text not null unique,
  name              text not null,

  schularten        schulart[] not null default '{}',
  schulart_original text,                          -- Bezeichnung des Landes, für die Anzeige

  bundesland        bundesland not null,
  strasse           text,
  plz               text,
  ort               text,
  traeger           text,

  website           text,
  telefon           text,
  email             text,

  lat               double precision,
  lon               double precision,
  genauigkeit       koordinatengenauigkeit,

  -- Beide Umlautformen nebeneinander: unaccent macht aus 'Grünewald' ein
  -- 'Grunewald', wer 'Gruenewald' tippt fände damit nichts. Die Spalte hält
  -- deshalb zusätzlich die ausgeschriebene Form.
  suchtext          text not null,

  ist_aktiv         boolean not null default true,
  quelle_stand      timestamptz,
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now(),

  constraint koordinate_vollstaendig
    check ((lat is null) = (lon is null)),
  constraint koordinate_hat_genauigkeit
    check ((lat is null) = (genauigkeit is null)),
  constraint koordinate_in_deutschland
    check (lat is null or (lat between 47.2 and 55.1 and lon between 5.8 and 15.1))
);

comment on constraint koordinate_in_deutschland on schulen is
  'Fängt Geokodierungsfehler an der Datenbank ab. Ein Treffer in Wien oder auf der Nullinsel darf gar nicht erst gespeichert werden.';

create index schulen_suchtext_trgm on schulen using gin (suchtext gin_trgm_ops);
create index schulen_bundesland    on schulen (bundesland);
create index schulen_ort           on schulen (ort);
create index schulen_plz           on schulen (plz);
create index schulen_schularten    on schulen using gin (schularten);

-- Umkreissuche und Entfernungsprüfung
create index schulen_position on schulen using gist (ll_to_earth(lat, lon))
  where lat is not null;
