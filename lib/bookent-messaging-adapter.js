/**
 * bookent.ai's boundary around the messaging engine.
 *
 * This intentionally does not import the Be Studios Chatwoot Cloud settings.
 * Production bookent traffic may only point at the dedicated self-hosted engine.
 */
const SUPPORTED_CHANNELS = new Set(["WhatsApp", "Instagram", "Messenger", "Email", "Website chat"]);

function configuredEngineUrl() {
  const value = String(process.env.BOOKENT_MESSAGING_ENGINE_URL || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function messagingEngineStatus() {
  const engineUrl = configuredEngineUrl();
  const hasProvisioningKey = Boolean(String(process.env.BOOKENT_MESSAGING_ENGINE_API_TOKEN || "").trim());
  return {
    ready: Boolean(engineUrl && hasProvisioningKey),
    engineUrl,
    reason: engineUrl
      ? (hasProvisioningKey ? null : "The messaging-engine provisioning key is not configured.")
      : "The self-hosted messaging engine is not configured yet."
  };
}

export function isMessagingChannel(provider) {
  return SUPPORTED_CHANNELS.has(String(provider || ""));
}

export function buildConnectionRequest({ workspaceId, integrationId, provider }) {
  const status = messagingEngineStatus();
  if (!isMessagingChannel(provider)) {
    return { ok: false, status: 400, error: "This integration is not a messaging channel." };
  }
  if (!status.ready) {
    return {
      ok: false,
      status: 503,
      error: "Channel setup is not available yet.",
      detail: status.reason,
      connection_status: "not_configured"
    };
  }

  // The engine endpoint will be implemented on the dedicated Chatwoot host. Keeping
  // this contract here means the bookent UI never talks to Chatwoot directly.
  return {
    ok: true,
    status: 202,
    connection_status: "setup_required",
    request: {
      workspace_id: workspaceId,
      integration_id: integrationId,
      provider,
      engine_url: status.engineUrl
    }
  };
}
