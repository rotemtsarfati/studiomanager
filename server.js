import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ARBOX_SCHEDULE_URL = "https://arboxserver.arboxapp.com/api/public/v3/schedule";

function cyprusToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Nicosia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function getArboxSchedule({ from_date, to_date }) {
  const apiKey = String(process.env.ARBOX_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "Live schedule is not configured yet. ARBOX_API_KEY is missing."
    };
  }

  const url = new URL(ARBOX_SCHEDULE_URL);
  url.searchParams.set("from_date", from_date);
  url.searchParams.set("to_date", to_date);
  url.searchParams.set("limit", "500");
  url.searchParams.set("registration_count", "1");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: apiKey,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "Arbox schedule request failed.",
      details: body
    };
  }

  return {
    ok: true,
    from_date,
    to_date,
    schedule: body
  };
}

const SCHEDULE_TOOL = {
  type: "function",
  name: "get_schedule",
  description:
    "Get the live Be Studios class schedule and current availability from Arbox for a specific date range. Always use this tool before answering any question about class dates, times, instructors, availability, or what classes are running. Convert relative dates such as today, tomorrow, next Monday, this weekend, or next week into exact Cyprus dates before calling it.",
  parameters: {
    type: "object",
    properties: {
      from_date: {
        type: "string",
        description: "Start date in YYYY-MM-DD format in Europe/Nicosia."
      },
      to_date: {
        type: "string",
        description: "End date in YYYY-MM-DD format in Europe/Nicosia."
      }
    },
    required: ["from_date", "to_date"],
    additionalProperties: false
  },
  strict: true
};

const INSTRUCTIONS = `You are the internal customer-response copilot for Be Studios in Cyprus.
Your job is to draft a message that a staff member can copy directly into WhatsApp or Instagram.

CONVERSATION CONTEXT
- You may receive previous customer messages and previous Be Studios replies. Use them to continue the same conversation naturally and never repeat questions already answered.
- You may receive one or more screenshots of a WhatsApp or Instagram conversation. Read the visible conversation as context, including both sides of the chat when identifiable.
- If a typed customer message is supplied, treat it as the newest customer message and the screenshots/history as context.
- If no typed message is supplied, infer the newest customer message from the screenshots and draft the next Be Studios reply.
- Do not mention screenshots, extracted text, or internal context to the customer.

STYLE
- Reply in the customer's language unless staff asks otherwise; for English customers use natural warm English.
- Keep replies short, conversational and human. Usually 1-4 sentences.
- Do not dump information. Answer the question, then ask one useful question that moves the conversation forward when appropriate.
- Never sound corporate or robotic.

SALES / CONVERSATION
- For someone who has never visited Be Studios, naturally guide toward a first trial class when appropriate.
- Before recommending a class, understand relevant experience, goals and any injury/physical limitation that could affect class choice.
- Do not provide medical diagnosis or medical advice.
- Do not interrogate: ask only the most useful next question.
- Be Studios offers both Reformer Pilates and mat/strength-based classes. When a customer mentions strength training, mat work, or interest in both, do not position Reformer as a replacement. Explain briefly that the two approaches complement each other and that combining them is often the best fit.
- In that situation, naturally invite a new customer to try a Reformer class first and, when appropriate, also suggest trying one of the mat/strength classes later so they can experience both sides of the studio.
- After that, ask one relevant follow-up question, usually about injuries, physical limitations, experience level, or goals, whichever is most useful for choosing the first class.

LIVE SCHEDULE / DATE RULES
- The studio timezone is Europe/Nicosia, Cyprus.
- You will be given today's exact Cyprus date in the user context. Use it to resolve relative dates correctly.
- For ANY question about schedule, class dates, class times, instructors, availability, spaces/spots, or what is running, you MUST call get_schedule before answering. Never answer from memory.
- If the customer asks about one day, request only that day. If they ask about a range/weekend/week, request only the smallest useful range.
- Respect every constraint in the customer's message. If they ask for Reformer, return only Reformer classes. If they ask for evening, return only classes matching that period. Do not include unrelated classes unless the customer asks for alternatives.
- Do not call a date "tomorrow" unless it actually is tomorrow relative to the supplied Cyprus date. Prefer the customer's own wording (for example "next Monday") or the weekday/date when helpful.
- Use the live Arbox result to determine availability. Never invent spots, times, instructors, or classes.
- If the live schedule tool fails or is not configured, say briefly that you cannot verify the live schedule right now; do not guess.

ACCURACY
- Never invent schedules, availability, prices, memberships, policies, instructors or studio facts.
- If required information is not available, say so briefly rather than guessing.

OUTPUT
Return only the customer-ready reply. No analysis, labels, quotation marks, or internal notes.`;

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, 6) : [];
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];

    if (!message && images.length === 0) {
      return res.status(400).json({ error: "Add a customer message or screenshot." });
    }

    const historyText = history.length
      ? `Previous conversation:\n${history.map((item, i) => `Turn ${i + 1}\nCustomer: ${String(item.customer || "")}\nBe Studios: ${String(item.reply || "")}`).join("\n\n")}\n\n`
      : "";

    const today = cyprusToday();
    const latestText = message
      ? `Today's date in Cyprus (Europe/Nicosia): ${today}.\n\n${historyText}Latest customer message:\n${message}\n\nDraft the next Be Studios reply.`
      : `Today's date in Cyprus (Europe/Nicosia): ${today}.\n\n${historyText}Use the attached conversation screenshot(s) to identify the latest customer message and draft the next Be Studios reply.`;

    const content = [{ type: "input_text", text: latestText }];
    for (const image of images) {
      if (typeof image === "string" && image.startsWith("data:image/")) {
        content.push({ type: "input_image", image_url: image, detail: "high" });
      }
    }

    let response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      instructions: INSTRUCTIONS,
      tools: [SCHEDULE_TOOL],
      input: [{ role: "user", content }],
      max_output_tokens: 500
    });

    // Execute any live schedule tool call(s), then return the model's final customer-ready reply.
    for (let round = 0; round < 3; round += 1) {
      const calls = (response.output || []).filter(
        (item) => item.type === "function_call" && item.name === "get_schedule"
      );

      if (calls.length === 0) break;

      const toolOutputs = [];
      for (const call of calls) {
        let args;
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {
          args = {};
        }

        const result = await getArboxSchedule({
          from_date: String(args.from_date || ""),
          to_date: String(args.to_date || "")
        });

        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result)
        });
      }

      response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        instructions: INSTRUCTIONS,
        tools: [SCHEDULE_TOOL],
        previous_response_id: response.id,
        input: toolOutputs,
        max_output_tokens: 500
      });
    }

    res.json({ reply: response.output_text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not generate a reply." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Be Studios Copilot running on port ${port}`));
