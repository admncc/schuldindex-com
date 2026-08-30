-- Kennzeichnet die vorhandenen Testbestände als Demodaten.
--
-- `ist_demo` kam erst mit Migration 0018. Alles, was davor zum Ausprobieren
-- eingespielt wurde - die Saatdaten der Ranglisten, die Prüfkonten, die
-- Verlosungs- und Sammelaktionstests -, trug die Kennzeichnung deshalb nicht.
-- Für die Löschfunktion im Panel waren diese Datensätze damit unsichtbar: Sie
-- meldete „keine Demodaten“, während Ranglisten, Karte und Schulwertungen
-- vollständig aus erfundenen Bewertungen bestanden.
--
-- Erkennbar sind sie am Kontakt-Hash: Echte Konten tragen dort einen
-- base64url-kodierten HMAC ohne Bindestrich, die Testbestände ein sprechendes
-- Präfix mit laufender Nummer.
--
-- **Gelöscht wird hier nichts.** Die Kennzeichnung macht die Datensätze nur für
-- die Löschfunktion im Panel sichtbar; ob und wann gelöscht wird, entscheidet
-- ein Mensch dort.
update konten
set ist_demo = true
where not ist_demo
  and kontakt_hash ~ '^(rang|pruef|verlosung|sammel|demo)-';

update bewertungen b
set ist_demo = true
where not b.ist_demo
  and exists (select 1 from konten k where k.id = b.konto_id and k.ist_demo);
