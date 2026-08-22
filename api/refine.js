export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

    const host = String(req.headers?.host || "studiomanager-blush.vercel.app");
    const proto = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
    const response = await fetch(`${proto}://${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: req.body?.message,
        history: req.body?.history,
        guidance: req.body?.guidance,
        refinement: {
          currentReply: req.body?.currentReply,
          feedback: req.body?.feedback
        }
      })
    });

    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text || "Invalid server response." }; }
    if (!response.ok) return res.status(response.status).json(body);
    return res.status(200).json(body);
  } catch (error) {
    console.error("Standalone refine error", error);
    return res.status(500).json({ error: "Could not revise the reply." });
  }
}
