-- Die Signale der Betrugsprüfung mitspeichern.
--
-- Bisher wurden sie bei der Abgabe berechnet, entschieden über den Status und
-- waren danach weg. In der Moderation stand deshalb nur, was sich aus den
-- gespeicherten Antworten neu berechnen ließ — Tempo und Abweichung vom
-- Schulmittel gehören nicht dazu.
--
-- Die Signale nachträglich neu zu rechnen ginge ohnehin nicht: Die Grenzwerte
-- sind einstellbar, und was gestern angeschlagen hat, tut es nach einer
-- Änderung womöglich nicht mehr. Was die Moderation sehen muss, ist der Befund
-- von damals, nicht der von heute.

alter table bewertungen
  add column signale jsonb not null default '[]'::jsonb,
  add column signalpunkte int;

comment on column bewertungen.signale is
  'Die Signale der Betrugspruefung zum Zeitpunkt der Abgabe, samt Gewicht und Erlaeuterung. Historischer Befund — nicht neu berechnen.';
