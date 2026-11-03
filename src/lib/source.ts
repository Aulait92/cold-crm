import { prisma } from "@/lib/prisma";

/**
 * Vorschlag für den Akquise-Kanal aus den vorhandenen Daten:
 * Antwort auf Cold Mail oder LinkedIn (die frühere zählt), sonst Cold Call,
 * wenn telefoniert wurde. Kann auf der Kontaktseite geändert werden.
 */
export async function guessSource(contactId: string): Promise<{ source: string; note: string | null } | null> {
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      callAttempts: true,
      legacyStatus: true,
      linkedinReplyAt: true,
      linkedinList: true,
      emails: { where: { direction: "IN", isAutoReply: false }, orderBy: { sentAt: "asc" }, take: 1, select: { sentAt: true, campaign: true } },
      campaigns: { where: { replyCount: { gt: 0 } }, take: 1, select: { campaign: { select: { name: true } } } },
    },
  });
  if (!c) return null;
  const mail = c.emails[0];
  const mailAt = mail?.sentAt ?? (c.campaigns.length ? new Date(8.64e15) : null);
  const liAt = c.linkedinReplyAt;
  if (mailAt && (!liAt || mailAt <= liAt)) {
    const camp = mail?.campaign ?? c.campaigns[0]?.campaign.name;
    return { source: "COLD_MAIL", note: camp ? `Kampagne: ${camp}` : null };
  }
  if (liAt) return { source: "LINKEDIN", note: c.linkedinList ? `Waalaxy-Liste: ${c.linkedinList}` : null };
  if (c.callAttempts > 0 || c.legacyStatus) return { source: "COLD_CALL", note: null };
  return null;
}

/** Setzt den Kanal, falls noch keiner gesetzt ist. */
export async function ensureSource(contactId: string) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { customerSource: true, customerStage: true } });
  if (!c || c.customerSource || !c.customerStage) return;
  const g = await guessSource(contactId);
  if (g) await prisma.contact.update({ where: { id: contactId }, data: { customerSource: g.source, customerSourceNote: g.note } });
}
