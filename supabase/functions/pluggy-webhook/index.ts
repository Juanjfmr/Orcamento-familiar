// Duo Finn: Pluggy notifications ingress, not a transaction importer.
// Auth: X-Duo-Webhook-Secret must match a SHA-256 digest in private SQL.
// The Supabase service key stays within Supabase Edge runtime, never in the repository.
import { createClient } from "npm:@supabase/supabase-js@2";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function json(status: number, data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const credential = req.headers.get("x-duo-webhook-secret");
  if (!credential || credential.length < 48 || credential.length > 160) {
    return json(401, { error: "unauthorized" });
  }
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 16384) return json(413, { error: "payload_too_large" });
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 16384) return json(413, { error: "payload_too_large" });
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("invalid");
  } catch {
    return json(400, { error: "invalid_payload" });
  }
  if (!uuid.test(String(body.eventId || ""))) return json(400, { error: "invalid_event_id" });
  if (typeof body.event !== "string" || body.event.length > 80) {
    return json(400, { error: "invalid_event_type" });
  }
  const itemId = uuid.test(String(body.itemId || "")) ? String(body.itemId) : null;
  const hint = uuid.test(String(body.clientUserId || "")) ? String(body.clientUserId) : null;
  try {
    const { data, error } = await db.rpc("finn_queue_pluggy_webhook", {
      p_secret: credential,
      p_client_id: String(body.clientId || ""),
      p_event_id: body.eventId,
      p_event_type: body.event,
      p_item_id: itemId,
      p_owner_hint: hint
    });
    if (error) {
      if (error.code === "42501") return json(401, { error: "unauthorized" });
      if (error.code === "22023") return json(400, { error: "invalid_event" });
      return json(503, { error: "storage_unavailable" });
    }
    // A 202 only means the signal was queued. A separate worker must verify and sync.
    return json(202, { received: true, queued: Boolean(data) });
  } catch {
    return json(503, { error: "service_unavailable" });
  }
});
