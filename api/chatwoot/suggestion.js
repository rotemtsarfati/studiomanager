const CHATWOOT_BASE_URL = String(process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com").replace(/\/$/, "");

function dashboardTokenValid(req) {
  const expected = String(process.env.CHATWOOT_DASHBOARD_TOKEN || "").trim();
  const provided = String(req.headers?.["x-dashboard-token"] || req.query?.token || "").trim();
  return Boolean(expected && provided && expected === provided);
}

function messageTime(item) {
  const created = Number(item?.created_at || 0);
  if (created > 0) return created;
  return Number(item?.id || 0);
}

function isIncoming(item) {
  return item?.private !== true && (item?.message_type === 0 || item?.message_type === "incoming");
}

function isAiSuggestion(item) {
  return item?.private === true && String(item?.content || "").includes("✨ AI suggested reply");
}

function latestSuggestionForLatestCustomerMessage(messages) {
  const latestIncoming = [...messages].filter(isIncoming).sort((a, b) => messageTime(b) - messageTime(a))[0];
  if (!latestIncoming) return { suggestion: "", pending: false };

  const latestIncomingTime = messageTime(latestIncoming);
  const suggestion = [...messages]
    .filter(isAiSuggestion)
    .filter((item) => messageTime(item) >= latestIncomingTime)
    .sort((a, b) => messageTime(b) - messageTime(a))[0];

  if (!suggestion) return { suggestion: "", pending: true, latest_message_id: latestIncoming.id };

  return {
    suggestion: String(suggestion.content || "").replace(/^✨ AI suggested reply\s*/u, "").trim(),
    pending: false,
    latest_message_id: latestIncoming.id,
    suggestion_message_id: suggestion.id
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    if (!dashboardTokenValid(req)) return res.status(401).json({ error: "Unauthorized." });

    const accountId = Number(req.query?.account_id || 0);
    const conversationId = Number(req.query?.conversation_id || 0);
    if (!accountId || !conversationId) return res.status(400).json({ error: "Missing conversation context." });

    const apiToken = String(process.env.CHATWOOT_API_TOKEN || "").trim();
    if (!apiToken) return res.status(500).json({ error: "Chatwoot API token is not configured." });

    const response = await fetch(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      headers: { api_access_token: apiToken }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: `Chatwoot fetch failed (${response.status}).` });

    const messages = Array.isArray(body?.payload) ? body.payload : [];
    return res.status(200).json(latestSuggestionForLatestCustomerMessage(messages));
  } catch (error) {
    console.error("Dashboard suggestion error", error);
    return res.status(500).json({ error: "Could not load the AI suggestion." });
  }
}
