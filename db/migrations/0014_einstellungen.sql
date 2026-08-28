-- Einstellbare Werte der Betrugserkennung.
--
-- Bisher standen die Grenzwerte als Konstanten im Code. Ob „mehr als fünf
-- Abgaben in zehn Minuten“ zu streng ist, weiß aber niemand vor den ersten
-- tausend Bewertungen - und dann soll für eine Zahl keine neue Fassung
-- ausgeliefert werden müssen.
--
-- Gespeichert wird nur, was von der Vorgabe abweicht. Eine leere Tabelle
-- bedeutet: alles steht auf den Werten aus `domain/einstellungen.ts`.

create table einstellungen (
  schluessel      text primary key,
  wert            numeric not null,
  geaendert_von   uuid references moderatoren(id) on delete set null,
  geaendert_am    timestamptz not null default now()
);

-- Jede Änderung mit Person, Zeitpunkt, altem und neuem Wert. Bei einer
-- Einstellung, die entscheidet, welche Bewertungen durchgehen, ist die Frage
-- „seit wann steht das so, und wer hat es gesetzt?“ die erste, die jemand
-- stellt, wenn etwas auffällt.
create table einstellungsverlauf (
  id            uuid primary key default gen_random_uuid(),
  schluessel    text not null,
  alter_wert    numeric,
  neuer_wert    numeric not null,
  moderator_id  uuid references moderatoren(id) on delete set null,
  geaendert_am  timestamptz not null default now()
);

create index einstellungsverlauf_zeit on einstellungsverlauf (geaendert_am desc);
create index einstellungsverlauf_schluessel on einstellungsverlauf (schluessel, geaendert_am desc);
