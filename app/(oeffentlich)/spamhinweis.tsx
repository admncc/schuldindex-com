/**
 * Der Hinweis auf den Spamordner.
 *
 * **Warum er an jeder dieser Stellen steht.** Von hier an kann das Portal
 * nichts mehr tun: Die Nachricht ist unterwegs, und ob sie im Posteingang
 * landet oder im Spam, entscheidet ein fremder Filter. Wer sie dort nicht
 * sucht, hält das Portal für kaputt - und die Bewertung, an der gerade sieben
 * Bildschirme Arbeit hängen, bleibt für immer unbestätigt.
 *
 * **Warum als ein Bauteil und nicht dreimal hingeschrieben.** Denselben
 * Hinweis gibt es nach der Abgabe, nach dem Anfordern eines Anmeldelinks und
 * nach dem Anfordern eines Schulzugangs. Drei Abschriften laufen auseinander,
 * sobald sich einmal etwas ändert - die Absenderadresse zum Beispiel.
 *
 * **Zur Farbe.** Rot, aber das Signalrot und nicht das Fehlerrot. Die
 * Fehlerfarbe sagt „etwas ist schiefgegangen", und das stimmt hier gerade
 * nicht: Es hat alles geklappt, nur der nächste Schritt liegt nicht mehr bei
 * uns. Das Signalrot ist genauso wenig zu übersehen und behauptet nichts
 * Falsches; beide Farbpaare sind auf Kontrast geprüft (hell und dunkel).
 *
 * Die Bitte, die Nachricht als „kein Spam" zu markieren, steht nicht aus
 * Höflichkeit da: Jede solche Markierung verbessert die Zustellung für alle
 * folgenden - das ist die einzige Stellschraube, die wir den Leuten in die
 * Hand geben können.
 */
export function Spamhinweis({ absender = "info@schulindex.com" }: { absender?: string }) {
  return (
    <p className="spamhinweis" role="note">
      <strong>Nichts da? Sieh im Spam-Ordner nach.</strong> Die erste Nachricht von uns landet
      dort öfter, als uns lieb ist. Such nach <strong>{absender}</strong> - und wenn du sie
      findest, markier sie als „kein Spam". Dann kommt die nächste im Posteingang an, auch bei
      allen anderen.
    </p>
  );
}
