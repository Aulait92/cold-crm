import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { classifyLegacy } from "@/lib/legacy";
import type { Prisma } from "@/generated/prisma/client";

function parseGermanDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(Date.UTC(y, +m[2] - 1, +m[1], 9));
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

export type ImportStats = { rows: number; created: number; updated: number; withStatus: number; tasks: number; skipped: number };

/**
 * Importiert die Agenturliste (CSV-Export aus Numbers/Excel).
 * Spalten werden über die Kopfzeile erkannt. Die Status-Spalte ist die
 * Spalte "status" – oder, wie in der Original-Liste, die erste Spalte ohne
 * Überschrift nach "description"; die zweite ohne Überschrift ist das Datum.
 * Bestehende Kontakte (gleiche E-Mail) werden aktualisiert, ihre Pipeline
 * aber nicht überschrieben.
 */
export async function importContactsCsv(text: string): Promise<ImportStats> {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  const [header, ...rows] = parsed.data;
  if (!header) throw new Error("Leere Datei");
  const h = header.map((x) => x.trim().toLowerCase());
  const idx = (n: string) => h.indexOf(n.toLowerCase());
  if (idx("email") < 0) throw new Error("Spalte 'email' nicht gefunden");

  let statusIdx = idx("status");
  let dateIdx = idx("datum");
  if (statusIdx < 0) {
    const blanks = h.map((x, i) => (x === "" ? i : -1)).filter((i) => i > idx("description"));
    statusIdx = blanks[0] ?? -1;
    if (dateIdx < 0) dateIdx = blanks[1] ?? -1;
  }

  const existing = new Map(
    (await prisma.contact.findMany({ select: { id: true, email: true, legacyStatus: true } })).map((c) => [c.email, c]),
  );
  const stats: ImportStats = { rows: rows.length, created: 0, updated: 0, withStatus: 0, tasks: 0, skipped: 0 };
  const now = new Date();
  const seen = new Set<string>();

  type Pending = { data: Prisma.ContactCreateInput; legacy?: { text: string; date: Date | null } };
  const toCreate: Pending[] = [];
  const toUpdate: { id: string; data: Prisma.ContactUpdateInput; legacy?: { text: string; date: Date | null } }[] = [];

  for (const r of rows) {
    const get = (f: string) => {
      const i = idx(f);
      const v = i >= 0 ? r[i]?.trim() : "";
      return v ? v : undefined;
    };
    const email = get("email")?.toLowerCase();
    if (!email || seen.has(email)) {
      stats.skipped++;
      continue;
    }
    seen.add(email);
    const base = {
      name: get("name") ?? email,
      phone: get("phone") ?? null,
      fax: get("fax") ?? null,
      street: get("street") ?? null,
      zip: get("zip")?.replace(/\.0$/, "").padStart(5, "0") ?? null,
      city: get("city") ?? null,
      ratingValue: num(get("ratingValue")),
      ratingCount: num(get("ratingCount")) as number | null,
      openingHours: get("openingHours") ?? null,
      url: get("url") ?? null,
      description: get("description") ?? null,
    };
    const statusText = statusIdx >= 0 ? r[statusIdx]?.trim() : "";
    const legacy = statusText ? { text: statusText, date: parseGermanDate(dateIdx >= 0 ? r[dateIdx] : undefined) } : undefined;
    const ex = existing.get(email);
    if (ex) {
      // Legacy-Status nur übernehmen, wenn er neu ist
      toUpdate.push({ id: ex.id, data: base, legacy: legacy && ex.legacyStatus !== legacy.text ? legacy : undefined });
    } else {
      toCreate.push({ data: { ...base, email }, legacy });
    }
  }

  // Neue Kontakte in Blöcken anlegen
  for (let i = 0; i < toCreate.length; i += 500) {
    const chunk = toCreate.slice(i, i + 500);
    await prisma.contact.createMany({ data: chunk.map((c) => c.data as Prisma.ContactCreateManyInput), skipDuplicates: true });
    stats.created += chunk.length;
  }
  for (let i = 0; i < toUpdate.length; i += 200) {
    await prisma.$transaction(toUpdate.slice(i, i + 200).map((u) => prisma.contact.update({ where: { id: u.id }, data: u.data })));
    stats.updated += Math.min(200, toUpdate.length - i);
  }

  // Legacy-Status → Stufe, Aktivität, Aufgabe
  const withLegacy = [
    ...toCreate.filter((c) => c.legacy).map((c) => ({ email: c.data.email, legacy: c.legacy! })),
    ...toUpdate.filter((u) => u.legacy).map((u) => ({ email: [...existing.values()].find((e) => e.id === u.id)!.email, legacy: u.legacy! })),
  ];
  const ids = new Map(
    (await prisma.contact.findMany({ where: { email: { in: withLegacy.map((w) => w.email) } }, select: { id: true, email: true } })).map((c) => [c.email, c.id]),
  );
  for (let i = 0; i < withLegacy.length; i += 100) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const w of withLegacy.slice(i, i + 100)) {
      const id = ids.get(w.email);
      if (!id) continue;
      const res = classifyLegacy(w.legacy.text, now);
      stats.withStatus++;
      ops.push(
        prisma.contact.update({
          where: { id },
          data: {
            legacyStatus: w.legacy.text,
            stage: res?.stage ?? undefined,
            customerStage: res?.stage === "GEWONNEN" ? "VERTRAG" : undefined,
            lossReason: res?.lossReason ?? null,
            competitor: res?.competitor ?? undefined,
            callAttempts: { increment: 1 },
            lastContactAt: w.legacy.date ?? undefined,
          },
        }),
        prisma.activity.create({
          data: { contactId: id, type: "IMPORT", note: w.legacy.text, occurredAt: w.legacy.date ?? now },
        }),
      );
      if (res?.task) {
        stats.tasks++;
        ops.push(
          prisma.task.create({
            data: { contactId: id, title: res.task.title, type: res.task.type, dueAt: res.task.dueAt, note: w.legacy.text },
          }),
        );
      }
    }
    await prisma.$transaction(ops);
  }
  return stats;
}
