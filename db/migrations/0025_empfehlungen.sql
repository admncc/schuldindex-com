-- Empfehlungen und die Superverlosung.
--
-- Nach der Bestätigung bekommt jede bewertende Person einen eigenen Link. Kommt
-- darüber jemand und gibt selbst eine Bewertung ab, die freigegeben wird, ist
-- die werbende Person im selben Monat für die Superverlosung dabei.
--
-- **Warum eine eigene Tabelle und keine Spalte an `konten`?** Weil die Beziehung
-- zwei Konten verbindet und einen Zeitpunkt hat. Eine Spalte „geworben_von“ an
-- `konten` könnte dasselbe, verlöre aber den Monat, sobald jemand später eine
-- zweite Bewertung abgibt - und der Monat ist es, worauf die Superverlosung
-- schaut.

-- Der eigene Empfehlungscode. Kurz genug zum Vorlesen, lang genug, dass er sich
-- nicht raten lässt (10 Zeichen aus base32 ohne Verwechslungspaare = ~50 Bit).
alter table konten add column if not exists empfehlungscode text;
create unique index if not exists konten_empfehlungscode on konten (empfehlungscode)
  where empfehlungscode is not null;

create table if not exists empfehlungen (
  id                   uuid primary key default gen_random_uuid(),

  werber_konto_id      uuid not null references konten(id) on delete cascade,
  -- Ein Konto kann nur einmal geworben worden sein. Ohne diese Bedingung ließe
  -- sich dieselbe Person mehrfach als Werbeerfolg zählen.
  geworbenes_konto_id  uuid not null references konten(id) on delete cascade unique,
  -- Die Bewertung, mit der die geworbene Person angefangen hat. Erst wenn sie
  -- freigegeben ist, zählt die Empfehlung.
  bewertung_id         uuid references bewertungen(id) on delete set null,

  erstellt_am          timestamptz not null default now(),

  -- Niemand wirbt sich selbst.
  constraint kein_selbstverweis check (werber_konto_id <> geworbenes_konto_id)
);

create index if not exists empfehlungen_werber on empfehlungen (werber_konto_id, erstellt_am desc);

-- Die Art der Ziehung. Bestehende Ziehungen sind normale.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'verlosungsart') then
    create type verlosungsart as enum ('normal', 'super');
  end if;
end $$;

alter table verlosungen add column if not exists art verlosungsart not null default 'normal';

-- Je Monat und Art eine Ziehung - vorher galt das je Monat.
alter table verlosungen drop constraint if exists ein_monat_eine_ziehung;
create unique index if not exists verlosungen_monat_art on verlosungen (jahr, monat, art);

-- Aus einem Gewinner werden viele: 50 Gutscheine in der normalen Verlosung,
-- 25 in der Superverlosung. Die alte Spalte `gewinner_konto_id` bleibt für die
-- bereits gezogenen Monate stehen - ein Protokoll, das man nachträglich
-- umschreibt, ist keines.
create table if not exists verlosungsgewinne (
  id             uuid primary key default gen_random_uuid(),
  verlosung_id   uuid not null references verlosungen(id) on delete cascade,
  konto_id       uuid not null references konten(id) on delete cascade,
  -- Der wievielte gezogene Gewinn - für die Nachvollziehbarkeit der Reihenfolge.
  platz          int not null,
  -- Der Index des Loses in der gespeicherten Losliste.
  los_index      int not null,
  benachrichtigt_am timestamptz,

  constraint ein_gewinn_je_konto_und_ziehung unique (verlosung_id, konto_id),
  constraint platz_positiv check (platz > 0)
);

create index if not exists verlosungsgewinne_konto on verlosungsgewinne (konto_id);

comment on table verlosungsgewinne is
  'Gezogene Gewinne. Wer hier für eine normale Ziehung steht, nimmt an keiner weiteren normalen Ziehung mehr teil.';

-- Die dritte Stufe: ein Gutschein über 1000 Euro für alle, die im Monat über
-- 100 Personen geworben haben, deren Bewertung veröffentlicht wurde.
alter type verlosungsart add value if not exists 'mega';
