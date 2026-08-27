-- Kennzahlen des Klickverhaltens mitspeichern.
--
-- Gemessen wird im Formular jeder Klick auf eine Antwort, millisekundengenau.
-- Gespeichert wird davon **nicht die Klickfolge**, sondern nur, was aus ihr
-- folgt: wie viele Abstände es waren, wie groß der mittlere Abstand war und wie
-- stark die Abstände streuten.
--
-- Der Unterschied ist kein formaler. Die Folge selbst wäre ein
-- Verhaltensprotokoll — wie lange jemand bei der Frage nach Mobbing gezögert
-- hat, ließe sich daraus ablesen. Das geht niemanden etwas an, uns
-- eingeschlossen. Die drei Kennzahlen tragen diese Aussage nicht und reichen
-- für den Zweck: der Moderation zeigen, worauf ein Signal beruhte.

alter table bewertungen
  add column klickmuster jsonb;

comment on column bewertungen.klickmuster is
  'Kennzahlen des Klickverhaltens bei der Abgabe: {anzahl, medianMs, streuung}. Niemals die Klickfolge selbst.';
