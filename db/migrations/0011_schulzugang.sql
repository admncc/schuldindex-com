-- Zugang für Schulen (Rolle „Schulsupport“, Entscheidung E8).
--
-- Eine Schule sieht ihre eigenen Werte, aber keine Einzelbewertungen. Die
-- schwierige Frage ist der Nachweis, und der scheitert am echten Datenbestand,
-- wenn man ihn über die E-Mail-Domäne führt: `schule.nrw.de` gehört 5.447
-- Schulen, `t-online.de` 805. Deshalb drei Wege — siehe `domain/schulzugang.ts`.
--
-- Gemessen am Bestand vom 27.08.2026: 22.643 Schulen über die hinterlegte
-- Adresse, 2.108 über eine Domäne, die nur ihnen gehört, 7.019 über eine
-- Prüfung durch Menschen.

create type schulzugangsweg as enum ('amtliche_adresse', 'eigener_host', 'pruefung');
create type schulzugangstatus as enum ('offen', 'aktiv', 'abgelehnt', 'beendet');

create table schulzugaenge (
  id             uuid primary key default gen_random_uuid(),
  schule_id      uuid not null references schulen(id) on delete cascade,

  weg            schulzugangsweg not null,
  status         schulzugangstatus not null default 'offen',

  -- An wen der Link ging, beziehungsweise wer die Prüfung angefragt hat.
  -- Verschlüsselt wie jeder Kontakt im System.
  kontakt_chiffre bytea,
  kontakt_hash    text,
  -- Was die anfragende Person zu ihrer Rolle an der Schule angegeben hat.
  -- Nur bei der Prüfung von Hand gefüllt.
  anfrage_notiz   text,

  -- Der Zugangslink: gespeichert wird nur der Hash.
  link_hash       text unique,
  link_gueltig_bis timestamptz,
  link_verbraucht_am timestamptz,

  gueltig_bis    timestamptz,
  bestaetigt_am  timestamptz,

  entschieden_von uuid references moderatoren(id) on delete set null,
  entschieden_am  timestamptz,
  ablehnungsgrund text,

  erstellt_am    timestamptz not null default now(),

  constraint ablehnung_mit_grund check (status <> 'abgelehnt' or ablehnungsgrund is not null),
  -- Ein aktiver Zugang ohne Frist wäre ein Zugang auf Lebenszeit.
  constraint aktiv_mit_frist check (status <> 'aktiv' or gueltig_bis is not null)
);

-- Je Schule nur ein aktiver Zugang je Kontakt; offene Anfragen dürfen mehrfach
-- vorliegen, damit eine zweite Person nicht abgewiesen wird, während die erste
-- noch in der Prüfung hängt.
create unique index schulzugang_aktiv
  on schulzugaenge (schule_id, kontakt_hash)
  where status = 'aktiv' and kontakt_hash is not null;

create index schulzugang_schule on schulzugaenge (schule_id);
create index schulzugang_offen on schulzugaenge (erstellt_am)
  where status = 'offen' and weg = 'pruefung';

create table schulzugang_sitzungen (
  id          uuid primary key default gen_random_uuid(),
  zugang_id   uuid not null references schulzugaenge(id) on delete cascade,
  token_hash  text not null unique,
  gueltig_bis timestamptz not null,
  beendet_am  timestamptz,
  erstellt_am timestamptz not null default now()
);

create index schulzugang_sitzungen_zugang on schulzugang_sitzungen (zugang_id);

-- Wie viele Schulen einen Host benutzen. Als Sicht, damit die Zahl nicht
-- veraltet: nach jedem Import stimmt sie wieder.
create view schulhosts as
  select h, count(*)::int as schulen from (
    select nullif(lower(regexp_replace(split_part(email, '@', 2), '^www\.', '')), '') as h
    from schulen where ist_aktiv and email like '%@%'
    union all
    select nullif(lower(regexp_replace(regexp_replace(regexp_replace(website, '^[a-z]+://', ''), '/.*$', ''), '^www\.', '')), '')
    from schulen where ist_aktiv and website is not null
  ) x where h is not null group by h;
