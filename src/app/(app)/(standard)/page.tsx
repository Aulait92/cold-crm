import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STAGES, shortName } from "@/lib/crm";
import { addDays, fmtDateTime } from "@/lib/dates";
import { Stat, TaskRow } from "@/components/ui";
import { dayBounds, openTasks } from "@/lib/queries";

export default async function HeutePage() {
  await connection();
  const { start, tomorrow } = dayBounds();
  const [tasks, stageCounts, sent, replies, mailNoCall, total, liConnected, liReplies, meetings, leads] = await Promise.all([
    openTasks({ dueAt: { lt: tomorrow } }),
    prisma.contact.groupBy({ by: ["stage"], _count: true }),
    prisma.contact.count({ where: { campaigns: { some: { sentAt: { not: null } } } } }),
    prisma.contact.count({ where: { campaigns: { some: { replyCount: { gt: 0 } } } } }),
    prisma.contact.count({ where: { stage: "NEU", campaigns: { some: { sentAt: { not: null } } } } }),
    prisma.contact.count(),
    prisma.contact.count({ where: { linkedinStatus: { in: ["VERNETZT", "NACHRICHT_GESENDET", "GEANTWORTET"] } } }),
    prisma.contact.count({ where: { linkedinStatus: "GEANTWORTET" } }),
    prisma.meeting.findMany({
      where: { status: "GEPLANT", startAt: { gte: start } },
      orderBy: { startAt: "asc" },
      take: 8,
      include: { contact: { select: { id: true, name: true, city: true } } },
    }),
    prisma.inboundLead.findMany({
      where: { createdAt: { gte: addDays(start, -7) } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { contact: { select: { id: true, name: true, city: true } } },
    }),
  ]);
  const overdue = tasks.filter((t) => t.dueAt < start).length;
  const count = (id: string) => stageCounts.find((s) => s.stage === id)?._count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Heute</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Aufgaben fällig heute" value={tasks.length - overdue} href="/aufgaben" tone="amber" />
        <Stat label="Überfällig" value={overdue} href="/aufgaben" tone={overdue ? "red" : undefined} />
        <Stat label="Kontakte gesamt" value={total} href="/kontakte" />
        <Stat label="Cold Mail erhalten" value={sent} href="/kontakte?mail=sent" />
        <Stat label="Antworten auf Cold Mail" value={replies} href="/kontakte?mail=replied" tone="green" />
        <Stat label="Mail erhalten, noch nie angerufen" value={mailNoCall} href="/kontakte?mail=sent&stage=NEU" />
        <Stat label="LinkedIn vernetzt" value={liConnected} href="/kontakte?li=VERNETZT" />
        <Stat label="LinkedIn-Antworten" value={liReplies} href="/kontakte?li=GEANTWORTET" tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="font-medium">Heute zu erledigen</h2>
            <Link href="/aufgaben" className="text-sm text-sky-700 hover:underline">Alle Aufgaben →</Link>
          </div>
          {tasks.length ? (
            <ul className="divide-y divide-slate-100">{tasks.slice(0, 30).map((t) => <TaskRow key={t.id} t={t} />)}</ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Nichts fällig. 🎉</p>
          )}
        </section>
        <div className="space-y-6">
        <section className="card p-4">
          <h2 className="mb-3 font-medium">Nächste Termine</h2>
          {meetings.length ? (
            <ul className="space-y-2 text-sm">
              {meetings.map((m) => (
                <li key={m.id}>
                  <Link href={`/kontakte/${m.contact.id}`} className="block rounded-lg px-2 py-1 hover:bg-slate-50">
                    <span className="font-medium">{fmtDateTime(m.startAt)}</span> · {shortName(m.contact.name)}
                    <span className="block text-xs text-slate-500">{m.title}{m.contact.city ? ` · ${m.contact.city}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Keine anstehenden Termine.</p>
          )}
        </section>
        {leads.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-3 font-medium">Neue Leads (7 Tage)</h2>
            <ul className="space-y-2 text-sm">
              {leads.map((l) => (
                <li key={l.id}>
                  <Link href={l.contact ? `/kontakte/${l.contact.id}` : "/import"} className="block rounded-lg px-2 py-1 hover:bg-slate-50">
                    <span className="font-medium">{l.contact ? shortName(l.contact.name) : l.name ?? l.email}</span>
                    <span className="block text-xs text-slate-500">
                      {fmtDateTime(l.createdAt)} · {l.source === "META_ADS" ? "Meta Ads" : "Website"}{l.campaign ? ` · ${l.campaign}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="card p-4">
          <h2 className="mb-3 font-medium">Pipeline</h2>
          <ul className="space-y-1.5">
            {STAGES.map((s) => (
              <li key={s.id}>
                <Link href={`/kontakte?stage=${s.id}`} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-50">
                  <span className={`badge ${s.color}`}>{s.label}</span>
                  <span className="tabular-nums text-sm">{count(s.id).toLocaleString("de-DE")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        </div>
      </div>
    </div>
  );
}
