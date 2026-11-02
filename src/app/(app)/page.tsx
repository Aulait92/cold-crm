import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STAGES } from "@/lib/crm";
import { Stat, TaskRow } from "@/components/ui";
import { dayBounds, openTasks } from "@/lib/queries";

export default async function HeutePage() {
  await connection();
  const { start, tomorrow } = dayBounds();
  const [tasks, stageCounts, sent, replies, mailNoCall, total] = await Promise.all([
    openTasks({ dueAt: { lt: tomorrow } }),
    prisma.contact.groupBy({ by: ["stage"], _count: true }),
    prisma.contact.count({ where: { campaigns: { some: { sentAt: { not: null } } } } }),
    prisma.contact.count({ where: { campaigns: { some: { replyCount: { gt: 0 } } } } }),
    prisma.contact.count({ where: { stage: "NEU", campaigns: { some: { sentAt: { not: null } } } } }),
    prisma.contact.count(),
  ]);
  const overdue = tasks.filter((t) => t.dueAt < start).length;
  const count = (id: string) => stageCounts.find((s) => s.stage === id)?._count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Heute</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Aufgaben fällig heute" value={tasks.length - overdue} href="/aufgaben" tone="amber" />
        <Stat label="Überfällig" value={overdue} href="/aufgaben" tone={overdue ? "red" : undefined} />
        <Stat label="Kontakte gesamt" value={total} href="/kontakte" />
        <Stat label="Cold Mail erhalten" value={sent} href="/kontakte?mail=sent" />
        <Stat label="Antworten auf Cold Mail" value={replies} href="/kontakte?mail=replied" tone="green" />
        <Stat label="Mail erhalten, noch nie angerufen" value={mailNoCall} href="/kontakte?mail=sent&stage=NEU" />
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
  );
}
