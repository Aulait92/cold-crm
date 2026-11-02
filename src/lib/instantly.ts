import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_STATUS } from "@/lib/crm";
import { addWorkdays } from "@/lib/dates";

const API = "https://api.instantly.ai/api/v2";

const INTEREST: Record<number, string> = {
  0: "Abwesend", 1: "Interessiert", 2: "Termin gebucht", 3: "Termin stattgefunden", 4: "Gewonnen",
  [-1]: "Kein Interesse", [-2]: "Falsche Person", [-3]: "Verloren", [-4]: "No-Show",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) throw new Error("INSTANTLY_API_KEY ist nicht gesetzt.");
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Instantly ${path}: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json() as Promise<T>;
}

type ApiCampaign = { id: string; name: string };
type ApiLead = {
  id: string;
  email: string | null;
  status: number;
  email_open_count: number;
  email_reply_count: number;
  email_click_count: number;
  timestamp_last_contact: string | null;
  timestamp_last_open: string | null;
  timestamp_last_reply: string | null;
  lt_interest_status?: number;
};

async function upsertCampaign(name: string, instantlyId?: string) {
  if (instantlyId) {
    const byId = await prisma.campaign.findUnique({ where: { instantlyId } });
    if (byId) return byId.name === name ? byId : prisma.campaign.update({ where: { id: byId.id }, data: { name } });
  }
  return prisma.campaign.upsert({
    where: { name },
    create: { name, instantlyId },
    update: instantlyId ? { instantlyId } : {},
  });
}

async function contactMap(emails: string[]) {
  const list = await prisma.contact.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
  return new Map(list.map((c) => [c.email, c.id]));
}

export type SyncStats = { campaigns: number; leads: number; matched: number; unmatched: number; sent: number; replies: number };

/** Holt alle Kampagnen + Leads aus Instantly (API v2) und gleicht per E-Mail ab. */
export async function syncInstantly(): Promise<SyncStats> {
  const stats: SyncStats = { campaigns: 0, leads: 0, matched: 0, unmatched: 0, sent: 0, replies: 0 };
  const campaigns: ApiCampaign[] = [];
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ limit: "100" });
    if (cursor) q.set("starting_after", cursor);
    const page = await api<{ items: ApiCampaign[]; next_starting_after?: string }>(`/campaigns?${q}`);
    campaigns.push(...page.items);
    cursor = page.items.length ? page.next_starting_after : undefined;
  } while (cursor);

  for (const c of campaigns) {
    stats.campaigns++;
    const campaign = await upsertCampaign(c.name, c.id);
    let after: string | undefined;
    do {
      const page = await api<{ items: ApiLead[]; next_starting_after?: string }>("/leads/list", {
        method: "POST",
        body: JSON.stringify({ campaign: c.id, limit: 100, ...(after ? { starting_after: after } : {}) }),
      });
      after = page.items.length ? page.next_starting_after : undefined;
      const leads = page.items.filter((l) => l.email);
      stats.leads += leads.length;
      const ids = await contactMap(leads.map((l) => l.email!.toLowerCase()));
      for (const l of leads) {
        const contactId = ids.get(l.email!.toLowerCase());
        if (!contactId) {
          stats.unmatched++;
          continue;
        }
        stats.matched++;
        const sentAt = l.timestamp_last_contact ? new Date(l.timestamp_last_contact) : null;
        if (sentAt) stats.sent++;
        if (l.email_reply_count > 0) stats.replies++;
        await saveLead(contactId, campaign.id, {
          status: sentAt || l.status !== 1 ? CAMPAIGN_STATUS[l.status] ?? String(l.status) : "Noch nicht kontaktiert",
          sentAt,
          openCount: l.email_open_count ?? 0,
          replyCount: l.email_reply_count ?? 0,
          clickCount: l.email_click_count ?? 0,
          lastOpenAt: l.timestamp_last_open ? new Date(l.timestamp_last_open) : null,
          lastReplyAt: l.timestamp_last_reply ? new Date(l.timestamp_last_reply) : null,
          bounced: l.status === -1,
          unsubscribed: l.status === -2,
          interest: l.lt_interest_status != null ? INTEREST[l.lt_interest_status] ?? null : null,
        }, campaign.name);
      }
    } while (after);
  }
  return stats;
}

