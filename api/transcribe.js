import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

    const dataUrl = String(req.body?.audio || "").trim();
    if (!dataUrl || !dataUrl.startsWith("data:") || !dataUrl.includes(",")) {
      return res.status(400).json({ error: "Missing audio." });
    }

    const commaIndex = dataUrl.indexOf(",");
    const metadata = dataUrl.slice(5, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);

    if (!metadata.toLowerCase().includes(";base64") || !payload) {
      return res.status(400).json({ error: "Invalid audio format." });
    }

    const mime = (metadata.split(";")[0] || "audio/webm").toLowerCase();
    if (!mime.startsWith("audio/")) {
      return res.status(400).json({ error: "Invalid audio format." });
    }

    const cleanBase64 = payload.replace(/\s/g, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    if (!buffer.length) return res.status(400).json({ error: "Empty audio." });
    if (buffer.length > 4_000_000) {
      return res.status(413).json({ error: "Voice note is too long. Please keep it under about one minute." });
    }

    const extension =
      mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")
        ? "m4a"
        : mime.includes("ogg")
          ? "ogg"
          : mime.includes("wav")
            ? "wav"
            : "webm";

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
