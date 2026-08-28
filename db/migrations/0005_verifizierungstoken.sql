-- Bestätigungstoken.
--
-- Gespeichert wird nur der Hash. Der Klartext geht in der Nachricht hinaus und
-- steht nirgends in der Datenbank - wer sie lesen kann, soll nicht jedes offene
-- Konto selbst bestätigen können.

create table verifizierungstoken (
  id            uuid primary key default gen_random_uuid(),
  konto_id      uuid not null references konten(id) on delete cascade,
  token_hash    text not null unique,
  zweck         text not null default 'bestaetigung',
  gueltig_bis   timestamptz not null,
  verbraucht_am timestamptz,
  gesendet      int not null default 1,
  erstellt_am   timestamptz not null default now()
);

create index token_konto on verifizierungstoken (konto_id);
-- Abgelaufene Token räumt ein Job nach 30 Tagen weg (Aufbewahrungsfristen,
-- Abschnitt 5 des Entwicklungsplans).
create index token_aufraeumen on verifizierungstoken (gueltig_bis) where verbraucht_am is null;
