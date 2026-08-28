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
  return {
    user_id: lead.user_id ?? lead.id ?? lead.lead_id ?? null,
    first_name: lead.first_name ?? null,
    last_name: lead.last_name ?? null,
    lead_status: lead.lead_status ?? lead.status ?? lead.status_name ?? null,
    lead_source: lead.lead_source ?? null,
    created_time: lead.created_time ?? lead.created_at ?? lead.createdAt ?? null,
    location_id: lead.location_id ?? null,
    has_phone: Boolean(String(lead.phone ?? lead.phone_number ?? lead.mobile ?? "").trim()),
    phone_last4: String(lead.phone ?? lead.phone_number ?? lead.mobile ?? "").replace(/\D/g, "").slice(-4) || null,
    has_email: Boolean(String(lead.email ?? "").trim())
  };
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

    let chatwootInbox = null;
    const cwToken = String(process.env.CHATWOOT_API_TOKEN || "").trim();
    if (cwToken) {
      const cw = await fetch(`${CHATWOOT_BASE_URL}/api/v1/accounts/163942/inboxes/108306`, { headers: { api_access_token: cwToken } });
      const cwBody = await cw.json().catch(() => ({}));
      const providerConfig = cwBody?.provider_config || cwBody?.channel?.provider_config || {};
      chatwootInbox = {
        ok: cw.ok,
        status: cw.status,
        channel: cwBody?.channel_type || cwBody?.channel?.type || null,
        phone_number: cwBody?.phone_number || cwBody?.channel?.phone_number || null,
        has_phone_number_id: Boolean(String(providerConfig.phone_number_id || "").trim()),
        has_provider_api_key: Boolean(String(providerConfig.api_key || "").trim())
      };
    }

    return res.status(200).json({
      ok: true,
      total_found: leads.length,
      leads: leads.map(safeLead),
      env: {
        whatsapp_access_token: Boolean(String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim()),
        chatwoot_api_token: Boolean(cwToken)
      },
      chatwoot_inbox: chatwootInbox
    });
  } catch (error) {
    console.error("test-lead error", error);
    return res.status(500).json({ error: error.message || "test failed" });
  }
}
