-- Eigene Protokollarten für Schlüssel, GeoIP und Demodaten.
--
-- Alle drei liefen bisher als 'schule_geaendert' mit. Die Schulenseite filtert
-- genau darauf und zeigte das Ergebnis als „letzte Eingriffe in den Bestand“ -
-- dort stand dann „Zugangsschlüssel gesetzt: anthropic_api_key“ als
-- Schuländerung. Umgekehrt lief die Demodatenlöschung als
-- 'aufbewahrung_ausgefuehrt', obwohl die Aufbewahrungsseite ausdrücklich
-- festhält, dass beides nicht in einen Topf gehört.
--
-- Alte Einträge werden **nicht** umgeschrieben: Ein Protokoll, das sich
-- nachträglich ändert, ist keines mehr.
alter type protokollaktion add value if not exists 'geheimnis_geaendert';
alter type protokollaktion add value if not exists 'geoip_ersetzt';
alter type protokollaktion add value if not exists 'demodaten_geloescht';
