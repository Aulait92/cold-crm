import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_LABEL, CUSTOMER_COLOR, CUSTOMER_LABEL, CUSTOMER_STAGES, LOSS_LABEL, LOSS_REASONS, STAGES, shortName } from "@/lib/crm";
import { dayKey, fmtDate, fmtDateTime, todayKey } from "@/lib/dates";
import { stripQuoted } from "@/lib/instantly";
import { StageBadge, TaskRow } from "@/components/ui";
import { ActivityForm } from "@/components/activity-form";
import { TaskForm } from "@/components/task-form";
import { addReplyManually, deleteContact, setReplySentiment, setStage, updateCustomer } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { taskInclude } from "@/lib/queries";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.contact.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { occurredAt: "desc" } },
      tasks: { include: taskInclude, orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }] },
      campaigns: { include: { campaign: true }, orderBy: { sentAt: "desc" } },
      emails: { orderBy: { sentAt: "desc" } },
    },
  });
  if (!c) notFound();
  const open = c.tasks.filter((t) => !t.doneAt);
  const done = c.tasks.filter((t) => t.doneAt).slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/kontakte" className="text-sm text-slate-500 hover:underline">← Kontakte</Link>
          <h1 className="mt-1 text-2xl font-semibold">{shortName(c.name)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <StageBadge stage={c.stage} />
            {c.customerStage && <span className={`badge ${CUSTOMER_COLOR[c.customerStage]}`}>Kunde: {CUSTOMER_LABEL[c.customerStage]}</span>}
            {c.lossReason && <span className="badge bg-rose-50 text-rose-700">{LOSS_LABEL[c.lossReason]}</span>}
            {c.competitor && <span className="badge bg-slate-100 text-slate-600">{c.competitor}</span>}
            <span>{c.street}, {c.zip} {c.city}</span>
            <span>{c.callAttempts} Anrufversuch{c.callAttempts === 1 ? "" : "e"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="btn-primary">📞 {c.phone}</a>}
          <a href={`mailto:${c.email}`} className="btn-ghost">✉️ {c.email}</a>
          {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="btn-ghost">Website ↗</a>}
          <form action={deleteContact}>
            <input type="hidden" name="contactId" value={c.id} />
            <ConfirmButton
              message={`„${shortName(c.name)}“ wirklich löschen? Verlauf, Aufgaben und Cold-Mail-Status werden mit gelöscht.`}
              className="btn-ghost text-rose-600 hover:bg-rose-50"
            >
              🗑 Löschen
            </ConfirmButton>
          </form>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <section className="card p-4">
            <h2 className="mb-3 font-medium">Aktivität erfassen</h2>
            <ActivityForm contactId={c.id} hasOpenTasks={open.length > 0} />
          </section>

          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 font-medium">
              Antworten auf Cold Mails <span className="font-normal text-slate-400">({c.emails.length})</span>
            </h2>
            {c.emails.length > 0 && (
              <ol className="divide-y divide-slate-100">
                {c.emails.map((e) => {
                  const body = e.text ?? "";
                  const main = stripQuoted(body);
                  const quoted = body.length > main.length + 5 ? body.slice(main.length).trim() : "";
                  return (
                    <li key={e.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge ${e.isAutoReply ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}>
                          {e.isAutoReply ? "Auto-Reply" : "Antwort"}
                        </span>
                        {!e.isAutoReply && e.sentiment && (
                          <span className={`badge ${e.sentiment === "POSITIV" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : e.sentiment === "NEGATIV" ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`}>
                            {e.sentiment === "POSITIV" ? "positiv" : e.sentiment === "NEGATIV" ? "negativ" : "neutral"}
                          </span>
                        )}
                        <span className="font-medium">{e.subject || "(ohne Betreff)"}</span>
                        <span className="ml-auto text-xs text-slate-400">{fmtDateTime(e.sentAt)}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {e.fromEmail}{e.campaign ? ` · Kampagne: ${e.campaign}` : ""}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-slate-700">{main || "(kein Text)"}</p>
                      {!e.isAutoReply && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                          Einordnung ändern:
                          {(["POSITIV", "NEUTRAL", "NEGATIV"] as const).filter((x) => x !== e.sentiment).map((x) => (
                            <form key={x} action={setReplySentiment}>
                              <input type="hidden" name="id" value={e.id} />
                              <input type="hidden" name="sentiment" value={x} />
                              <button className="btn-ghost px-2 py-0.5 text-xs">{x === "POSITIV" ? "👍 positiv" : x === "NEGATIV" ? "👎 negativ" : "neutral"}</button>
                            </form>
                          ))}
                        </div>
                      )}
                      {quoted && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-slate-400">Zitierten Verlauf anzeigen</summary>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{quoted}</p>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <details className="border-t border-slate-100">
              <summary className="cursor-pointer px-4 py-2 text-sm text-slate-500">Antwort manuell einfügen</summary>
              <form action={addReplyManually} className="space-y-2 px-4 pb-4">
                <input type="hidden" name="contactId" value={c.id} />
                <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                  <input name="subject" placeholder="Betreff" className="input" />
                  <input name="date" type="date" defaultValue={todayKey()} className="input" />
                </div>
                <textarea name="text" rows={4} required placeholder="Antworttext hier einfügen" className="input" />
                <button className="btn-ghost">Antwort speichern</button>
              </form>
            </details>
          </section>

          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Verlauf</h2>
            <ol className="divide-y divide-slate-100">
              {c.activities.map((a) => (
                <li key={a.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge bg-slate-100 text-slate-700">{ACTIVITY_LABEL[a.type]}</span>
                    {a.outcome && <span className="font-medium">{a.outcome}</span>}
                    <span className="ml-auto text-xs text-slate-400">{fmtDateTime(a.occurredAt)}</span>
                  </div>
                  {a.note && <p className="mt-1 whitespace-pre-wrap text-slate-600">{a.note}</p>}
                </li>
              ))}
              {!c.activities.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Noch keine Aktivitäten.</li>}
            </ol>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Aufgaben</h2>
            {open.length > 0 && <ul className="divide-y divide-slate-100">{open.map((t) => <TaskRow key={t.id} t={t} showContact={false} />)}</ul>}
            <div className="border-t border-slate-100 p-4"><TaskForm contactId={c.id} compact /></div>
            {done.length > 0 && (
              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-4 py-2 text-sm text-slate-500">Erledigt ({done.length})</summary>
                <ul className="divide-y divide-slate-100">{done.map((t) => <TaskRow key={t.id} t={t} showContact={false} />)}</ul>
              </details>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-medium">Cold Mails (Instantly)</h2>
            {c.campaigns.length ? (
              <ul className="space-y-2 text-sm">
                {c.campaigns.map((cl) => (
                  <li key={cl.id} className="rounded-lg bg-slate-50 p-3">
                    <div className="font-medium">{cl.campaign.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span>{cl.sentAt ? `Gesendet ${fmtDate(cl.sentAt)}` : "Noch nicht gesendet"}</span>
                      {cl.status && <span>Status: {cl.status}</span>}
                      <span>{cl.openCount}× geöffnet</span>
                      <span className={cl.replyCount ? "font-medium text-emerald-700" : ""}>{cl.replyCount}× Antwort</span>
                      {cl.clickCount > 0 && <span>{cl.clickCount}× Klick</span>}
                      {cl.bounced && <span className="text-rose-600">Bounced</span>}
                      {cl.unsubscribed && <span className="text-rose-600">Abgemeldet</span>}
                      {cl.interest && <span>Interesse: {cl.interest}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Hat noch keine Cold Mail bekommen.</p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-medium">Kunde</h2>
            <form key={`${c.customerStage}-${c.monthlyValue}-${c.products}`} action={updateCustomer} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="contactId" value={c.id} />
              <div>
                <label className="label">Kunden-Stufe</label>
                <select name="customerStage" defaultValue={c.customerStage ?? ""} className="input">
                  <option value="">{c.customerStage ? "–" : "Noch kein Kunde"}</option>
                  {CUSTOMER_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Monatswert (€)</label>
                <input name="monthlyValue" inputMode="numeric" defaultValue={c.monthlyValue ?? ""} placeholder="z.B. 1250" className="input" />
              </div>
              <div>
                <label className="label">Produkte</label>
                <input name="products" defaultValue={c.products ?? ""} placeholder="PKV, TKV, Leben" className="input" />
              </div>
              <div>
                <label className="label">Vertragsstart</label>
                <input name="contractStart" type="date" defaultValue={c.contractStart ? dayKey(c.contractStart) : ""} className="input" />
              </div>
              <button className="btn-ghost sm:col-span-2">{c.customerStage ? "Speichern" : "Als Kunde speichern"}</button>
            </form>
            {c.customerSince && <p className="mt-2 text-xs text-slate-500">Aktiver Kunde seit {fmtDate(c.customerSince)}</p>}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-medium">Stufe manuell ändern</h2>
            <form key={`${c.stage}-${c.lossReason}`} action={setStage} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="contactId" value={c.id} />
              <select name="stage" defaultValue={c.stage} className="input">
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select name="lossReason" defaultValue={c.lossReason ?? ""} className="input">
                <option value="">Verlustgrund (nur bei Verloren)</option>
                {LOSS_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <input name="competitor" defaultValue={c.competitor ?? ""} placeholder="Wettbewerber (z.B. LEAD.NOW)" className="input" />
              <button className="btn-ghost">Speichern</button>
            </form>
          </section>

          <section className="card p-4 text-sm">
            <h2 className="mb-3 font-medium">Stammdaten</h2>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
              <dt className="text-slate-500">Name</dt><dd>{c.name}</dd>
              {c.fax && (<><dt className="text-slate-500">Fax</dt><dd>{c.fax}</dd></>)}
              {c.ratingValue != null && (<><dt className="text-slate-500">Bewertung</dt><dd>★ {c.ratingValue} ({c.ratingCount})</dd></>)}
              {c.openingHours && (<><dt className="text-slate-500">Öffnungszeiten</dt><dd className="text-xs">{c.openingHours.replaceAll("Mo ", "Mo ").replaceAll("Tu ", "Di ").replaceAll("We ", "Mi ").replaceAll("Th ", "Do ").replaceAll("Fr ", "Fr ")}</dd></>)}
              {c.legacyStatus && (<><dt className="text-slate-500">Alter Status</dt><dd className="text-xs">{c.legacyStatus}</dd></>)}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
