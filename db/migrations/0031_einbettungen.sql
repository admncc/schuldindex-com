-- Fremde Skripte, die im Panel hinterlegt werden.
--
-- Das Einwilligungsbanner kommt von einem Anbieter (InMobi CMP), nicht von
-- uns, und die Reichweitenmessung haengt daran. Beides wird beim Anbieter
-- zusammengeklickt; im Code hat es nichts zu suchen, weil es sich aendert,
-- ohne dass sich das Portal aendert.
--
-- Zwei Dinge, die hier bewusst anders sind als bei den Einstellungen:
--
--  * Der Verlauf haelt den **vollen** alten und neuen Text fest, nicht nur
--    eine Zahl. Ein Skript, das allen Besuchern ausgeliefert wird, ist die
--    folgenreichste Eingabe im ganzen Panel - wer sie aendert, muss sich
--    danach daran messen lassen, und zwar am Wortlaut.
--  * `aktiv` ist von `inhalt` getrennt. Ein Banner abzuschalten, ohne den
--    eingerichteten Schnipsel zu verlieren, ist der Normalfall beim Testen;
--    wer dafuer loeschen muesste, haette ihn beim Wiedereinschalten nicht mehr.

create table einbettungen (
  -- 'einwilligung' oder 'messung'. Kein Enum: Ein weiterer Platz soll keine
  -- Migration kosten, und was gueltig ist, entscheidet `src/domain/einbettung.ts`.
  platz         text primary key,
  inhalt        text not null,
  aktiv         boolean not null default true,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid references moderatoren(id) on delete set null
);

comment on table einbettungen is
  'Fremde <script>-Schnipsel (Einwilligungsbanner, Reichweitenmessung). Geprueft in src/domain/einbettung.ts: nur <script>, nur https.';

create table einbettungsverlauf (
  id            bigserial primary key,
  platz         text not null,
  alter_inhalt  text,
  neuer_inhalt  text not null,
  alt_aktiv     boolean,
  neu_aktiv     boolean not null,
  moderator_id  uuid references moderatoren(id) on delete set null,
  geaendert_am  timestamptz not null default now()
);

create index einbettungsverlauf_zeit on einbettungsverlauf (geaendert_am desc);

comment on table einbettungsverlauf is
  'Vollstaendiger Wortlaut jeder Aenderung an einer Einbettung. Keine automatische Loeschung.';

alter type protokollaktion add value if not exists 'einbettung_geaendert';
