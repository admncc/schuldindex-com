-- Der Name der meldenden Person wird verschlüsselt abgelegt.
--
-- Im Klartext entstand neben den Bewertungen genau die Liste, die die
-- Verschlüsselung des Kontakts verhindern soll: wer wen gemeldet hat. Kontakt
-- und Suchhash lagen schon richtig, der Name daneben nicht.
--
-- Die Spalte wird ersetzt statt umbenannt: Sie ist leer (geprüft vor der
-- Migration), es geht also nichts verloren. Für den Fall, dass doch ein Name
-- darin steht, bricht die Migration ab, statt ihn stillschweigend zu löschen.
do $$
begin
  -- Nur wenn die Spalte überhaupt (noch) da ist: Der zweite Lauf soll nicht an
  -- „column melder_name does not exist“ scheitern.
  if exists (
    select 1 from information_schema.columns
    where table_name = 'meldungen' and column_name = 'melder_name'
  ) then
    if exists (select 1 from meldungen where melder_name is not null) then
      raise exception 'meldungen.melder_name enthält noch Klartext - bitte vorher von Hand übertragen';
    end if;
    alter table meldungen drop column melder_name;
  end if;
end $$;

alter table meldungen add column if not exists melder_name_chiffre bytea;

comment on column meldungen.melder_name_chiffre is
  'Name der meldenden Person, AES-256-GCM (domain/kontakt.ts). Freiwillige Angabe nach Art. 16 Abs. 2 lit. c DSA.';
