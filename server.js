import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

ACCURACY
- Never invent schedules, availability, prices, memberships, policies, instructors or studio facts.
- Live schedule/availability must come from the schedule integration once enabled.
- Cyprus dates/times use Europe/Nicosia.
- Respect every constraint in the customer's request. If they ask for Reformer Monday evening, do not suggest unrelated class types unless explicitly useful and clearly presented as an alternative.
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

    const latestText = message
      ? `${historyText}Latest customer message:\n${message}\n\nDraft the next Be Studios reply.`
      : `${historyText}Use the attached conversation screenshot(s) to identify the latest customer message and draft the next Be Studios reply.`;

    const content = [{ type: "input_text", text: latestText }];
    for (const image of images) {
      if (typeof image === "string" && image.startsWith("data:image/")) {
        content.push({ type: "input_image", image_url: image, detail: "high" });
      }
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      instructions: INSTRUCTIONS,
      input: [{ role: "user", content }],
      max_output_tokens: 350
    });

    res.json({ reply: response.output_text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not generate a reply." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Be Studios Copilot running on port ${port}`));
