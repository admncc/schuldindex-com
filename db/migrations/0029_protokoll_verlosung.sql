-- Protokollarten für Ziehung, Schulzugang und Meldungen.
--
-- Drei eingriffsintensive Vorgänge standen bisher nur an ihrer eigenen Zeile:
-- die Ziehung an `verlosungen.gezogen_von`, die Entscheidung über einen
-- Schulzugang an `schulzugaenge.entschieden_von`, die über eine Meldung nach
-- Art. 16 DSA an `meldungen.moderator_id`. Wer nachträglich fragt, was an
-- einem Abend geschehen ist, sieht im Protokoll keinen davon - und der
-- Aufbewahrungsbereich nennt das Protokoll ausdrücklich „den Nachweis, dass
-- über jede Ablehnung ein Mensch entschieden hat".
--
-- Die Einsicht in den Kontakt einer gewinnenden Person und die eines
-- Schulzugangs brauchen keine neue Art: Es ist dieselbe Einsicht wie am
-- Vorgang und gehört unter dieselbe Bezeichnung (`einsicht_kontakt`), damit
-- eine Auswertung „wer hat wann welchen Kontakt entschlüsselt" alle drei Wege
-- auf einmal findet.
alter type protokollaktion add value if not exists 'verlosung_gezogen';
alter type protokollaktion add value if not exists 'schulzugang_entschieden';
alter type protokollaktion add value if not exists 'meldung_entschieden';
alter type protokollaktion add value if not exists 'gewinn_benachrichtigt';
