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

function isUnavailableText(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text || text === "unavailable" || text === "message unavailable" || text === "[unavailable]";
}

function extractMessageText(item) {
  const direct = String(item?.content || "").trim();
  if (!isUnavailableText(direct)) return direct;

  const attrs = item?.content_attributes && typeof item.content_attributes === "object" ? item.content_attributes : {};
  const candidates = [attrs.text, attrs.body, attrs.caption, attrs.message, attrs.content, attrs?.wa_message?.text?.body, attrs?.wa_message?.caption];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (!isUnavailableText(text)) return text;
  }

  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
  for (const attachment of attachments) {
    const caption = String(attachment?.caption || attachment?.description || "").trim();
    if (!isUnavailableText(caption)) return caption;
  }
  return "";
}

function buildHistory(messages, currentMessageId) {
  return [...messages]
    .filter((item) => item && item?.private !== true && Number(item?.id) !== Number(currentMessageId))
    .filter((item) => isIncoming(item) || isOutgoing(item))
    .sort((a, b) => messageTime(a) - messageTime(b))
    .slice(-8)
    .map((item) => ({
      customer: isIncoming(item) ? extractMessageText(item) : "",
      reply: isOutgoing(item) ? extractMessageText(item) : ""
    }))
    .filter((item) => item.customer || item.reply)
    .slice(-6);
}

async function generateOnDemand(req, latestMessage, latestText, history) {
  const host = String(req.headers?.host || "studiomanager-blush.vercel.app");
  const proto = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const response = await fetch(`${proto}://${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: latestText, history })
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

    const latestCustomerMessage = extractMessageText(latestIncoming);
    const history = buildHistory(messages, latestIncoming.id);

    if (!latestCustomerMessage) {
      console.warn("CHATWOOT_LATEST_MESSAGE_UNAVAILABLE", JSON.stringify({
        account_id: accountId,
        conversation_id: conversationId,
        message_id: latestIncoming.id,
        content_type: latestIncoming?.content_type,
        has_attachments: Array.isArray(latestIncoming?.attachments) && latestIncoming.attachments.length > 0,
        content_attribute_keys: Object.keys(latestIncoming?.content_attributes || {})
      }));
      return res.status(422).json({
        error: "The latest WhatsApp message is marked unavailable in Chatwoot, so the AI cannot read its text yet. Refresh the conversation; if it stays unavailable, the issue is in the WhatsApp/Chatwoot sync rather than the AI agent.",
        latest_message_id: latestIncoming.id,
        history
      });
    }

    const suggestion = await generateOnDemand(req, latestIncoming, latestCustomerMessage, history);
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
