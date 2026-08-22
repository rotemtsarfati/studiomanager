import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BE_STUDIOS_LINKTREE = "https://linktr.ee/Be_Studios_Cyprus?utm_source=linktree_profile_share&ltsid=1a7ec7a4-e819-4579-8a89-fd847f7ae502";
const BE_STUDIOS_MEMBERSHIP_SHOP = "https://drFoaEPs.web.arboxapp.com/membership?whitelabel=BeStudios&lang=en&location=21673&referrer=PLUGIN";
const NEW_CLIENT_REGISTRATION_FORM = "https://drFoaEPs.web.arboxapp.com/?whitelabel=BeStudios&lang=en&location=21673&referrer=PLUGIN";
const ARBOX_SCHEDULE_URL = "https://arboxserver.arboxapp.com/api/public/v3/schedule";
const ARBOX_MEMBERSHIPS_URL = "https://arboxserver.arboxapp.com/api/public/v3/membershipTypes";
const ARBOX_LOCATION_ID = "21673";

function cyprusToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function getArboxSchedule({ from_date, to_date }) {
  const apiKey = String(process.env.ARBOX_API_KEY || "").trim();
  if (!apiKey) return { ok: false, error: "Live schedule is not configured." };
  const url = new URL(ARBOX_SCHEDULE_URL);
  url.searchParams.set("from_date", from_date);
  url.searchParams.set("to_date", to_date);
  url.searchParams.set("limit", "500");
  url.searchParams.set("registration_count", "1");
  const r = await fetch(url, { headers: { Accept: "application/json", "api-key": apiKey } });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return r.ok ? { ok: true, schedule: body } : { ok: false, status: r.status, error: "Schedule request failed." };
}

async function getArboxMembershipTypes() {
  const apiKey = String(process.env.ARBOX_API_KEY || "").trim();
  if (!apiKey) return { ok: false, error: "Membership packages are not configured." };
  const url = new URL(ARBOX_MEMBERSHIPS_URL);
  url.searchParams.set("active", "1");
  url.searchParams.set("limit", "500");
  url.searchParams.set("page", "1");
  url.searchParams.set("location_id", ARBOX_LOCATION_ID);
  url.searchParams.set("with_membership_types_props", "1");
  const r = await fetch(url, { headers: { Accept: "application/json", "api-key": apiKey } });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (r.ok) return { ok: true, membership_types: body };
  return { ok: false, status: r.status, shop_url: BE_STUDIOS_MEMBERSHIP_SHOP };
}

