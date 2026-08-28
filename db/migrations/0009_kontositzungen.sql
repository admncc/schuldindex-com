-- Anmeldung am eigenen Konto.
--
-- Wer bewertet, bekommt kein Kennwort: der Kontakt ist die Kennung, und der
-- Zugang läuft über einen Link, wie schon die Bestätigung. Ein Kennwort wäre
-- ein weiteres Geheimnis, das Jugendliche verwalten müssten - und der häufigste
-- Weg, wie ein Konto verlorengeht.
--
-- Der Anmeldelink selbst braucht keine eigene Tabelle: `verifizierungstoken`
-- trägt dafür die Spalte `zweck`.

create table konto_sitzungen (
  id          uuid primary key default gen_random_uuid(),
  konto_id    uuid not null references konten(id) on delete cascade,
  -- Nur der Hash, wie überall: wer die Datenbank liest, soll sich nicht in eine
  -- laufende Sitzung setzen können.
  token_hash  text not null unique,
  gueltig_bis timestamptz not null,
  beendet_am  timestamptz,
  erstellt_am timestamptz not null default now()
);

create index konto_sitzungen_konto on konto_sitzungen (konto_id);
create index konto_sitzungen_aufraeumen on konto_sitzungen (gueltig_bis) where beendet_am is null;

-- Wann zuletzt ein Anmeldelink angefordert wurde, sieht man an den Token; für
-- die Begrenzung braucht es einen Index auf Konto und Zeit.
create index token_anmeldung on verifizierungstoken (konto_id, erstellt_am desc)
  where zweck = 'anmeldung';
