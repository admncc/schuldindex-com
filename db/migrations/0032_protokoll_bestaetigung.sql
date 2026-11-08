-- Protokollart fuer den erneuten Versand eines Bestaetigungslinks.
--
-- Eigene Art und nicht 'einsicht_kontakt': Wer den Link erneut schickt, hat
-- den Kontakt nicht gelesen, sondern benutzt - der Unterschied gehoert ins
-- Protokoll, weil er den Vorwurf unterscheidet, der sich daraus ableiten
-- liesse.
alter type protokollaktion add value if not exists 'bestaetigung_erneut';

-- Bestaetigung von Hand: ersetzt den Klick auf den Link, nicht die Pruefung
-- danach. Eigene Art, damit sich im Nachhinein beantworten laesst, welche
-- Konten ohne echten Klick bestaetigt wurden - und von wem.
alter type protokollaktion add value if not exists 'bestaetigung_von_hand';
