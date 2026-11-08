-- Die vom Server gemessene Bearbeitungsdauer mitspeichern.
--
-- Bisher wurde sie geprueft und danach weggeworfen: In der Datenbank standen
-- nur die Klickabstaende aus dem Browser. Die Folge zeigte sich beim ersten
-- Versuch, eine Schwelle zu beurteilen - die Frage „haette das Tempo-Signal
-- bei dieser Abgabe angeschlagen" liess sich nachtraeglich nicht mehr
-- beantworten, obwohl genau dafuer gemessen wird.
--
-- Die Dauer ist dieselbe Art Angabe wie das Klickmuster: eine Verhaltensspur,
-- aber keine, die auf eine Person zeigt. Sie faellt unter dieselbe
-- Aufbewahrungsregel.
alter table bewertungen
  add column if not exists dauer_sekunden int;

comment on column bewertungen.dauer_sekunden is
  'Vom Server gemessene Dauer zwischen Ausstellung des Formularstempels und Abgabe, in Sekunden. Grundlage des Tempo-Signals (domain/betrugspruefung.ts).';
