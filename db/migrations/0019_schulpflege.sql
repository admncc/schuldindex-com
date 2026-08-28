-- Schulen von Hand pflegen.
--
-- Der Bestand kommt aus jedeschule.codefor.de und wird über
-- `scripts/importiere.ts` eingespielt. Für den Betrieb reicht das nicht: Eine
-- Schule zieht um, wird umbenannt, geschlossen, oder sie fehlt in der Quelle
-- ganz. Bisher hätte man dafür in die Datenbank greifen müssen.
--
-- Der wichtige Teil ist `manuell_gepflegt`. Ohne diese Spalte wäre jede
-- Handkorrektur bis zum nächsten Import haltbar: Der Import schreibt Name,
-- Adresse und Schulart per `on conflict do update` zurück auf den Stand der
-- Quelle. Mit ihr überspringt er genau diese Zeilen (siehe
-- `scripts/importiere.ts`) - wer von Hand eingreift, sagt damit: „Hier weiß ich
-- es besser als die Quelle.“
--
-- Von Hand angelegte Schulen brauchen keine Sonderbehandlung: Sie bekommen eine
-- `quell_id` der Form `manuell:<uuid>`, die in keiner Lieferung vorkommt und
-- deshalb nie von einem Import getroffen wird.

alter table schulen
  add column manuell_gepflegt boolean not null default false;

comment on column schulen.manuell_gepflegt is
  'Von der Redaktion bearbeitet. Der Import laesst diese Zeilen unangetastet.';

-- Der Protokolleintrag für Änderungen am Bestand. Dieselbe Tabelle wie für
-- Moderationsentscheidungen: Wer eine Schule umbenennt, greift so tief in die
-- Anzeige ein wie jemand, der eine Bewertung freigibt.
alter type protokollaktion add value if not exists 'schule_geaendert';
