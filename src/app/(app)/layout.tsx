import { connection } from "next/server";
import { Nav } from "@/components/nav";
import { prisma } from "@/lib/prisma";
import { fromDayKey, todayKey, addDays } from "@/lib/dates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const dueCount = await prisma.task.count({
    where: { doneAt: null, dueAt: { lt: addDays(fromDayKey(todayKey(), "00:00"), 1) } },
  });
  return (
    <div className="min-h-screen">
      <Nav dueCount={dueCount} />
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
