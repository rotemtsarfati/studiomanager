function dashboardTokenValid(req) {
  const expected = String(process.env.CHATWOOT_DASHBOARD_TOKEN || "").trim();
  const provided = String(req.get("x-dashboard-token") || req.query?.token || "").trim();
  return Boolean(expected && provided && expected === provided);
}

function latestSuggestion(messages) {
  return [...messages]
    .filter((item) => item?.private === true && String(item?.content || "").includes("✨ AI suggested reply"))
    .sort((a, b) => Number(b?.created_at || b?.id || 0) - Number(a?.created_at || a?.id || 0))
    .map((item) => String(item.content || "").replace(/^✨ AI suggested reply\s*/u, "").trim())
    .find(Boolean) || "";
}

export function installChatwootDashboard({ app, getChatwootConversationMessages, chatwootHeaders, CHATWOOT_BASE_URL }) {
  app.get("/api/chatwoot/suggestion", async (req, res) => {
    try {
      if (!dashboardTokenValid(req)) return res.status(401).json({ error: "Unauthorized." });
      const accountId = Number(req.query?.account_id || 0);
      const conversationId = Number(req.query?.conversation_id || 0);
      if (!accountId || !conversationId) return res.status(400).json({ error: "Missing conversation context." });

      const messages = await getChatwootConversationMessages(accountId, conversationId);
      return res.json({ suggestion: latestSuggestion(messages) });
    } catch (error) {
      console.error("Chatwoot suggestion fetch error", error);
      return res.status(500).json({ error: "Could not load the AI suggestion." });
    }
  });

  app.post("/api/chatwoot/send-suggestion", async (req, res) => {
    try {
      if (!dashboardTokenValid(req)) return res.status(401).json({ error: "Unauthorized." });
      const accountId = Number(req.body?.account_id || 0);
      const conversationId = Number(req.body?.conversation_id || 0);
      const content = String(req.body?.content || "").trim();
      if (!accountId || !conversationId || !content) return res.status(400).json({ error: "Missing reply or conversation context." });

      const response = await fetch(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: chatwootHeaders(),
        body: JSON.stringify({
          content,
          message_type: "outgoing",
          private: false,
          content_type: "text",
          content_attributes: { source: "be_studios_copilot_dashboard" }
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Chatwoot send failed: ${response.status} ${JSON.stringify(body)}`);
      return res.json({ ok: true, message: body });
    } catch (error) {
      console.error("Chatwoot dashboard send error", error);
      return res.status(500).json({ error: "Could not send the reply." });
    }
  });
}
