import { handleWaalaxyWebhook } from "@/lib/linkedin";

// Waalaxy → Schritt "CRM Sync" (bzw. Sync bei Antwort) → Webhook-URL:
// https://<deine-domain>/api/waalaxy/webhook?token=<WEBHOOK_TOKEN>
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-webhook-token");
  if (!process.env.WEBHOOK_TOKEN || token !== process.env.WEBHOOK_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  const type = req.headers.get("content-type") ?? "";
  try {
    body = type.includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(await req.text())) : await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  return Response.json({ results: await handleWaalaxyWebhook(body) });
}
