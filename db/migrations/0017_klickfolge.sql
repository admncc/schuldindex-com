-- Die vollständige Klickfolge aufbewahren.
--
-- Entscheidung vom 27.08.2026: maximale Auswertbarkeit. Bis hierher wurden nur
-- drei Kennzahlen gespeichert (0016). Der Einwand dagegen wiegt schwerer als
-- der Vorteil der Sparsamkeit: Ob 400 ms und 15 % die richtigen Schwellen sind,
-- weiß vor dem Betrieb niemand, und ein Detektor lässt sich nicht an Zahlen
-- verbessern, die man schon zusammengefasst hat. Für den Vergleich ganzer
-- Verläufe untereinander — dieselbe Handschrift über viele Abgaben hinweg —
-- braucht es ohnehin die Folge.
--
-- Was damit entsteht, steht hier ausdrücklich, damit es niemand später
-- überrascht: Die Fragen erscheinen in fester Reihenfolge. Aus dem n-ten
-- Abstand lässt sich also ablesen, wie lange jemand vor der n-ten Frage
-- gezögert hat — auch vor den Fragen zu Mobbing, Gewalt und Angst. Diese Spalte
-- ist damit eine personenbezogene Verhaltensspur und kein Messrauschen.
--
-- Daraus folgt dreierlei, und alles drei ist umgesetzt:
--   1. Die Datenschutzerklärung nennt sie (Abschnitt 3.2).
--   2. Es gibt eine eigene Aufbewahrungsregel `klickfolgen_loeschen`, die die
--      Spalte nach zwölf Monaten leert, ohne die Bewertung anzutasten.
--   3. Sie steht als vierter Punkt auf der Liste für die Kanzlei.

alter table bewertungen
  add column klickfolge jsonb;

comment on column bewertungen.klickfolge is
  'Abstaende zwischen den Antwortklicks in Millisekunden, in Klickreihenfolge. Personenbezogene Verhaltensspur: ueber die feste Fragereihenfolge auf einzelne Fragen beziehbar. Aufbewahrung siehe domain/aufbewahrung.ts (klickfolgen_loeschen).';
