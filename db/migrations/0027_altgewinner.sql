-- Trägt die bereits gezogenen Gewinner in die neue Tabelle nach.
--
-- Vor Migration 0025 gab es je Ziehung genau einen Gewinner, und der stand in
-- `verlosungen.gewinner_konto_id`. Der Ausschluss früherer Gewinner sieht
-- seitdem in `verlosungsgewinne` nach - und fand dort nichts. Ein Konto, das
-- vor der Umstellung gewonnen hatte, wäre bei jeder weiteren Ziehung wieder im
-- Topf gewesen, gegen Teilnahmebedingung 2.
--
-- Wiederholbar: `on conflict` lässt bereits nachgetragene Zeilen in Ruhe.
insert into verlosungsgewinne (verlosung_id, konto_id, platz, los_index, benachrichtigt_am)
select v.id, v.gewinner_konto_id, 1, coalesce(v.gewinner_index, 0), v.benachrichtigt_am
from verlosungen v
where v.gewinner_konto_id is not null
on conflict (verlosung_id, konto_id) do nothing;

-- Ein Gewinn überlebt das Löschen des Kontos.
--
-- Vorher nahm `on delete cascade` den Eintrag mit, sobald jemand sein Konto
-- löschte - und damit den Nachweis, dass gezogen wurde. Ein Protokoll, das
-- sich rückwirkend leert, ist keines. Die Kennung fällt weg, der Platz und der
-- Losindex bleiben; damit bleibt die Ziehung nachrechenbar.
alter table verlosungsgewinne drop constraint if exists verlosungsgewinne_konto_id_fkey;
alter table verlosungsgewinne alter column konto_id drop not null;
alter table verlosungsgewinne
  add constraint verlosungsgewinne_konto_id_fkey
  foreign key (konto_id) references konten(id) on delete set null;

-- Ohne Konto ist die Eindeutigkeit je Ziehung nicht mehr zu halten; sie soll
-- aber weiter greifen, solange eine Kennung da ist.
alter table verlosungsgewinne drop constraint if exists ein_gewinn_je_konto_und_ziehung;
create unique index if not exists verlosungsgewinne_je_konto
  on verlosungsgewinne (verlosung_id, konto_id) where konto_id is not null;
