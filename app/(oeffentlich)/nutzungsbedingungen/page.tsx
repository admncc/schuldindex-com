import type { Metadata } from "next";
import { MINDESTZAHL_PROFIL, MINDESTZAHL_RANGLISTE } from "@/domain/aggregation";
import { SCHWELLE_KM } from "@/domain/geopruefung";

export const metadata: Metadata = { title: "Nutzungsbedingungen" };

export default function Nutzungsbedingungenseite() {
  return (
    <section className="abschnitt rechtstext">
      <h1>Nutzungsbedingungen</h1>
      <p className="stand">Stand: 26. August 2026</p>

      <h2>1. Worum es geht</h2>
      <p>
        SCHULINDEX sammelt Bewertungen zu Schulen in Deutschland und veröffentlicht sie in
        zusammengefasster Form. Die Nutzung ist kostenlos. Ein Anspruch auf Veröffentlichung einer
        einzelnen Bewertung besteht nicht.
      </p>

      <h2>2. Wer bewerten darf</h2>
      <ul>
        <li>
          Wer die Schule aus eigener Anschauung kennt: als Schülerin oder Schüler, als Elternteil,
          als Lehrkraft oder als Ehemalige.
        </li>
        <li>
          Bist du unter 16, brauchst du das Einverständnis deiner Eltern. Das bestätigst du beim
          Bewerten.
        </li>
        <li>
          Je Schule und Konto ist <strong>eine</strong> Bewertung möglich. Du kannst sie später
          ändern; veröffentlicht ist immer die aktuelle Fassung.
        </li>
      </ul>

      <h2>3. Was nicht geht</h2>
      <ul>
        <li>
          <strong>Namen.</strong> Schreib über die Schule, nicht über einzelne Menschen. Lehrkräfte,
          Mitschülerinnen und Schulleitungen dürfen nicht erkennbar sein - auch nicht über Fach,
          Klasse oder Funktion.
        </li>
        <li>
          <strong>Beschimpfungen und Drohungen.</strong> Kritik ist erwünscht, auch scharfe.
          Beleidigungen sind es nicht.
        </li>
        <li>
          <strong>Unwahre Tatsachenbehauptungen.</strong> Was du erlebt hast, ist deine Erfahrung;
          was du behauptest, muss stimmen.
        </li>
        <li>
          <strong>Werbung und Verweise</strong> auf andere Angebote.
        </li>
        <li>
          <strong>Bewertungen im Auftrag.</strong> Schulen, die Bewertungen organisieren oder
          bezahlen, verstoßen gegen diese Bedingungen; wir entfernen solche Bewertungen und
          weisen es auf dem Schulprofil aus.
        </li>
      </ul>

      <h2>4. Wie wir prüfen</h2>
      <p>
        Jede Bewertung braucht eine Bestätigung über Telefon oder E-Mail. Automatische Prüfungen
        halten Auffälliges zurück - etwa Abgaben aus mehr als {SCHWELLE_KM} Kilometern Entfernung,
        auffällige Antwortmuster oder viele Abgaben in kurzer Zeit. Über die Veröffentlichung
        entscheidet dann ein Mensch. Freitexte werden nie wörtlich veröffentlicht, sondern
        zusammengefasst.
      </p>

      <h2>5. Was wir veröffentlichen</h2>
      <ul>
        <li>
          Eine Wertung zeigen wir erst ab {MINDESTZAHL_PROFIL} Bewertungen, in den Ranglisten erst
          ab {MINDESTZAHL_RANGLISTE}. Darunter ließe sich aus wenigen Stimmen eine Aussage über
          eine ganze Schule machen.
        </li>
        <li>Einzelne Bewertungen sind öffentlich nicht einsehbar, auch nicht anonymisiert.</li>
        <li>
          Die Zusammenfassung der Freitexte ist unser eigener Text. Sie ist als automatisch
          erstellt gekennzeichnet und nennt die Zahl der zugrunde liegenden Bewertungen.
        </li>
      </ul>

      <h2>6. Deine Rechte an deinem Text</h2>
      <p>
        Der Text bleibt deiner. Du räumst uns das einfache Recht ein, ihn zur Erstellung von
        Zusammenfassungen zu verarbeiten und diese zu veröffentlichen. Löschst du deine Bewertung,
        rechnen wir die Zusammenfassung neu.
      </p>

      <h2>7. Für Schulen</h2>
      <p>
        Hältst du eine Veröffentlichung für rechtswidrig, nutz bitte{" "}
        <a href="/inhalt-melden">das Meldeformular</a>. Wir prüfen jede Meldung und teilen die
        Entscheidung mit. Ein Anspruch auf Entfernung sachlicher Kritik besteht nicht.
      </p>

      <h2>8. Haftung</h2>
      <p>
        Für die Inhalte einzelner Bewertungen sind deren Verfasser verantwortlich. Für die von uns
        erstellten Zusammenfassungen und für die Schulstammdaten haften wir selbst. Wir bemühen
        uns um Richtigkeit, können aber nicht ausschließen, dass Angaben veraltet sind - meld uns
        Fehler, wir korrigieren sie.
      </p>

      <h2>9. Änderungen</h2>
      <p>
        Wir können diese Bedingungen ändern. Über wesentliche Änderungen informieren wir auf der
        Startseite; die jeweils gültige Fassung steht hier mit Datum.
      </p>

      <h2>10. Recht und Gerichtsstand</h2>
      <p>Es gilt deutsches Recht. Zwingende Verbraucherschutzvorschriften bleiben unberührt.</p>
    </section>
  );
}
