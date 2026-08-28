const ARBOX_LEADS_URL = "https://arboxserver.arboxapp.com/api/public/v3/leads";
const ARBOX_LOCATION_ID = "21673";
const CHATWOOT_BASE_URL = String(process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com").replace(/\/$/, "");

function pickLeadArray(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["data", "items", "results", "leads", "payload"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}

function safeLead(lead) {
  if (!lead || typeof lead !== "object") return null;
  const result = {};
  for (const key of ["id", "lead_id", "status", "status_name", "lead_status", "created_at", "createdAt", "first_name", "last_name", "name", "phone", "phone_number", "mobile", "email", "location_id"]) {
    if (lead[key] !== undefined) result[key] = lead[key];
  }
  result.available_keys = Object.keys(lead).sort();
  return result;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const apiKey = String(process.env.ARBOX_API_KEY || "").trim();
    if (!apiKey) return res.status(500).json({ error: "ARBOX_API_KEY missing" });

    const url = new URL(ARBOX_LEADS_URL);
    url.searchParams.set("limit", "20");
    url.searchParams.set("page", "1");
    url.searchParams.set("location_id", ARBOX_LOCATION_ID);

    const arboxResponse = await fetch(url, { headers: { Accept: "application/json", "api-key": apiKey } });
    const text = await arboxResponse.text();
    let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 1000) }; }
    if (!arboxResponse.ok) return res.status(502).json({ error: "Arbox leads fetch failed", status: arboxResponse.status, body });

    const leads = pickLeadArray(body);
    const created = leads.filter((lead) => String(lead?.status || lead?.status_name || lead?.lead_status || "").trim().toLowerCase() === "created");

    let chatwootInbox = null;
    const cwToken = String(process.env.CHATWOOT_API_TOKEN || "").trim();
    if (cwToken) {
      const cw = await fetch(`${CHATWOOT_BASE_URL}/api/v1/accounts/163942/inboxes/108306`, { headers: { api_access_token: cwToken } });
      const cwBody = await cw.json().catch(() => ({}));
      chatwootInbox = { ok: cw.ok, status: cw.status, channel: cwBody?.channel_type || cwBody?.channel?.type || null, phone_number: cwBody?.phone_number || cwBody?.channel?.phone_number || null, provider_config_keys: Object.keys(cwBody?.provider_config || cwBody?.channel?.provider_config || {}).sort() };
    }

    return res.status(200).json({
      ok: true,
      total_found: leads.length,
      created_count: created.length,
      latest_created: safeLead(created[0] || null),
      sample_latest: safeLead(leads[0] || null),
      env: {
        whatsapp_access_token: Boolean(String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim()),
        whatsapp_phone_number_id: Boolean(String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim()),
        chatwoot_api_token: Boolean(cwToken)
      },
      chatwoot_inbox: chatwootInbox
    });
  } catch (error) {
    console.error("test-lead error", error);
    return res.status(500).json({ error: error.message || "test failed" });
  }
}
