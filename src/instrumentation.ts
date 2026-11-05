// Läuft einmal beim Serverstart: bereits gespeicherte Cold-Mail-Antworten
// nachprüfen (Eingangsbestätigungen/Abwesenheitsnotizen → keine Aufgabe).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { cleanupAutoReplies } = await import("@/lib/instantly");
  cleanupAutoReplies()
    .then((n) => n && console.log(`[cleanup] ${n} automatische Antworten nachträglich erkannt`))
    .catch((e) => console.error("[cleanup] fehlgeschlagen", e));
}
