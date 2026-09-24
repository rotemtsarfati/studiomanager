import { messagingEngineStatus } from "../../../lib/bookent-messaging-adapter.js";

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const status = messagingEngineStatus();
  // Never return the private host or any credential information to the browser.
  return res.status(200).json({ ready: status.ready, detail: status.reason || "Messaging engine is ready for secure setup." });
}