const TOOLS = [
  { type: "function", name: "get_schedule", description: "Get the live Be Studios class schedule and current availability from Arbox for a specific date range.", parameters: { type: "object", properties: { from_date: { type: "string" }, to_date: { type: "string" } }, required: ["from_date", "to_date"], additionalProperties: false }, strict: true },
  { type: "function", name: "get_membership_types", description: "Get active Be Studios membership/package types from Arbox. The token field creates https://arbox.link/<token>.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true }
];

const INSTRUCTIONS = `You are the internal customer-response copilot for Be Studios in Cyprus. Return only a customer-ready WhatsApp/Instagram/email reply.

CORE BUSINESS RULES
- Be Studios' Pilates offering is Reformer Pilates. If a customer says only "Pilates", interpret it as Reformer Pilates. Never mention Mat Pilates unless the customer explicitly asks for Mat Pilates/mat/floor Pilates.
- Mat Pilates is no longer offered. If explicitly asked, say so warmly and redirect to Reformer Pilates. Official timetable/link: ${BE_STUDIOS_LINKTREE}
- New clients who are ready to register/book may need the registration form: ${NEW_CLIENT_REGISTRATION_FORM}. Do not send it too early or to a lead who clearly already submitted details.
- For package/session-count/pricing requests, use live Arbox memberships. If an exact package has token, send https://arbox.link/<token>, never the generic shop instead.
- For specific dates/times/instructors/availability, use live Arbox schedule before making any claim. Never invent availability.
- Private Reformer: €70 for 1 person. Semi-private: €90 total for 2 people. Never invent availability.
- Trial offer is only for people who live permanently in the Paphos area. If someone is a tourist/visitor, explain this softly and warmly, and invite them to contact the studio closer to their visit so you can help find the best regular Reformer class/time.
- FREE TRIAL CONTEXT IS BINDING: if Be Studios already offered a free trial earlier in the conversation and the customer accepts, asks for more details, or says they are interested, continue the free-trial flow. Do NOT send prices, packages, purchase links, or the generic timetable unless the customer explicitly changes the topic to paid options.
- For an eligible free-trial lead who lives permanently in/has moved to the Paphos area: first use what they already told us. If prior Reformer experience is already known, do not ask whether they have done Pilates before. If morning/evening preference is unknown, ask that next. Once morning/evening is known, if level is still unknown ask whether they would prefer to start with Beginner, Intermediate, or Advanced. Once residence eligibility, time preference, and suitable starting level are known, send the registration form ${NEW_CLIENT_REGISTRATION_FORM} and explain that Be Studios will place/book them into the most suitable free-trial class. Ask only one missing step at a time.
- Pregnancy/injuries/health: do not diagnose or give medical clearance. Be warm and safety-conscious. For someone pregnant, injured, or with significant physical limitations, recommend discussing suitability with their healthcare professional when appropriate and explain that a private introductory session may be a better starting point before joining a group class. Do not claim a specific group class is suitable without enough information/live context.
- Medical cancellation/package-extension requests for genuine medical issues are approved: confirm cancellations/extension warmly; do not say you need to check approval.

CONVERSATION
- Continue naturally from previous turns. Do not repeat questions already answered.
- Read the recent conversation as a sequence, including Be Studios messages that came before the customer's reply. A previous Be Studios offer or question defines what short replies such as "yes", "I'd love more details", or "sounds good" refer to.
- Always use at least the recent 2-3 messages when available, not just the newest customer message.
- The newest typed message is the newest customer message. If there is no typed message, infer the newest customer message from the attached screenshot(s).
- Preserve all known constraints and facts.
- Never mention screenshots, internal tools, APIs or system details to the customer.

STYLE
- Reply in the customer's language. Warm, human, concise, usually 1-4 short sentences. Ask at most one useful follow-up question.
- Never invent prices, policies, schedules, availability, instructors, memberships, or facts.

REFINEMENT
- If staff asks to change a drafted reply, obey the staff feedback while preserving business rules and customer facts. Return only the revised customer-ready reply.`;

function hasPackageIntent(text) {
  return /(package|membership|payment|purchase|buy|class pack|session pack|\b\d+\s*(classes|lessons|sessions|entries)\b)/i.test(String(text || ""));
}

function cleanGuidance(items) {
  if (!Array.isArray(items)) return [];
  return items.map(x => String(x || "").trim()).filter(Boolean).slice(-24);
}

async function generateReply({ message = "", images = [], history = [], guidance = [], refinement = null }) {
  const cleanMessage = String(message || "").trim();
  const cleanImages = Array.isArray(images) ? images.filter(x => typeof x === "string" && x.startsWith("data:image/")).slice(0, 6) : [];
  const cleanHistory = Array.isArray(history) ? history.slice(-8) : [];
  const cleanStaffGuidance = cleanGuidance(guidance);
  const isRefinement = refinement && String(refinement.feedback || "").trim();
  if (!cleanMessage && cleanImages.length === 0 && !isRefinement) throw new Error("Missing customer message or screenshot.");

  const historyText = cleanHistory.length ? `Previous conversation:\n${cleanHistory.map((x, i) => `Turn ${i + 1}\nCustomer: ${String(x.customer || "")}\nBe Studios: ${String(x.reply || "")}`).join("\n\n")}\n\n` : "";
  const guidanceText = cleanStaffGuidance.length ? `Staff guidance learned from previous edits:\n${cleanStaffGuidance.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\n` : "";
  let packageContext = "";
  const packageSource = `${cleanMessage}\n${cleanHistory.map(x => `${x.customer || ""} ${x.reply || ""}`).join("\n")}\n${refinement?.feedback || ""}`;
  if (hasPackageIntent(packageSource)) packageContext = `LIVE ARBOX PACKAGE DATA:\n${JSON.stringify(await getArboxMembershipTypes())}\n\n`;

  const text = isRefinement
    ? `Today's date in Cyprus: ${cyprusToday()}.\n\n${packageContext}${guidanceText}${historyText}Newest customer message: ${cleanMessage}\n\nCurrent draft:\n${String(refinement.currentReply || "")}\n\nStaff requested change:\n${String(refinement.feedback || "")}\n\nRevise the draft.`
    : cleanMessage
      ? `Today's date in Cyprus: ${cyprusToday()}.\n\n${packageContext}${guidanceText}${historyText}Newest customer message:\n${cleanMessage}\n\nDraft the next Be Studios reply.`
      : `Today's date in Cyprus: ${cyprusToday()}.\n\n${packageContext}${guidanceText}${historyText}Use the attached conversation screenshot(s) to identify the latest customer message and draft the next Be Studios reply.`;

  const content = [{ type: "input_text", text }];
  for (const image of cleanImages) content.push({ type: "input_image", image_url: image, detail: "high" });

  let response = await client.responses.create({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions: INSTRUCTIONS, tools: TOOLS, input: [{ role: "user", content }], max_output_tokens: 350 });
  for (let round = 0; round < 4; round++) {
    const calls = (response.output || []).filter(x => x.type === "function_call");
    if (!calls.length) break;
    const outputs = [];
    for (const call of calls) {
      let args = {}; try { args = JSON.parse(call.arguments || "{}"); } catch {}
      const result = call.name === "get_schedule" ? await getArboxSchedule(args) : await getArboxMembershipTypes();
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
    response = await client.responses.create({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions: INSTRUCTIONS, tools: TOOLS, previous_response_id: response.id, input: outputs, max_output_tokens: 350 });
  }
  return String(response.output_text || "").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    const reply = await generateReply({
      message: req.body?.message,
      images: req.body?.images,
      history: req.body?.history,
      guidance: req.body?.guidance,
      refinement: req.body?.refinement
    });
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Standalone chat error", error);
    return res.status(500).json({ error: "Could not generate a reply." });
  }
}
