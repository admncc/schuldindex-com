-- KI-Zusammenfassungen der Freitexte (Entwicklungsplan, Abschnitt 10.2).
--
-- Aufgehoben wird jeder Lauf, nicht nur der letzte — auch der eskalierte und der
-- fehlgeschlagene. Zwei Gründe: die Moderation muss sehen, was beanstandet
-- wurde, und bei einem veröffentlichten Text, der später beanstandet wird, muss
-- nachvollziehbar sein, aus wie vielen Bewertungen er wann entstanden ist. Für
-- eigene Inhalte haften wir; „das hat die KI geschrieben“ ist keine Auskunft.

create type zusammenfassungstatus as enum ('veroeffentlicht', 'eskaliert', 'fehlgeschlagen');

create table schul_zusammenfassungen (
  id               uuid primary key default gen_random_uuid(),
  schule_id        uuid not null references schulen(id) on delete cascade,
  status           zusammenfassungstatus not null,

  -- Bei 'fehlgeschlagen' leer: dann gab es keine Antwort, nur einen Grund.
  text             text,
  positive_themen  jsonb not null default '[]'::jsonb,
  kritische_themen jsonb not null default '[]'::jsonb,
  -- Was die Nachprüfung gefunden hat. Auch bei veröffentlichten Texten gefüllt,
  -- wenn Hinweise (nicht blockierend) angefallen sind.
  beanstandungen   jsonb not null default '[]'::jsonb,
  fehlergrund      text,

  -- Aus wie vielen Bewertungen mit Freitext der Text entstand. Steht so unter
  -- dem Text auf dem Schulprofil und entscheidet, wann neu gerechnet wird.
  aus_anzahl       int not null,
  modell           text not null,

  erstellt_am      timestamptz not null default now(),

  constraint text_bei_ausgabe check (status = 'fehlgeschlagen' or text is not null)
);

create index zusammenfassungen_schule on schul_zusammenfassungen (schule_id, erstellt_am desc);

-- Die Abfrage des Schulprofils: die jüngste veröffentlichte je Schule.
create index zusammenfassungen_veroeffentlicht
  on schul_zusammenfassungen (schule_id, erstellt_am desc)
  where status = 'veroeffentlicht';

-- Die Arbeitsliste der Moderation: was zuletzt hängen geblieben ist.
create index zusammenfassungen_eskaliert on schul_zusammenfassungen (erstellt_am desc)
  where status = 'eskaliert';