type LeadData = {
  status: string | null;
  sentAt: Date | null;
  openCount: number;
  replyCount: number;
  clickCount: number;
  lastOpenAt: Date | null;
  lastReplyAt: Date | null;
  bounced: boolean;
  unsubscribed: boolean;
  interest: string | null;
};

/** Speichert den Kampagnen-Stand und legt bei neuer Antwort eine Aufgabe an. */
async function saveLead(contactId: string, campaignId: string, d: LeadData, campaignName: string) {
  const prev = await prisma.campaignLead.findUnique({ where: { contactId_campaignId: { contactId, campaignId } } });
  await prisma.campaignLead.upsert({
    where: { contactId_campaignId: { contactId, campaignId } },
    create: { contactId, campaignId, ...d },
    update: d,
  });
  if (d.sentAt && !prev?.sentAt) {
    await prisma.activity.create({
      data: { contactId, type: "COLD_MAIL", outcome: "Gesendet", note: `Kampagne: ${campaignName}`, occurredAt: d.sentAt },
    });
  }
  if (d.replyCount > 0 && (prev?.replyCount ?? 0) === 0) {
    await onReply(contactId, campaignName, d.lastReplyAt ?? new Date());
  }
}

async function onReply(contactId: string, campaignName: string, at: Date, snippet?: string) {
  await prisma.activity.create({
    data: { contactId, type: "COLD_MAIL", outcome: "Antwort erhalten", note: snippet ? `${campaignName}: ${snippet}` : `Kampagne: ${campaignName}`, occurredAt: at },
  });
  await prisma.task.create({
    data: { contactId, title: "Auf Cold-Mail-Antwort reagieren", type: "NACHFASSEN", dueAt: new Date(), note: snippet ?? `Antwort in Kampagne „${campaignName}“ – siehe Instantly Unibox` },
  });
}

/** CSV-Export einer Instantly-Kampagne importieren (Fallback ohne API). */
export async function importInstantlyCsv(text: string, campaignName: string) {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  const cols = parsed.meta.fields ?? [];
  const find = (...res: RegExp[]) => cols.find((c) => res.some((r) => r.test(c)));
  const emailCol = find(/^e-?mail$/i, /^email/i, /e-?mail/i);
  if (!emailCol) throw new Error("Keine E-Mail-Spalte gefunden");
  const statusCol = find(/^status$/i, /lead.?status/i, /status/i);
  const openCol = find(/open/i);
  const replyCol = find(/repl/i);
  const clickCol = find(/click/i);
  const contactCol = find(/last.?contact/i, /sent/i, /contacted/i);
  const campaignCol = find(/campaign/i);

  const rows = parsed.data;
  const ids = await contactMap(rows.map((r) => (r[emailCol] ?? "").trim().toLowerCase()).filter(Boolean));
  const stats = { rows: rows.length, matched: 0, unmatched: 0, sent: 0 };
  const campaigns = new Map<string, Awaited<ReturnType<typeof upsertCampaign>>>();
  const n = (v?: string) => (v ? parseInt(v, 10) || 0 : 0);
  const d = (v?: string) => {
    if (!v) return null;
    const x = new Date(v);
    return isNaN(x.getTime()) ? null : x;
  };

  for (const r of rows) {
    const contactId = ids.get((r[emailCol] ?? "").trim().toLowerCase());
    if (!contactId) {
      stats.unmatched++;
      continue;
    }
    stats.matched++;
    const name = (campaignCol && r[campaignCol]?.trim()) || campaignName || "Instantly Import";
    if (!campaigns.has(name)) campaigns.set(name, await upsertCampaign(name));
    const status = statusCol ? r[statusCol]?.trim() || null : null;
    const notSent = !!status && /not yet|noch nicht|^active$/i.test(status) && !(contactCol && r[contactCol]);
    const sentAt = notSent ? null : d(contactCol ? r[contactCol] : undefined) ?? new Date();
    if (sentAt) stats.sent++;
    await saveLead(contactId, campaigns.get(name)!.id, {
      status,
      sentAt,
      openCount: n(openCol && r[openCol]),
      replyCount: n(replyCol && r[replyCol]),
      clickCount: n(clickCol && r[clickCol]),
      lastOpenAt: null,
      lastReplyAt: null,
      bounced: !!status && /bounce/i.test(status),
      unsubscribed: !!status && /unsub|abgemeldet/i.test(status),
      interest: null,
    }, name);
  }
  return stats;
}

