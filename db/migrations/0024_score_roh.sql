-- Der ungedeckelte Gesamtwert je Schule.
--
-- Die Obergrenze nach Vollständigkeit (8,5 ohne freiwillige Bereiche) schiebt
-- die Spitze zusammen: Sobald mehrere Schulen sie erreichen, entschied in der
-- Rangliste „beste Schulen“ nicht mehr die Qualität, sondern die Zahl der
-- Bewertungen. Zwei Schulen mit 9,49 und 8,65 standen beide bei 8,50, und die
-- schlechtere gewann, weil sie mehr Stimmen hatte.
--
-- Der Rohwert steht deshalb daneben und dient als zweites Sortierkriterium. Er
-- wird nirgends angezeigt: Veröffentlicht ist der gedeckelte Wert.
alter table schul_aggregate add column if not exists gesamtscore_roh numeric(4,2);

comment on column schul_aggregate.gesamtscore_roh is
  'Gewichteter Schnitt ohne Deckelung. Nur für die Sortierung - nie anzeigen.';
