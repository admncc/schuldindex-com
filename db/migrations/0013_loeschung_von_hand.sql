-- Löschung nur noch auf ausdrückliche Entscheidung.
--
-- Vorgabe des Auftraggebers vom 27.08.2026: keine automatische Löschung. Die
-- Fristen der Datenschutzerklärung bleiben — was sich ändert, ist, wer sie
-- auslöst. Statt eines Zeitplans stößt eine Person in der Moderation jede
-- Löschung einzeln an und sieht vorher, wie viele Datensätze betroffen sind.
--
-- Damit das nachvollziehbar bleibt, bekommt das Moderationsprotokoll einen
-- eigenen Eintrag dafür: Wer hat wann welche Frist ausgeführt.

alter type protokollaktion add value if not exists 'aufbewahrung_ausgefuehrt';
