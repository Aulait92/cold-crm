import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LOSS_LABEL, STAGES, shortName } from "@/lib/crm";
import { relDay, dayKey, todayKey } from "@/lib/dates";
import clsx from "clsx";

const PER_COLUMN = 40;

export default async function PipelinePage() {
  await connection();
  const counts = await prisma.contact.groupBy({ by: ["stage"], _count: true });
  const columns = await Promise.all(
    STAGES.map(async (s) => ({
      ...s,
      count: counts.find((c) => c.stage === s.id)?._count ?? 0,
      contacts:
        s.id === "NEU"
          ? []
          : await prisma.contact.findMany({
              where: { stage: s.id },
              orderBy: { updatedAt: "desc" },
              take: PER_COLUMN,
              select: {
                id: true, name: true, city: true, lossReason: true, competitor: true,
                tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { title: true, dueAt: true } },
                campaigns: { select: { sentAt: true, replyCount: true } },
              },
            }),
    })),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Pipeline</h1>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <section key={col.id} className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/80 p-2">
            <header className="flex items-center justify-between px-1 pb-2">
              <span className={`badge ${col.color}`}>{col.label}</span>
              <Link href={`/kontakte?stage=${col.id}`} className="text-xs tabular-nums text-slate-500 hover:underline">
                {col.count.toLocaleString("de-DE")}
              </Link>
            </header>
            <p className="px-1 pb-2 text-xs text-slate-500">{col.hint}</p>
            <div className="space-y-2">
              {col.id === "NEU" && (
                <Link href="/kontakte?stage=NEU" className="card block p-3 text-sm text-slate-600 hover:bg-slate-50">
                  {col.count.toLocaleString("de-DE")} Agenturen noch nicht kontaktiert → Liste öffnen
                  <br />
                  <span className="text-xs text-slate-400">Tipp: Filter „Cold Mail erhalten“ für warme Anrufe</span>
                </Link>
              )}
              {col.contacts.map((c) => {
                const task = c.tasks[0];
                const mailed = c.campaigns.some((x) => x.sentAt);
                const replied = c.campaigns.some((x) => x.replyCount > 0);
                return (
                  <Link key={c.id} href={`/kontakte/${c.id}`} className="card block p-3 hover:border-slate-300">
                    <div className="text-sm font-medium leading-tight">{shortName(c.name)}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{c.city}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {replied ? <span className="badge bg-emerald-100 text-emerald-800">Mail beantwortet</span> : mailed && <span className="badge bg-sky-50 text-sky-700">Cold Mail</span>}
                      {c.lossReason && <span className="badge bg-rose-50 text-rose-700">{LOSS_LABEL[c.lossReason]}</span>}
                      {c.competitor && <span className="badge bg-slate-100 text-slate-600">{c.competitor}</span>}
                    </div>
                    {task && (
                      <div className={clsx("mt-2 text-xs", dayKey(task.dueAt) < todayKey() ? "text-rose-600" : dayKey(task.dueAt) === todayKey() ? "text-amber-700" : "text-slate-500")}>
                        ⏰ {task.title} · {relDay(task.dueAt)}
                      </div>
                    )}
                  </Link>
                );
              })}
              {col.id !== "NEU" && col.count > PER_COLUMN && (
                <Link href={`/kontakte?stage=${col.id}`} className="block px-1 text-xs text-sky-700 hover:underline">
                  + {col.count - PER_COLUMN} weitere
                </Link>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
