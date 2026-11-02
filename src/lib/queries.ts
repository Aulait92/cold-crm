import { prisma } from "@/lib/prisma";
import { addDays, fromDayKey, todayKey } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";

export const taskInclude = {
  contact: { select: { id: true, name: true, phone: true, city: true, stage: true } },
} satisfies Prisma.TaskInclude;

export function dayBounds() {
  const start = fromDayKey(todayKey(), "00:00");
  return { start, tomorrow: addDays(start, 1), dayAfter: addDays(start, 2), week: addDays(start, 7) };
}

export async function openTasks(where: Prisma.TaskWhereInput = {}) {
  return prisma.task.findMany({ where: { doneAt: null, ...where }, include: taskInclude, orderBy: { dueAt: "asc" } });
}
