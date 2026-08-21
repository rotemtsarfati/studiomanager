const CHATWOOT_BASE_URL = String(process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com").replace(/\/$/, "");

function dashboardTokenValid(req) {
  const expected = String(process.env.CHATWOOT_DASHBOARD_TOKEN || "").trim();
  const provided = String(req.headers?.["x-dashboard-token"] || req.query?.token || "").trim();
  return Boolean(expected && provided && expected === provided);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    if (!dashboardTokenValid(req)) return res.status(401).json({ error: "Unauthorized." });

    const accountId = Number(req.body?.account_id || 0);
    const conversationId = Number(req.body?.conversation_id || 0);
    const content = String(req.body?.content || "").trim();
    if (!accountId || !conversationId || !content) return res.status(400).json({ error: "Missing reply or conversation context." });

    const apiToken = String(process.env.CHATWOOT_API_TOKEN || "").trim();
    if (!apiToken) return res.status(500).json({ error: "Chatwoot API token is not configured." });

    const response = await fetch(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: apiToken
      },
      body: JSON.stringify({
        content,
        message_type: "outgoing",
        private: false,
        content_type: "text",
        content_attributes: { source: "be_studios_copilot_dashboard" }
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: `Chatwoot send failed (${response.status}).` });
    return res.status(200).json({ ok: true, message: body });
  } catch (error) {
    console.error("Dashboard send error", error);
    return res.status(500).json({ error: "Could not send the reply." });
  }
}
