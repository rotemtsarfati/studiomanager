const ARBOX_LEADS_URL = "https://arboxserver.arboxapp.com/api/public/v3/leads";
const ARBOX_LOCATION_ID = "21673";
const CHATWOOT_BASE_URL = String(process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com").replace(/\/$/, "");
const CHATWOOT_ACCOUNT_ID = 163942;
const CHATWOOT_INBOX_ID = 108306;
const EXPECTED_TEST_USER_ID = 11261823;
const TEMPLATE_NAME = "new_lead";
const TEMPLATE_CONTENT = `Hi! 😊\n\nThanks for signing up for a free trial at Be Studios! We’d love to gift you your first class.\n\nBefore we book you in, we’d just love to know a little about you. Are you based in the Paphos area? And what are you hoping to achieve with your training? Are you currently exercising regularly?\n\nThat will help us recommend the perfect class for you. 💛`;

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
  if (digits.length === 8) digits = `357${digits}`;
  return digits;
}
async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}
async function fetchLatestLead() {
  const apiKey = String(process.env.ARBOX_API_KEY || "").trim();
  if (!apiKey) throw new Error("ARBOX_API_KEY missing");
  const url = new URL(ARBOX_LEADS_URL);
  url.searchParams.set("limit", "500");
  url.searchParams.set("page", "1");
  url.searchParams.set("location_id", ARBOX_LOCATION_ID);
  const { response, body } = await jsonFetch(url, { headers: { Accept: "application/json", "api-key": apiKey } });
  if (!response.ok) throw new Error(`Arbox leads fetch failed (${response.status})`);
  return [...pickLeadArray(body)].sort((a, b) => timeValue(b) - timeValue(a))[0] || null;
}
function cwHeaders() {
  const token = String(process.env.CHATWOOT_API_TOKEN || "").trim();
  if (!token) throw new Error("CHATWOOT_API_TOKEN missing");
  return { api_access_token: token, "Content-Type": "application/json", Accept: "application/json" };
}
async function findOrCreateContact(lead, phone) {
  const phoneE164 = `+${phone}`;
  const searchUrl = `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(phoneE164)}`;
  const found = await jsonFetch(searchUrl, { headers: cwHeaders() });
  if (!found.response.ok) throw new Error(`Chatwoot contact search failed (${found.response.status})`);
  let contact = (found.body?.payload || []).find(c => normalizePhone(c.phone_number) === phone);
  if (contact) return contact;

  const created = await jsonFetch(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`, {
    method: "POST", headers: cwHeaders(), body: JSON.stringify({
      inbox_id: CHATWOOT_INBOX_ID,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Arbox Lead",
      email: lead.email || undefined,
      phone_number: phoneE164,
      identifier: `arbox-${lead.user_id}`
    })
  });
  if (!created.response.ok) throw new Error(`Chatwoot contact create failed (${created.response.status}): ${JSON.stringify(created.body)}`);
  contact = created.body?.payload?.[0] || created.body;
  if (!contact?.id) throw new Error("Chatwoot contact create returned no contact id");
  return contact;
}
async function sendTemplateViaChatwoot(contact) {
  const payload = {
    inbox_id: CHATWOOT_INBOX_ID,
    contact_id: contact.id,
    status: "open",
    message: {
      content: TEMPLATE_CONTENT,
      message_type: "outgoing",
      private: false,
      content_type: "text",
      template_params: {
        name: TEMPLATE_NAME,
        category: "MARKETING",
        language: "en",
        processed_params: {}
      }
    }
  };
  const sent = await jsonFetch(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
    method: "POST", headers: cwHeaders(), body: JSON.stringify(payload)
  });
  if (!sent.response.ok) throw new Error(`Chatwoot conversation/template send failed (${sent.response.status}): ${JSON.stringify(sent.body)}`);
  return sent.body;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    if (String(req.query?.confirm || "") !== "send-new-lead-test") return res.status(400).json({ error: "Missing test confirmation" });
    const lead = await fetchLatestLead();
    if (!lead) return res.status(404).json({ error: "No lead found" });
    const userId = Number(lead.user_id ?? lead.id ?? lead.lead_id ?? 0);
    const status = String(lead.lead_status ?? lead.status ?? lead.status_name ?? "").trim().toLowerCase();
    const phone = normalizePhone(lead.phone ?? lead.phone_number ?? lead.mobile ?? "");
    if (userId !== EXPECTED_TEST_USER_ID) return res.status(409).json({ error: "Latest lead is not expected test lead", latest_user_id: userId });
    if (status !== "created") return res.status(409).json({ error: "Test lead status is not Created", status });
    if (phone !== "35797427370") return res.status(409).json({ error: "Test lead phone does not match guarded test number", last4: phone.slice(-4) });

    const contact = await findOrCreateContact(lead, phone);
    const conversation = await sendTemplateViaChatwoot(contact);
    return res.status(200).json({ ok: true, sent_via: "chatwoot", user_id: userId, contact_id: contact.id, conversation_id: conversation?.id || null, template: TEMPLATE_NAME, message_status: conversation?.messages?.[0]?.status || null, message_id: conversation?.messages?.[0]?.id || null });
  } catch (error) {
    console.error("send-lead-test error", error);
    return res.status(500).json({ error: error.message || "test send failed" });
  }
}
