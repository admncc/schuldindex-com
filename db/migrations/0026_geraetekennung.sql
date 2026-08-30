-- Die Gerätekennung an der Bewertung.
--
-- Gespeichert wird **nicht** die Kennung selbst, sondern ihr HMAC. Für den
-- einzigen Zweck - „kommen mehrere Bewertungen aus demselben Browser?“ - genügt
-- der Vergleich zweier Abdrücke; die Kennung im Klartext danebenzulegen brächte
-- nichts, was der Abdruck nicht auch kann, und wäre bei einem Datenabzug ein
-- Wiedererkennungsmerkmal über das Portal hinaus.
--
-- Der Abdruck ist ein **Signal mit kleinem Gewicht**, kein Beweis: Ein privates
-- Fenster hat eine neue Kennung, und wer sie loswerden will, braucht zehn
-- Sekunden. Er fängt den bequemen Fall, nicht den entschlossenen.
alter table bewertungen add column if not exists geraet_hash text;

create index if not exists bewertungen_geraet on bewertungen (geraet_hash, erstellt_am desc)
  where geraet_hash is not null;

comment on column bewertungen.geraet_hash is
  'HMAC der Browserkennung aus Cookie/Local Storage. Nur für die Missbrauchsabwehr.';
