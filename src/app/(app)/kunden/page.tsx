import Link from "next/link";
import clsx from "clsx";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_STAGES, shortName } from "@/lib/crm";
import { dayKey, fmtDate, relDay, todayKey } from "@/lib/dates";
import { dragCustomer, moveCustomer } from "@/app/actions";
import { Kanban, type KanbanCard, type KanbanColumn } from "@/components/kanban";
import { Stat } from "@/components/ui";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default async function KundenPage() {
  await connection();
  // Bereits gewonnene Kontakte (z.B. aus dem Listen-Import) in die Kunden-Pipeline übernehmen
  await prisma.contact.updateMany({ where: { stage: "GEWONNEN", customerStage: null }, data: { customerStage: "VERTRAG" } });
  const customers = await prisma.contact.findMany({
    where: { customerStage: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, city: true, phone: true, customerStage: true, products: true, monthlyValue: true, contractStart: true, customerSince: true,
      tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { title: true, dueAt: true } },
    },
  });
  const sum = (ids: string[]) => customers.filter((c) => ids.includes(c.customerStage!)).reduce((a, c) => a + (c.monthlyValue ?? 0), 0);
  const count = (ids: string[]) => customers.filter((c) => ids.includes(c.customerStage!)).length;

  const columns: KanbanColumn[] = CUSTOMER_STAGES.map((s) => ({ ...s, count: customers.filter((c) => c.customerStage === s.id).length }));
  const cards: KanbanCard[] = customers.map((c) => {
    const task = c.tasks[0];
    const idx = CUSTOMER_STAGES.findIndex((x) => x.id === c.customerStage);
    return {
      id: c.id,
      column: c.customerStage!,
      value: c.monthlyValue,
      node: (
        <div className="card p-3 hover:border-slate-300">
          <Link href={`/kontakte/${c.id}`} draggable={false} className="block text-sm font-medium leading-tight hover:underline">{shortName(c.name)}</Link>
          <div className="mt-0.5 text-xs text-slate-500">{c.city}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.monthlyValue != null && <span className="badge bg-emerald-50 text-emerald-700">{eur(c.monthlyValue)}/Monat</span>}
            {c.products?.split(",").map((p) => p.trim()).filter(Boolean).map((p) => (
              <span key={p} className="badge bg-slate-100 text-slate-600">{p}</span>
            ))}
          </div>
          {(c.contractStart || c.customerSince) && (
            <div className="mt-1 text-xs text-slate-500">
              {c.contractStart && `Start ${fmtDate(c.contractStart)}`}
              {c.customerSince && ` · aktiv seit ${fmtDate(c.customerSince)}`}
            </div>
          )}
          {task && (
            <div className={clsx("mt-2 text-xs", dayKey(task.dueAt) < todayKey() ? "text-rose-600" : dayKey(task.dueAt) === todayKey() ? "text-amber-700" : "text-slate-500")}>
              ⏰ {task.title} · {relDay(task.dueAt)}
            </div>
          )}
          {/* Pfeile als Alternative zu Drag & Drop (z.B. auf dem Handy) */}
          <div className="mt-2 flex justify-between">
            {idx > 0 ? (
              <form action={moveCustomer}>
                <input type="hidden" name="contactId" value={c.id} />
                <input type="hidden" name="dir" value="-1" />
                <button className="btn-ghost px-2 py-0.5 text-xs" title={`Zurück zu ${CUSTOMER_STAGES[idx - 1].label}`}>←</button>
              </form>
            ) : <span />}
            {idx < CUSTOMER_STAGES.length - 1 && (
              <form action={moveCustomer}>
                <input type="hidden" name="contactId" value={c.id} />
                <input type="hidden" name="dir" value="1" />
                <button className="btn-ghost px-2 py-0.5 text-xs">{CUSTOMER_STAGES[idx + 1].label} →</button>
              </form>
            )}
          </div>
        </div>
      ),
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Kunden-Pipeline</h1>
        <p className="text-sm text-slate-500">Karten per Drag &amp; Drop verschieben oder die Pfeile nutzen.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Aktive Kunden" value={count(["AKTIV"])} tone="green" />
        <Stat label="Monatsumsatz aktiv" value={eur(sum(["AKTIV"]))} tone="green" />
        <Stat label="In Vertrag / Onboarding / Test" value={count(["VERTRAG", "ONBOARDING", "TEST"])} tone="amber" />
        <Stat label="Potenzial in Vorbereitung" value={eur(sum(["VERTRAG", "ONBOARDING", "TEST"]))} />
      </div>

      <Kanban columns={columns} cards={cards} move={dragCustomer} showValue />
      <p className="text-sm text-slate-500">
        Kontakte landen hier automatisch, sobald sie in der Akquise auf „Gewonnen“ gesetzt werden. Produkte, Monatswert und Vertragsstart pflegst du auf der Kontaktseite.
      </p>
    </div>
  );
}
