"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, requireAuth } from "@/lib/auth";
import { OUTCOME_BY_ID, STAGE_RANK, STAGE_LABEL } from "@/lib/crm";
import { addDays, fromDayKey } from "@/lib/dates";
import type { ActivityType, LossReason, Stage, TaskType } from "@/generated/prisma/enums";
import { importContactsCsv } from "@/lib/import-contacts";
import { importInstantlyCsv, syncInstantly } from "@/lib/instantly";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function refresh(contactId?: string | null) {
  revalidatePath("/", "layout");
  if (contactId) revalidatePath(`/kontakte/${contactId}`);
}

// ─── Login ──────────────────────────────────────────────────────────────
export async function login(_prev: string | null, fd: FormData): Promise<string | null> {
  const pw = s(fd, "password");
  if (!process.env.APP_PASSWORD) return "APP_PASSWORD ist nicht gesetzt.";
  if (!pw || pw !== process.env.APP_PASSWORD) return "Falsches Passwort.";
  await createSession();
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ─── Aktivität erfassen ─────────────────────────────────────────────────
export async function logActivity(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const type = (s(fd, "type") ?? "ANRUF") as ActivityType;
  const outcome = OUTCOME_BY_ID[s(fd, "outcome") ?? "notiz"] ?? OUTCOME_BY_ID.notiz;
  const note = s(fd, "note");
  const lossReason = s(fd, "lossReason") as LossReason | null;

  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  let stage: Stage | undefined;
  if (outcome.stage) {
    // "Nicht erreicht" stuft keinen Kontakt zurück, der schon weiter ist
    const downgrade = outcome.id === "nicht_erreicht" && STAGE_RANK[contact.stage] > STAGE_RANK.NICHT_ERREICHT;
    if (!downgrade) stage = outcome.stage;
  }

  await prisma.$transaction(async (tx) => {
    await tx.activity.create({
      data: { contactId, type, outcome: outcome.id === "notiz" ? null : outcome.label, note },
    });
    await tx.contact.update({
      where: { id: contactId },
      data: {
        stage,
        lossReason: stage === "VERLOREN" ? lossReason ?? "SONSTIGES" : stage ? null : undefined,
        callAttempts: type === "ANRUF" ? { increment: 1 } : undefined,
        lastContactAt: type === "NOTIZ" ? undefined : new Date(),
      },
    });
    if (outcome.closesTasks || fd.get("closeOpen") === "on") {
      await tx.task.updateMany({ where: { contactId, doneAt: null }, data: { doneAt: new Date() } });
    }
    if (fd.get("createTask") === "on" && s(fd, "taskTitle") && s(fd, "taskDue")) {
      await tx.task.create({
        data: {
          contactId,
          title: s(fd, "taskTitle")!,
          type: (s(fd, "taskType") ?? "SONSTIGES") as TaskType,
          dueAt: fromDayKey(s(fd, "taskDue")!, s(fd, "taskTime") ?? "09:00"),
          note,
        },
      });
    }
  });
  refresh(contactId);
}

export async function setStage(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const stage = s(fd, "stage") as Stage;
  const lossReason = s(fd, "lossReason") as LossReason | null;
  const competitor = s(fd, "competitor");
  const before = await prisma.contact.findUniqueOrThrow({ where: { id: contactId }, select: { stage: true } });
  await prisma.contact.update({
    where: { id: contactId },
    data: { stage, lossReason: stage === "VERLOREN" ? lossReason ?? "SONSTIGES" : null, competitor },
  });
  if (before.stage !== stage) {
    await prisma.activity.create({
      data: { contactId, type: "STATUS", outcome: `${STAGE_LABEL[before.stage]} → ${STAGE_LABEL[stage]}` },
    });
  }
  refresh(contactId);
}

export async function updateContact(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  await prisma.contact.update({
    where: { id: contactId },
    data: { phone: s(fd, "phone"), name: s(fd, "name") ?? undefined },
  });
  refresh(contactId);
}

// ─── Aufgaben ───────────────────────────────────────────────────────────
export async function createTask(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId");
  const title = s(fd, "title");
  const due = s(fd, "due");
  if (!title || !due) return;
  await prisma.task.create({
    data: {
      contactId,
      title,
      type: (s(fd, "type") ?? "SONSTIGES") as TaskType,
      dueAt: fromDayKey(due, s(fd, "time") ?? "09:00"),
      note: s(fd, "note"),
    },
  });
  refresh(contactId);
}

export async function toggleTask(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const t = await prisma.task.findUniqueOrThrow({ where: { id } });
  await prisma.task.update({ where: { id }, data: { doneAt: t.doneAt ? null : new Date() } });
  refresh(t.contactId);
}

export async function snoozeTask(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const days = Number(s(fd, "days") ?? 1);
  const t = await prisma.task.findUniqueOrThrow({ where: { id } });
  const base = t.dueAt < new Date() ? new Date(new Date().setUTCHours(t.dueAt.getUTCHours(), t.dueAt.getUTCMinutes())) : t.dueAt;
  await prisma.task.update({ where: { id }, data: { dueAt: addDays(base, days) } });
  refresh(t.contactId);
}

export async function deleteTask(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const t = await prisma.task.delete({ where: { id } });
  refresh(t.contactId);
}

// ─── Import ─────────────────────────────────────────────────────────────
export type ImportState = { ok: boolean; message: string } | null;

export async function importContactsAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  await requireAuth();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Bitte eine CSV-Datei wählen." };
  try {
    const r = await importContactsCsv(await file.text());
    refresh();
    return {
      ok: true,
      message: `${r.rows} Zeilen: ${r.created} neu, ${r.updated} aktualisiert, ${r.skipped} übersprungen. ${r.withStatus} Status übernommen, ${r.tasks} Aufgaben angelegt.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function importInstantlyAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  await requireAuth();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Bitte eine CSV-Datei wählen." };
  try {
    const r = await importInstantlyCsv(await file.text(), s(fd, "campaign") ?? "");
    refresh();
    return { ok: true, message: `${r.rows} Leads: ${r.matched} zugeordnet (${r.sent} gesendet), ${r.unmatched} nicht in der Kontaktliste.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function syncInstantlyAction(prev: ImportState): Promise<ImportState> {
  void prev;
  await requireAuth();
  try {
    const r = await syncInstantly();
    refresh();
    return {
      ok: true,
      message: `${r.campaigns} Kampagnen, ${r.leads} Leads: ${r.matched} zugeordnet, ${r.sent} mit gesendeter Mail, ${r.replies} mit Antwort, ${r.unmatched} nicht in der Kontaktliste.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
