-- Vermerkt, wann zuletzt versucht wurde, eine Schule zu geokodieren.
--
-- Ohne diesen Vermerk endet der Nachgeocodierungs-Lauf nie: er holt sich die
-- Schulen ohne Koordinate, scheitert bei denen, die sich nicht auflösen lassen,
-- und findet beim nächsten Durchgang exakt dieselben wieder. Beobachtet beim
-- ersten vollständigen Lauf — er blieb bei den letzten 71 Schulen hängen und
-- drehte sich weiter, ohne Fortschritt zu machen.
--
-- Mit dem Vermerk endet der Lauf, und ein späterer Versuch bleibt trotzdem
-- möglich: OpenStreetMap wächst, und was heute nicht auffindbar ist, kann es
-- in einem Monat sein.

alter table schulen add column geokodierung_versucht_am timestamptz;

create index schulen_geokodierung_offen on schulen (geokodierung_versucht_am nulls first)
  where lat is null;
