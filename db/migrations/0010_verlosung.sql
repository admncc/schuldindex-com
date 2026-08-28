-- Monatliche Verlosung (Entscheidung E9).
--
-- Die Teilnahme wurde bisher im Formular abgefragt, geprüft - und dann
-- weggeworfen: eine Spalte gab es nicht. Damit versprach das Ankreuzfeld etwas,
-- das nirgends ankam. Diese Migration holt das nach und legt die Ziehung dazu.

alter table bewertungen
  add column verlosung_teilnahme boolean not null default false;

-- Nur Schülerrollen dürfen teilnehmen. Die Prüfung steht auch in der Eingabe;
-- hier verhindert sie, was jede andere Schreibstelle sonst noch versuchen
-- könnte.
alter table bewertungen add constraint verlosung_nur_schueler
  check (not verlosung_teilnahme or rolle in ('schueler_unter_16', 'schueler_ab_16'));

create index bewertungen_verlosung on bewertungen (erstellt_am)
  where verlosung_teilnahme and status = 'freigegeben';

create table verlosungen (
  id             uuid primary key default gen_random_uuid(),

  -- Der Kalendermonat, für den gezogen wurde.
  jahr           smallint not null,
  monat          smallint not null,

  -- Grundlage der Ziehung, aufbewahrt zum Nachrechnen: aus Zufallswert und
  -- Losliste ergibt sich derselbe Gewinner. Bei einer Verlosung mit
  -- minderjährigen Teilnehmenden ist „vertraut uns“ keine Auskunft.
  zufallswert    text not null,
  lose_gesamt    int not null,
  gewinner_index int,
  -- Die Lose in der Reihenfolge, in der gezogen wurde. Nur Konto-Kennungen,
  -- keine Kontaktdaten.
  losliste       jsonb not null default '[]'::jsonb,

  gewinner_konto_id uuid references konten(id) on delete set null,
  -- Wann die gewinnende Person benachrichtigt wurde. Bleibt leer, bis der
  -- Versandweg steht.
  benachrichtigt_am timestamptz,
  gezogen_am     timestamptz not null default now(),
  gezogen_von    uuid references moderatoren(id) on delete set null,

  constraint ein_monat_eine_ziehung unique (jahr, monat),
  constraint monat_gueltig check (monat between 1 and 12),
  constraint gewinner_bei_losen check (lose_gesamt = 0 or gewinner_index is not null)
);

create index verlosungen_zeit on verlosungen (jahr desc, monat desc);
