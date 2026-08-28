-- Weitere Standorte einer Schule.
--
-- Beim Blick auf die fertige Trefferliste fiel auf, dass „Grundschule Tengen“
-- viermal untereinander stand - vier Außenstellen derselben Schule in
-- verschiedenen Ortsteilen. Für Suchende sieht das aus wie ein kaputtes Portal.
--
-- Sie werden jetzt zu einer Schule zusammengeführt. Die weiteren Adressen gehen
-- dabei nicht verloren, sondern landen hier: sie gehören auf das Schulprofil,
-- und ohne sie ließe sich die Zusammenführung nicht mehr rückgängig machen.

alter table schulen add column standorte jsonb not null default '[]'::jsonb;

comment on column schulen.standorte is
  'Weitere Adressen und Quell-IDs, die beim Import in diese Schule aufgegangen sind.';
