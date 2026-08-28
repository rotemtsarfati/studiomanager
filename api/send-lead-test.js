const ARBOX_LEADS_URL = "https://arboxserver.arboxapp.com/api/public/v3/leads";
const ARBOX_LOCATION_ID = "21673";
const CHATWOOT_BASE_URL = String(process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com").replace(/\/$/, "");
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const EXPECTED_TEST_USER_ID = 11261823;
const TEMPLATE_NAME = "new_lead";

function pickLeadArray(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["data", "items", "results", "leads", "payload"]) if (Array.isArray(body?.[key])) return body[key];
  return [];
}

function timeValue(lead) {
  const raw = String(lead?.created_time ?? lead?.created_at ?? lead?.createdAt ?? "").trim();
  const parsed = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

async function fetchLatestLead() {
  const apiKey = String(process.env.ARBOX_API_KEY || "").trim();
  if (!apiKey) throw new Error("ARBOX_API_KEY missing");
  const url = new URL(ARBOX_LEADS_URL);
  url.searchParams.set("limit", "500");
  url.searchParams.set("page", "1");
  url.searchParams.set("location_id", ARBOX_LOCATION_ID);
  const response = await fetch(url, { headers: { Accept: "application/json", "api-key": apiKey } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Arbox leads fetch failed (${response.status})`);
  const leads = pickLeadArray(body);
  return [...leads].sort((a, b) => timeValue(b) - timeValue(a))[0] || null;
}

async function getWhatsAppConfig() {
  const cwToken = String(process.env.CHATWOOT_API_TOKEN || "").trim();
  if (!cwToken) throw new Error("CHATWOOT_API_TOKEN missing");
  const response = await fetch(`${CHATWOOT_BASE_URL}/api/v1/accounts/163942/inboxes/108306`, { headers: { api_access_token: cwToken } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Chatwoot inbox fetch failed (${response.status})`);
  const provider = body?.provider_config || body?.channel?.provider_config || {};
  const phoneNumberId = String(provider.phone_number_id || "").trim();
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || provider.api_key || "").trim();
  if (!phoneNumberId) throw new Error("WhatsApp phone_number_id missing");
  if (!accessToken) throw new Error("WhatsApp access token missing");
  return { phoneNumberId, accessToken };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    if (String(req.query?.confirm || "") !== "send-new-lead-test") return res.status(400).json({ error: "Missing test confirmation" });

    const lead = await fetchLatestLead();
    if (!lead) return res.status(404).json({ error: "No lead found" });

    const userId = Number(lead.user_id ?? lead.id ?? lead.lead_id ?? 0);
    const status = String(lead.lead_status ?? lead.status ?? lead.status_name ?? "").trim().toLowerCase();
    const createdMs = timeValue(lead);
    const ageMinutes = createdMs ? Math.round((Date.now() - createdMs) / 60000) : null;
    const phone = normalizePhone(lead.phone ?? lead.phone_number ?? lead.mobile ?? "");

    if (userId !== EXPECTED_TEST_USER_ID) return res.status(409).json({ error: "Latest lead is not the expected test lead", latest_user_id: userId });
    if (status !== "created") return res.status(409).json({ error: "Test lead status is not Created", status });
    if (!phone) return res.status(409).json({ error: "Test lead has no phone number" });
    if (ageMinutes === null || ageMinutes > 180) return res.status(409).json({ error: "Test lead is too old for guarded send", age_minutes: ageMinutes });

    const { phoneNumberId, accessToken } = await getWhatsAppConfig();
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template: { name: TEMPLATE_NAME, language: { code: "en" } }
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: "WhatsApp template send failed", status: response.status, meta_error: body?.error?.message || null, meta_code: body?.error?.code || null });

    return res.status(200).json({ ok: true, sent: true, user_id: userId, status: lead.lead_status, template: TEMPLATE_NAME, whatsapp_message_id: body?.messages?.[0]?.id || null });
  } catch (error) {
    console.error("send-lead-test error", error);
    return res.status(500).json({ error: error.message || "test send failed" });
  }
}
