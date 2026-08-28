-- Aufbewahrungsfristen umsetzbar machen.
--
-- Die Datenschutzerklärung nennt seit dem ersten Entwurf Fristen; ausgeführt
-- hat sie niemand. Der schwierige Fall ist das Konto: „24 Monate nach der
-- letzten Nutzung gelöscht“ und „Bewertungen bleiben, solange sie
-- veröffentlicht sind“ schließen sich aus, solange die Bewertung am Konto
-- hängt und mit ihm fällt.
--
-- Aufgelöst wird das, indem das Konto nicht gelöscht, sondern stillgelegt wird:
-- Kontakt weg, Zeile bleibt. Was übrig bleibt, ist ein Anker ohne Person - die
-- Bewertung ist weiter anonym veröffentlicht, und niemand kann sich mehr auf
-- sie berufen, wir eingeschlossen.

alter table konten
  alter column kontakt_chiffre drop not null,
  add column stillgelegt_am timestamptz;

-- Der eindeutige Index über den Kontakt-Hash muss stillgelegte Konten
-- auslassen: sonst könnte nach der ersten Stilllegung nur noch ein einziges
-- weiteres Konto ohne Hash existieren.
alter table konten drop constraint konten_kontakt_hash_key;
create unique index konten_kontakt_hash on konten (kontakt_hash) where kontakt_hash is not null;
alter table konten alter column kontakt_hash drop not null;

comment on column konten.stillgelegt_am is
  'Gesetzt, wenn der Kontakt nach Ablauf der Aufbewahrungsfrist gelöscht wurde. Das Konto bleibt als Anker der Bewertungen bestehen, ist aber nicht mehr erreichbar und nicht mehr anmeldbar.';

-- Wann zuletzt etwas geschah. `letzte_anmeldung` allein genügt nicht: wer
-- bewertet und sich nie anmeldet, hätte nach 24 Monaten ein stillgelegtes Konto,
-- obwohl er das Portal benutzt hat.
create index konten_ruhend on konten (greatest(
  coalesce(letzte_anmeldung, erstellt_am), erstellt_am
)) where stillgelegt_am is null;

-- Protokoll der Aufräumläufe. Ein Lauf, der nichts hinterlässt, ist von einem,
-- der nie lief, nicht zu unterscheiden - und das ist der Fehler, der jahrelang
-- unbemerkt bleibt.
create table aufraeumlaeufe (
  id          uuid primary key default gen_random_uuid(),
  bilanz      jsonb not null,
  trocken     boolean not null default false,
  gelaufen_am timestamptz not null default now(),
  dauer_ms    int
);

create index aufraeumlaeufe_zeit on aufraeumlaeufe (gelaufen_am desc);
