# Cold CRM

Einfaches CRM für die Cold-Akquise der Allianz-Agenturen: Anruf-Pipeline, Aufgaben und Cold-Mail-Status aus Instantly.

## Was es kann

- **Heute**: fällige/überfällige Aufgaben, Pipeline-Zahlen, Cold-Mail-Kennzahlen („Mail erhalten, noch nie angerufen“ = warme Anrufliste).
- **Aufgaben**: Überfällig / Heute / Morgen / 7 Tage / Später, Filter nach Art (Anrufen, Nachfassen, Unterlagen senden, Termin), abhaken, +1 Tag / +1 Woche verschieben.
- **Kunden-Pipeline**: Vertrag versendet → Onboarding → Testphase → Aktiv → Pausiert → Gekündigt, mit Produkten, Monatswert und Vertragsstart. Gewonnene Kontakte landen automatisch in „Vertrag versendet“.
- **Akquise-Pipeline**: Neu → Nicht erreicht → Wiedervorlage → Interesse/Unterlagen → Termin → Gewonnen, dazu Später, Verloren (mit Grund) und Ungültig.
- **Kontakt**: Aktivität erfassen (Anruf/E-Mail/Notiz). Das Ergebnis setzt die Stufe und schlägt die Folgeaufgabe vor, z.B. „Unterlagen gesendet“ → „Nachfassen“ in 3 Werktagen. Verlauf, Cold-Mail-Status je Kampagne.
- **Import**: Agenturliste als CSV (Numbers: Ablage → Exportieren → CSV). Die alten Freitext-Status werden automatisch in Stufe, Verlustgrund, Wettbewerber und Folgeaufgabe übersetzt (`src/lib/legacy.ts`).
- **Instantly**: Abgleich per API v2 (alle Kampagnen + Leads, Zuordnung per E-Mail), CSV-Upload als Fallback, Webhook für Live-Updates (`/api/instantly/webhook?token=…`). Antworten (Betreff + Text) werden am Kontakt gespeichert und erzeugen automatisch eine Aufgabe. Antworten aus anderen Postfächern lassen sich auf der Kontaktseite manuell einfügen.

- **LinkedIn (Waalaxy)**: Webhook (`/api/waalaxy/webhook?token=…`, Schritt „CRM Sync“) und CSV-Export. Zuordnung über LinkedIn-URL, E-Mail oder Name (+ Ort). Status: Anfrage gesendet → Vernetzt → Nachricht gesendet → Geantwortet; Antworten erzeugen eine Aufgabe.

## Lokal starten

```bash
cp .env.example .env   # Werte eintragen
npm install
npm run db:push
npm run dev
```

## Deployment (z.B. Railway)

Postgres anlegen, Dockerfile deployen, Variablen setzen: `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -hex 32`), `APP_PASSWORD`, `INSTANTLY_API_KEY`, `WEBHOOK_TOKEN`. Das Schema wird beim Start per `prisma db push` angelegt.
