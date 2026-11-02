import Link from "next/link";
import clsx from "clsx";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_STAGES, shortName } from "@/lib/crm";
import { dayKey, fmtDate, relDay, todayKey } from "@/lib/dates";
import { moveCustomer } from "@/app/actions";
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

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Kunden-Pipeline</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Aktive Kunden" value={count(["AKTIV"])} tone="green" />
        <Stat label="Monatsumsatz aktiv" value={eur(sum(["AKTIV"]))} tone="green" />
        <Stat label="In Vertrag / Onboarding / Test" value={count(["VERTRAG", "ONBOARDING", "TEST"])} tone="amber" />
        <Stat label="Potenzial in Vorbereitung" value={eur(sum(["VERTRAG", "ONBOARDING", "TEST"]))} />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {CUSTOMER_STAGES.map((col, idx) => {
          const items = customers.filter((c) => c.customerStage === col.id);
          const value = items.reduce((a, c) => a + (c.monthlyValue ?? 0), 0);
          return (
            <section key={col.id} className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/80 p-2">
              <header className="flex items-center justify-between px-1 pb-1">
                <span className={`badge ${col.color}`}>{col.label}</span>
                <span className="text-xs tabular-nums text-slate-500">{items.length}{value ? ` · ${eur(value)}/M` : ""}</span>
              </header>
              <p className="px-1 pb-2 text-xs text-slate-500">{col.hint}</p>
              <div className="space-y-2">
                {items.map((c) => {
                  const task = c.tasks[0];
                  return (
                    <div key={c.id} className="card p-3">
                      <Link href={`/kontakte/${c.id}`} className="block text-sm font-medium leading-tight hover:underline">{shortName(c.name)}</Link>
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
                  );
                })}
                {!items.length && <p className="px-1 py-4 text-center text-xs text-slate-400">—</p>}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-sm text-slate-500">
        Kontakte landen hier automatisch, sobald sie in der Akquise auf „Gewonnen“ gesetzt werden. Produkte, Monatswert und Vertragsstart pflegst du auf der Kontaktseite.
      </p>
    </div>
  );
}
