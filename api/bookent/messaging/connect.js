import { buildConnectionRequest } from "../../../lib/bookent-messaging-adapter.js";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

async function verifiedUser(req) {
  const authorization = String(req.headers?.authorization || "");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: authorization }
  });
  if (!response.ok) return null;
  return response.json();
}

async function isWorkspaceOwner(userId, workspaceId) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/workspace_members`);
  url.searchParams.set("select", "role");
  url.searchParams.set("workspace_id", `eq.${workspaceId}`);
  url.searchParams.set("user_id", `eq.${userId}`);
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!response.ok) return false;
  const memberships = await response.json();
  return Array.isArray(memberships) && memberships.some((member) => ["owner", "admin"].includes(String(member.role || "").toLowerCase()));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const workspaceId = String(req.body?.workspace_id || "").trim();
  const integrationId = String(req.body?.integration_id || "").trim();
  const provider = String(req.body?.provider || "").trim();
  if (!workspaceId || !integrationId || !provider) return res.status(400).json({ error: "Missing connection details." });

  try {
    const user = await verifiedUser(req);
    if (!user) return res.status(401).json({ error: "Sign in is required." });
    if (!(await isWorkspaceOwner(user.id, workspaceId))) return res.status(403).json({ error: "Only a workspace owner can set up a channel." });

    const result = buildConnectionRequest({ workspaceId, integrationId, provider });
    if (!result.ok) return res.status(result.status).json(result);

    // Do not mark the integration connected here. A provider callback from the
    // self-hosted engine must verify its credentials and webhook first.
    return res.status(202).json({
      connection_status: result.connection_status,
      message: "Secure channel setup can begin. The channel will remain disconnected until the provider verification succeeds."
    });
  } catch (error) {
    console.error("bookent messaging connect error", error);
    return res.status(500).json({ error: "Could not start channel setup." });
  }
}