/** Instantly-Webhook (email_sent, email_opened, reply_received, email_bounced, lead_unsubscribed …) */
export async function handleWebhook(p: Record<string, unknown>) {
  const email = String(p.lead_email ?? "").trim().toLowerCase();
  const type = String(p.event_type ?? "");
  if (!email || !type) return { ignored: "missing lead_email/event_type" };
  const contact = await prisma.contact.findUnique({ where: { email }, select: { id: true } });
  if (!contact) return { ignored: "unknown contact" };
  const name = String(p.campaign_name ?? "Instantly");
  const campaign = await upsertCampaign(name, p.campaign_id ? String(p.campaign_id) : undefined);
  const at = p.timestamp ? new Date(String(p.timestamp)) : new Date();
  const key = { contactId_campaignId: { contactId: contact.id, campaignId: campaign.id } };
  const prev = await prisma.campaignLead.findUnique({ where: key });
  const base = { contactId: contact.id, campaignId: campaign.id };

  switch (type) {
    case "email_sent":
      await prisma.campaignLead.upsert({ where: key, create: { ...base, sentAt: at, status: "Aktiv" }, update: { sentAt: at } });
      if (!prev?.sentAt) {
        await prisma.activity.create({ data: { contactId: contact.id, type: "COLD_MAIL", outcome: "Gesendet", note: `Kampagne: ${name}${p.step ? ` (Schritt ${p.step})` : ""}`, occurredAt: at } });
      }
      break;
    case "email_opened":
      await prisma.campaignLead.upsert({ where: key, create: { ...base, openCount: 1, lastOpenAt: at }, update: { openCount: { increment: 1 }, lastOpenAt: at } });
      break;
    case "link_clicked":
      await prisma.campaignLead.upsert({ where: key, create: { ...base, clickCount: 1 }, update: { clickCount: { increment: 1 } } });
      break;
    case "reply_received":
      await prisma.campaignLead.upsert({ where: key, create: { ...base, replyCount: 1, lastReplyAt: at }, update: { replyCount: { increment: 1 }, lastReplyAt: at } });
      await onReply(contact.id, name, at, p.reply_text_snippet ? String(p.reply_text_snippet).slice(0, 500) : undefined);
      break;
    case "email_bounced":
      await prisma.campaignLead.upsert({ where: key, create: { ...base, bounced: true, status: "Bounced" }, update: { bounced: true, status: "Bounced" } });
      break;
    case "lead_unsubscribed":
      await prisma.campaignLead.upsert({ where: key, create: { ...base, unsubscribed: true, status: "Abgemeldet" }, update: { unsubscribed: true, status: "Abgemeldet" } });
      break;
    case "lead_interested":
    case "lead_meeting_booked":
      await prisma.campaignLead.upsert({ where: key, create: { ...base, interest: type === "lead_interested" ? "Interessiert" : "Termin gebucht" }, update: { interest: type === "lead_interested" ? "Interessiert" : "Termin gebucht" } });
      await prisma.task.create({ data: { contactId: contact.id, title: type === "lead_interested" ? "Interessent aus Cold Mail anrufen" : "Termin aus Cold Mail vorbereiten", type: "ANRUF", dueAt: addWorkdays(new Date(), 0) } });
      break;
    default:
      return { ignored: type };
  }
  return { ok: true };
}
