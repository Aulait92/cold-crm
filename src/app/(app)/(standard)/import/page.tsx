import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ContactsImport, InstantlyCsvImport, InstantlySync, WaalaxyCsvImport } from "@/components/import-forms";
import { fmtDateTime } from "@/lib/dates";
import { LI_LABEL } from "@/lib/linkedin";
import Link from "next/link";

export default async function ImportPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const [contacts, campaigns, liEvents, liCount] = await Promise.all([
    prisma.contact.count(),
    prisma.campaign.findMany({ include: { _count: { select: { leads: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.linkedInEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { contact: { select: { id: true, name: true } } } }),
    prisma.contact.count({ where: { linkedinStatus: { not: null } } }),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold">Import & Instantly</h1>

      <section className="card space-y-3 p-5">
        <h2 className="font-medium">1. Agenturliste importieren</h2>
        <p className="text-sm text-slate-600">
          Funktioniert mit der Cold-Calling-Liste (Numbers) und mit der Mailing-Liste aus Instantly
          (inkl. Ansprechpartner, Teamgröße, Potenzial-Score). Neue Agenturen werden angelegt, bestehende ergänzt –
          Pipeline, Aufgaben und Verlauf bleiben erhalten.
        </p>
        <p className="text-sm text-slate-600">
          In Numbers: <b>Ablage → Exportieren → CSV</b>. Spalten werden über die Kopfzeile erkannt (name, email, phone, …).
          Die Spalte ohne Überschrift nach „description“ wird als Anruf-Status gelesen und automatisch in Pipeline-Stufe,
          Verlustgrund und Folgeaufgabe übersetzt. Erneuter Import ist sicher: Kontakte werden über die E-Mail erkannt.
        </p>
        <p className="text-sm text-slate-500">Aktuell {contacts.toLocaleString("de-DE")} Kontakte in der Datenbank.</p>
        <ContactsImport />
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-medium">2. Cold Mails aus Instantly abgleichen</h2>
        <p className="text-sm text-slate-600">
          Holt alle Kampagnen und Leads über die Instantly API v2 und ordnet sie per E-Mail den Kontakten zu
          (gesendet, geöffnet, geantwortet, bounced). Neue Antworten erzeugen automatisch eine Aufgabe.
        </p>
        <InstantlySync hasKey={!!process.env.INSTANTLY_API_KEY} />
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Alternative: CSV-Export aus Instantly hochladen</summary>
          <div className="mt-3"><InstantlyCsvImport /></div>
        </details>
      </section>

      <section className="card space-y-2 p-5 text-sm">
        <h2 className="font-medium">3. Live-Updates per Webhook (optional)</h2>
        <p className="text-slate-600">
          In Instantly unter <b>Settings → Integrations → Webhooks</b> diese URL für alle Events eintragen
          (benötigt den Hyper-Growth-Plan). Dann landen gesendete Mails und Antworten sofort im CRM.
        </p>
        <code className="block overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">
          {proto}://{host}/api/instantly/webhook?token={process.env.WEBHOOK_TOKEN ? "<WEBHOOK_TOKEN>" : "(WEBHOOK_TOKEN setzen)"}
        </code>
      </section>

      <section className="card space-y-3 p-5 text-sm">
        <h2 className="font-medium">4. LinkedIn (Waalaxy)</h2>
        <p className="text-slate-600">
          Waalaxy hat keine API, liefert aber Daten per Webhook und CSV. Zuordnung zu den Kontakten über LinkedIn-Profil-URL,
          E-Mail oder Vor- und Nachname (bei gleichen Namen zusätzlich über den Ort). Der LinkedIn-Status geht nur vorwärts:
          Anfrage gesendet → Vernetzt → Nachricht gesendet → Geantwortet. Antworten erzeugen eine Aufgabe.
          Aktuell {liCount.toLocaleString("de-DE")} Kontakte mit LinkedIn-Status.
        </p>
        <div>
          <h3 className="mb-1 font-medium text-slate-700">a) Webhook (automatisch)</h3>
          <p className="text-slate-600">
            In Waalaxy in der Kampagne einen Schritt <b>„CRM Sync“</b> hinzufügen (bzw. die Synchronisation bei Antwort aktivieren)
            und als Ziel „Webhook / Zapier“ mit dieser URL eintragen:
          </p>
          <code className="mt-1 block overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">
            {proto}://{host}/api/waalaxy/webhook?token={process.env.WEBHOOK_TOKEN ? "<WEBHOOK_TOKEN>" : "(WEBHOOK_TOKEN setzen)"}
          </code>
        </div>
        <div>
          <h3 className="mb-1 font-medium text-slate-700">b) CSV-Export (manuell, alle Waalaxy-Pläne)</h3>
          <p className="mb-2 text-slate-600">In Waalaxy die Prospect-Liste oder Kampagne als CSV exportieren und hier hochladen.</p>
          <WaalaxyCsvImport />
        </div>
        {liEvents.length > 0 && (
          <div>
            <h3 className="mb-1 font-medium text-slate-700">Letzte Webhook-Ereignisse</h3>
            <ul className="divide-y divide-slate-100">
              {liEvents.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="text-xs text-slate-400">{fmtDateTime(e.createdAt)}</span>
                  <span>{e.name ?? "?"}{e.company ? ` · ${e.company}` : ""}</span>
                  {e.status && <span className="badge bg-slate-100 text-slate-600">{LI_LABEL[e.status] ?? e.status}</span>}
                  {e.contact ? (
                    <Link href={`/kontakte/${e.contact.id}`} className="ml-auto text-xs text-sky-700 hover:underline">→ zugeordnet</Link>
                  ) : (
                    <span className="ml-auto text-xs text-amber-700">nicht zugeordnet</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {campaigns.length > 0 && (
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-medium">Kampagnen</h2>
          <ul className="divide-y divide-slate-100">
            {campaigns.map((c) => (
              <li key={c.id} className="flex justify-between py-1.5">
                <span>{c.name}</span>
                <span className="tabular-nums text-slate-500">{c._count.leads} Kontakte</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
