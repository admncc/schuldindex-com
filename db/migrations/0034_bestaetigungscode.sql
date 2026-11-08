-- Fehlversuche je Bestaetigungscode zaehlen.
--
-- Der Code hat sechs Stellen, also eine Million Moeglichkeiten - in einer
-- Stunde durchprobiert, wenn niemand mitzaehlt. Was ihn traegt, sind drei
-- Dinge zusammen: zehn Minuten Gueltigkeit, die Bindung an das Konto (die
-- Kennung geht in den Abdruck ein) und dieser Zaehler. Bei fuenf Versuchen
-- liegt die Trefferchance bei 5 zu 1.000.000.
--
-- Gezaehlt wird in derselben Transaktion, in der verglichen wird
-- (src/db/bestaetigung.ts). Stuende der Zaehler daneben, liessen sich durch
-- gleichzeitige Anfragen beliebig viele Versuche unterbringen, bevor der
-- erste gezaehlt ist.
alter table verifizierungstoken
  add column if not exists versuche int not null default 0;

comment on column verifizierungstoken.versuche is
  'Fehlversuche bei einem Bestaetigungscode (zweck = code). Ab der Hoechstzahl ist der Code verbraucht.';
