-- Demodaten als solche kennzeichnen.
--
-- Ein Testsystem ohne Inhalt lässt sich nicht beurteilen: Ranglisten bleiben
-- leer, die Karte zeigt nichts, die Moderationswarteschlange auch nicht. Also
-- werden Bewertungen erzeugt (`scripts/demodaten.ts`).
--
-- Die Kennzeichnung ist der Punkt, an dem das ungefährlich wird. Ohne sie wäre
-- „Demodaten löschen“ eine Abfrage nach Verdachtsmerkmalen - Konten mit
-- erfundenen Nummern, Bewertungen aus einem Zeitraum -, und die erste echte
-- Bewertung, die zufällig ins Muster passt, wäre mit weg. Mit ihr ist es ein
-- `where ist_demo`.
--
-- Die Spalte steht auf beiden Tabellen, weil beide Seiten gelöscht werden
-- müssen: Ein Konto ohne Bewertungen bliebe sonst als Karteileiche stehen.

alter table konten
  add column ist_demo boolean not null default false;

alter table bewertungen
  add column ist_demo boolean not null default false;

-- Teilindex: Die Abfrage sucht immer nur die wenigen Demozeilen, nie die
-- Millionen echten.
create index if not exists bewertungen_demo on bewertungen (id) where ist_demo;
create index if not exists konten_demo on konten (id) where ist_demo;

comment on column bewertungen.ist_demo is
  'Von scripts/demodaten.ts erzeugt. Loeschbar ueber /moderation/aufbewahrung; niemals auf echte Bewertungen setzen.';
