-- Index auf den Zeitpunkt allein.
--
-- Die Auswertungen im Panel (`empfehlungszahlen`, `empfehlungsliste`,
-- `topWerber`) filtern ausschließlich auf den Monat; der bestehende Index
-- beginnt mit dem Werber und trägt das nicht. Bei hunderttausend Empfehlungen
-- sind das gemessen 15-25 ms statt weniger als 2.
create index if not exists empfehlungen_zeit on empfehlungen (erstellt_am desc);

-- Der ungedeckelte Wert entscheidet in der Rangliste bei Gleichstand. Mit zwei
-- Nachkommastellen stehen zwei bei 8,50 gedeckelte Schulen mit 8,501 und 8,504
-- wieder gleich, und es entschiede doch die Zahl der Bewertungen.
alter table schul_aggregate alter column gesamtscore_roh type numeric(5,3);
