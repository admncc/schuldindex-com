-- Konten, Bewertungen, Versionen, Aggregate.
--
-- Setzt die Entscheidungen vom 26.08.2026 um:
--   E10/E13  Konten für alle Altersgruppen, Verifizierung am Konto statt an
--            jeder Bewertung - dafür je Konto nur eine Bewertung pro Schule
--   E2       Bearbeitung über das Konto, Sperrfrist sechs Monate
--   E6       Telefon als primärer Kontaktweg, E-Mail als Rückfall
--   E11      Elterneinwilligung bei unter 16-Jährigen, protokolliert
--   E15      dritter Zustand „in Prüfung“ zwischen freigegeben und abgelehnt

create type kontaktart as enum ('whatsapp', 'sms', 'email');

create type rolle as enum (
  'schueler_unter_16', 'schueler_ab_16', 'eltern', 'lehrkraft', 'ehemalig'
);

-- Der Zustand „in Prüfung“ fehlte im Nutzerflow. Ohne ihn sehen gehaltene
-- Bewertungen für die verfassende Person aus wie verschwunden.
create type bewertungsstatus as enum (
  'wartet_auf_verifizierung',
  'in_pruefung_geo',
  'in_pruefung_betrug',
  'freigegeben',
  'abgelehnt'
);

create table konten (
  id                 uuid primary key default gen_random_uuid(),
  -- Klartext verschlüsselt, weil ein Konto ohne dauerhaften Kontakt nicht
  -- funktioniert (E1/E10). Der Hash daneben erlaubt Dublettenerkennung, ohne
  -- entschlüsseln zu müssen.
  kontakt_chiffre    bytea not null,
  kontakt_hash       text not null unique,
  kontaktart         kontaktart not null,
  verifiziert_am     timestamptz,
  letzte_anmeldung   timestamptz,
  erstellt_am        timestamptz not null default now(),
  -- Löschfrist nach 24 Monaten Inaktivität (E1)
  loeschen_ab        timestamptz
);

comment on column konten.kontaktart is
  'Telefon ist der primäre Weg (WhatsApp, dann SMS). E-Mail nur als Rückfall, wenn keine Nummer vorhanden ist - solche Konten werden bei der Betrugserkennung strenger behandelt, weil eine Adresse in Sekunden neu angelegt ist.';

create table bewertungen (
  id                    uuid primary key default gen_random_uuid(),
  schule_id             uuid not null references schulen(id) on delete cascade,
  konto_id              uuid not null references konten(id) on delete cascade,

  rolle                 rolle not null,
  klassenstufe          smallint,          -- 1–13, nur bei Schülerrollen
  abgangsjahr           smallint,          -- nur bei Ehemaligen
  status                bewertungsstatus not null default 'wartet_auf_verifizierung',
  aktuelle_version      int not null default 1,

  -- Einwilligungen mit Zeitpunkt und Textfassung, wie von der DSGVO verlangt
  datenschutz_einwilligung_am timestamptz,
  eltern_einwilligung_am      timestamptz,
  einwilligung_fassung        text,

  -- Ergebnis der Geo-Prüfung. Die IP selbst wird nie gespeichert (E3) -
  -- die Moderation braucht die Entfernung, nicht die Adresse.
  geo_entfernung_km     numeric(7,1),
  geo_bundesland        bundesland,
  geo_unbekannt         boolean not null default false,

  ablehnungsgrund       text,
  moderiert_von         uuid,
  moderiert_am          timestamptz,

  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now(),
  zuletzt_bearbeitet_am timestamptz,

  -- E13: Kontoverifizierung statt Verifizierung je Bewertung - die Begrenzung
  -- auf eine Bewertung je Schule und Konto ist die Gegenleistung dafür.
  constraint eine_bewertung_je_schule unique (schule_id, konto_id),

  constraint klassenstufe_gueltig
    check (klassenstufe is null or klassenstufe between 1 and 13),
  constraint klassenstufe_nur_bei_schuelern
    check (klassenstufe is null or rolle in ('schueler_unter_16', 'schueler_ab_16')),
  constraint abgangsjahr_nur_bei_ehemaligen
    check (abgangsjahr is null or rolle = 'ehemalig'),
  -- E11: unter 16 ohne Elterneinwilligung geht nicht
  constraint eltern_einwilligung_unter_16
    check (rolle <> 'schueler_unter_16' or eltern_einwilligung_am is not null),
  constraint ablehnung_braucht_grund
    check (status <> 'abgelehnt' or ablehnungsgrund is not null)
);

create index bewertungen_schule  on bewertungen (schule_id) where status = 'freigegeben';
create index bewertungen_status  on bewertungen (status);
create index bewertungen_konto   on bewertungen (konto_id);

-- Jede Fassung bleibt erhalten; öffentlich ist nur die aktuelle (E2).
create table bewertung_versionen (
  id                uuid primary key default gen_random_uuid(),
  bewertung_id      uuid not null references bewertungen(id) on delete cascade,
  version           int not null,

  antworten         jsonb not null,        -- {"A1":5,"A2":2,…}
  freitexte         jsonb not null default '{}'::jsonb,

  score_a           numeric(4,3),
  score_b           numeric(4,3),
  score_c           numeric(4,3),
  score_d           numeric(4,3),
  score_e           numeric(4,3),
  score_f           numeric(4,3),
  aggressionsindex  numeric(4,3),
  gesamtscore       numeric(4,2),          -- Anzeigeskala 0–10

  erstellt_am       timestamptz not null default now(),

  constraint version_je_bewertung unique (bewertung_id, version),
  constraint gesamtscore_im_bereich check (gesamtscore is null or gesamtscore between 0 and 10)
);

create index versionen_bewertung on bewertung_versionen (bewertung_id, version desc);

-- Vorberechnete Werte je Schule. Neuberechnung bei jeder Freigabe.
create table schul_aggregate (
  schule_id            uuid primary key references schulen(id) on delete cascade,
  gesamtscore          numeric(4,2),
  score_a              numeric(4,3),
  score_b              numeric(4,3),
  score_c              numeric(4,3),
  score_d              numeric(4,3),
  score_e              numeric(4,3),
  score_f              numeric(4,3),
  aggressionsindex     numeric(4,3),

  anzahl               int not null default 0,
  anzahl_je_rolle      jsonb not null default '{}'::jsonb,
  anzahl_mit_freitext  int not null default 0,

  gesamtscore_vor_6m   numeric(4,2),
  anzahl_vor_6m        int not null default 0,

  letzte_bewertung_am  timestamptz,
  aktualisiert_am      timestamptz not null default now()
);

create index aggregate_score on schul_aggregate (gesamtscore desc nulls last) where anzahl >= 10;
