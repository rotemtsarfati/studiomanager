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
    const websiteCandidates = leads.filter((lead) => {
      const source = String(lead?.lead_source ?? lead?.source ?? "").trim().toLowerCase();
      const status = String(lead?.lead_status ?? lead?.status ?? "").trim().toLowerCase();
      return status === "created" && source !== "commercial";
    });

    const withCommentLikeField = websiteCandidates.find((lead) =>
      Object.keys(lead || {}).some((k) => /comment|note|message/i.test(k))
    ) || websiteCandidates[0] || null;

    if (!withCommentLikeField) {
      return res.status(404).json({ error: "No Created non-Commercial lead found in first 500 leads" });
    }

    const keys = Object.keys(withCommentLikeField);
    const commentLike = {};
    for (const key of keys) {
      if (/comment|note|message/i.test(key)) commentLike[key] = withCommentLikeField[key];
    }

    return res.status(200).json({
      ok: true,
      user_id: withCommentLikeField.user_id ?? withCommentLikeField.id ?? null,
      lead_status: withCommentLikeField.lead_status ?? withCommentLikeField.status ?? null,
      lead_source: withCommentLikeField.lead_source ?? withCommentLikeField.source ?? null,
      created_time: withCommentLikeField.created_time ?? withCommentLikeField.created_at ?? null,
      first_name: withCommentLikeField.first_name ?? null,
      last_name: withCommentLikeField.last_name ?? null,
      phone_masked: maskPhone(withCommentLikeField.phone ?? withCommentLikeField.phone_number ?? withCommentLikeField.mobile),
      email_masked: maskEmail(withCommentLikeField.email),
      all_keys: keys,
      comment_like_fields: commentLike
    });
  } catch (error) {
    console.error("debug-arbox-website-lead error", error);
    return res.status(500).json({ error: error.message || "debug failed" });
  }
}
