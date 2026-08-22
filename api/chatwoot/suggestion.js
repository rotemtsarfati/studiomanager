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

function isOutgoing(item) {
  return item?.private !== true && (item?.message_type === 1 || item?.message_type === "outgoing");
}

function buildHistory(messages, currentMessageId) {
  // Preserve the actual recent sequence, including a proactive Be Studios message
  // that may have started the conversation before the customer's first reply.
  // The previous implementation dropped outgoing messages unless they followed
  // an incoming customer message, which lost context such as a free-trial offer.
  return [...messages]
    .filter((item) => item && item?.private !== true && Number(item?.id) !== Number(currentMessageId))
    .filter((item) => (isIncoming(item) || isOutgoing(item)) && String(item?.content || "").trim())
    .sort((a, b) => messageTime(a) - messageTime(b))
    .slice(-6)
    .map((item) => ({
      customer: isIncoming(item) ? String(item.content || "").trim() : "",
      reply: isOutgoing(item) ? String(item.content || "").trim() : ""
    }));
}

async function generateOnDemand(req, latestIncoming, history) {
  const host = String(req.headers?.host || "studiomanager-blush.vercel.app");
  const proto = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const response = await fetch(`${proto}://${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: String(latestIncoming?.content || "").trim(), history })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI generation failed (${response.status}): ${body?.error || "unknown"}`);
  return String(body?.reply || "").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    if (!dashboardTokenValid(req)) return res.status(401).json({ error: "Unauthorized." });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

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
    const latestIncoming = [...messages].filter(isIncoming).sort((a, b) => messageTime(b) - messageTime(a))[0];
    if (!latestIncoming) return res.status(200).json({ suggestion: "", pending: false });

    const history = buildHistory(messages, latestIncoming.id);
    const latestCustomerMessage = String(latestIncoming.content || "").trim();

    // Always generate from the current Chatwoot conversation state. This avoids
    // reusing a private-note suggestion that may have been generated from only
    // the latest message and therefore missed the preceding offer/context.
    const suggestion = await generateOnDemand(req, latestIncoming, history);
    return res.status(200).json({
      suggestion,
      pending: false,
      latest_message_id: latestIncoming.id,
      latest_customer_message: latestCustomerMessage,
      history,
      source: "generated_on_demand"
    });
  } catch (error) {
    console.error("Dashboard suggestion error", error);
    return res.status(500).json({ error: "Could not load or generate the AI suggestion." });
  }
}
