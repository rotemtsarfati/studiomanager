import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

    const dataUrl = String(req.body?.audio || "").trim();
    if (!dataUrl || !dataUrl.includes(",")) return res.status(400).json({ error: "Missing audio." });

    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "Invalid audio format." });

    const mime = match[1] || "audio/webm";
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) return res.status(400).json({ error: "Empty audio." });
    if (buffer.length > 4_000_000) return res.status(413).json({ error: "Voice note is too long. Please keep it under about one minute." });

    const extension = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const file = new File([buffer], `voice.${extension}`, { type: mime });

    const transcript = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
      language: "he"
    });

    const text = String(transcript?.text || "").trim();
    if (!text) return res.status(422).json({ error: "Could not hear the voice note clearly." });
    return res.status(200).json({ text });
  } catch (error) {
    console.error("Voice transcription error", error);
    return res.status(500).json({ error: "Could not transcribe the voice note." });
  }
}
