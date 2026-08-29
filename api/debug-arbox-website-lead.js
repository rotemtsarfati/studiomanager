const ARBOX_LEADS_URL = "https://arboxserver.arboxapp.com/api/public/v3/leads";
const ARBOX_LOCATION_ID = "21673";

function pickLeadArray(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["data", "items", "results", "leads", "payload"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}

function timeValue(lead) {
  const raw = String(lead?.created_time ?? lead?.created_at ?? lead?.createdAt ?? "").trim();
  const parsed = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskEmail(value) {
  const s = String(value || "");
  const at = s.indexOf("@");
  if (at <= 1) return s ? "***" : "";
  return `${s.slice(0,1)}***${s.slice(at)}`;
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return `***${digits.slice(-4)}`;
}

function summarize(lead) {
  const keys = Object.keys(lead || {});
  const commentLike = {};
  for (const key of keys) if (/comment|note|message/i.test(key)) commentLike[key] = lead[key];
  return {
    user_id: lead?.user_id ?? lead?.id ?? null,
    lead_status: lead?.lead_status ?? lead?.status ?? null,
    lead_source: lead?.lead_source ?? lead?.source ?? null,
    created_time: lead?.created_time ?? lead?.created_at ?? null,
    first_name: lead?.first_name ?? null,
    last_name: lead?.last_name ?? null,
    phone_masked: maskPhone(lead?.phone ?? lead?.phone_number ?? lead?.mobile),
    email_masked: maskEmail(lead?.email),
    all_keys: keys,
    comment_like_fields: commentLike
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const apiKey = String(process.env.ARBOX_API_KEY || "").trim();
    if (!apiKey) throw new Error("ARBOX_API_KEY missing");

    const url = new URL(ARBOX_LEADS_URL);
    url.searchParams.set("limit", "500");
    url.searchParams.set("page", "1");
    url.searchParams.set("location_id", ARBOX_LOCATION_ID);

    const response = await fetch(url, { headers: { Accept: "application/json", "api-key": apiKey } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Arbox leads fetch failed (${response.status})`);

    const leads = pickLeadArray(body).sort((a, b) => timeValue(b) - timeValue(a));
    const sources = [...new Set(leads.map((lead) => String(lead?.lead_source ?? lead?.source ?? "").trim()).filter(Boolean))];

    const websiteLike = leads.find((lead) => /website|web/i.test(String(lead?.lead_source ?? lead?.source ?? "")));
    const nonCommercialWithComment = leads.find((lead) => {
      const source = String(lead?.lead_source ?? lead?.source ?? "").trim().toLowerCase();
      const hasCommentField = Object.keys(lead || {}).some((k) => /comment|note|message/i.test(k));
      return source && source !== "commercial" && hasCommentField;
    });
    const anyWithComment = leads.find((lead) => Object.keys(lead || {}).some((k) => /comment|note|message/i.test(k)));
    const match = websiteLike || nonCommercialWithComment || anyWithComment || null;

    return res.status(200).json({
      ok: true,
      total_leads: leads.length,
      distinct_sources: sources,
      selected_reason: websiteLike ? "website-like source" : nonCommercialWithComment ? "non-commercial lead with comment-like field" : anyWithComment ? "any lead with comment-like field" : "none",
      selected: match ? summarize(match) : null,
      newest_five: leads.slice(0,5).map((lead) => ({
        user_id: lead?.user_id ?? lead?.id ?? null,
        lead_status: lead?.lead_status ?? lead?.status ?? null,
        lead_source: lead?.lead_source ?? lead?.source ?? null,
        created_time: lead?.created_time ?? lead?.created_at ?? null,
        comment_like_fields: Object.fromEntries(Object.entries(lead || {}).filter(([k]) => /comment|note|message/i.test(k)))
      }))
    });
  } catch (error) {
    console.error("debug-arbox-website-lead error", error);
    return res.status(500).json({ error: error.message || "debug failed" });
  }
}
