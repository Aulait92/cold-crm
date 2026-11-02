// Grobe Einordnung einer Cold-Mail-Antwort. Instantly-Interessenstatus hat Vorrang,
// das hier ist der Fallback, wenn Instantly (noch) nichts gesetzt hat.

export type Sentiment = "POSITIV" | "NEGATIV" | "NEUTRAL";

const NEGATIVE = [
  /kein(en)? interesse/, /nicht interessiert/, /kein(en)? bedarf/, /nein,? danke/, /keine werbung/,
  /bitte (entfernen|austragen|löschen|streichen)/, /aus (dem|ihrem) verteiler/, /abmelden/, /unsubscribe/,
  /nicht mehr (kontaktieren|anschreiben|schreiben)/, /sehen sie (bitte )?(davon )?ab/, /keine (weiteren )?(e-?mails|nachrichten|anfragen)/,
  /brauchen? (keine|nichts)/, /sind (bereits|schon) (gut )?versorgt/, /kein(en)? kontakt/, /nicht relevant/, /spam/,
  /not interested/, /remove me/,
];
const POSITIVE = [
  /interess(e|ant|iert)/, /gerne?\b/, /ruf(en)? sie (mich )?(gerne )?an/, /anrufen/, /telefon(at|ieren)/, /termin/,
  /mehr (infos?|informationen|details)/, /klingt (gut|spannend|interessant)/, /(schicken|senden) sie (mir )?(gerne )?/,
  /unterlagen/, /preis(e|liste)?\b/, /was kostet/, /konditionen/, /wann (passt|haben sie zeit|können wir)/, /erreichbar/,
  /melden sie sich/, /lassen sie uns/, /gespräch/, /rückruf/, /call\b/, /meeting/,
];

export function classifyReply(text: string | null | undefined, subject?: string | null): Sentiment {
  const t = `${subject ?? ""}\n${text ?? ""}`.toLowerCase();
  if (NEGATIVE.some((r) => r.test(t))) return "NEGATIV";
  if (POSITIVE.some((r) => r.test(t))) return "POSITIV";
  return "NEUTRAL";
}

/** Instantly-Interessenstatus (lt_interest_status / i_status) → Sentiment, null wenn unbekannt */
export function sentimentFromInstantly(status: number | null | undefined): Sentiment | null {
  if (status == null) return null;
  if ([1, 2, 3, 4].includes(status)) return "POSITIV"; // Interessiert, Termin gebucht/stattgefunden, Gewonnen
  if ([-1, -2, -3].includes(status)) return "NEGATIV"; // Kein Interesse, falsche Person, verloren
  return null; // 0 = Abwesend, -4 = No-Show, Custom-Labels
}
