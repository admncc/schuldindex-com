-- Meldungen nach Art. 16 DSA.
--
-- Die Pflicht: ein leicht zugängliches, elektronisches Verfahren, mit dem jede
-- Person Inhalte melden kann, die sie für rechtswidrig hält. Dazu gehören eine
-- Eingangsbestätigung (Abs. 4) und eine Mitteilung der Entscheidung samt
-- Rechtsbehelfen (Abs. 5) - beides braucht einen Rückkanal, deshalb steht hier
-- eine Kontaktadresse.
--
-- Sie liegt verschlüsselt, wie jeder andere Kontakt im System auch: dieselben
-- Schlüssel, dasselbe Verfahren (`domain/kontakt.ts`). Wer eine Bewertung
-- meldet, ist oft die betroffene Lehrkraft - eine Klartextliste solcher Namen
-- neben den Bewertungen wäre genau das, was dieses Portal nicht anlegen will.

create type meldegrund as enum (
  'personenbezug',   -- nennt eine Person erkennbar
  'beleidigung',
  'unwahr',          -- unwahre Tatsachenbehauptung
  'straftat',        -- Drohung, Gewaltankündigung
  'urheberrecht',
  'sonstiges'
);

create type meldestatus as enum ('eingegangen', 'in_bearbeitung', 'erledigt', 'abgelehnt');

create table meldungen (
  id              uuid primary key default gen_random_uuid(),

  -- Was gemeldet wird. Die Adresse ist Pflicht nach Art. 16 Abs. 2 lit. b;
  -- Schule und Bewertung lösen wir daraus auf, soweit möglich.
  url             text not null,
  schule_id       uuid references schulen(id) on delete set null,
  bewertung_id    uuid references bewertungen(id) on delete set null,

  grund           meldegrund not null,
  -- Die „hinreichend begründete Erläuterung“ aus Art. 16 Abs. 2 lit. a.
  erlaeuterung    text not null,

  melder_name     text,
  melder_chiffre  bytea,
  melder_hash     text,
  -- Art. 16 Abs. 2 lit. d. Ohne diese Erklärung nimmt das Formular nichts an.
  gutglauben_am   timestamptz not null,

  status          meldestatus not null default 'eingegangen',
  entscheidung    text,
  moderator_id    uuid references moderatoren(id) on delete set null,
  entschieden_am  timestamptz,
  bestaetigt_am   timestamptz,

  eingegangen_am  timestamptz not null default now(),

  constraint entscheidung_bei_abschluss
    check (status not in ('erledigt', 'abgelehnt') or entscheidung is not null)
);

create index meldungen_offen on meldungen (eingegangen_am)
  where status in ('eingegangen', 'in_bearbeitung');
create index meldungen_bewertung on meldungen (bewertung_id);
-- Wiederholte Meldungen derselben Person zur selben Bewertung sind ein Muster,
-- das die Moderation sehen muss (Art. 23 DSA, Missbrauch des Meldewegs).
create index meldungen_melder on meldungen (melder_hash) where melder_hash is not null;
