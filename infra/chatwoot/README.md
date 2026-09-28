# bookent.ai Messaging Engine

bookent.ai uses Chatwoot Community Edition as a self-hosted messaging engine. Chatwoot is infrastructure only; customers use the bookent.ai UI and do not need a Chatwoot Cloud account.

## Ownership split

Chatwoot owns transport/inbox infrastructure:
- channel connections
- contacts/conversations/messages
- attachments
- delivery/read state
- realtime inbox behavior
- WhatsApp / Instagram / email / website chat adapters

bookent.ai owns product intelligence:
- Supabase authentication and workspaces
- subscriptions and usage
- Business Brain / knowledge / rules
- AI reply generation and revisions
- business-system connectors and actions
- platform admin and privacy controls

## Multi-tenant mapping

One bookent.ai workspace maps to one Chatwoot account.

Supabase stores only the mapping and product-level metadata. Chatwoot message content remains in the self-hosted messaging engine. The normal bookent.ai platform-admin product must not expose customer conversation content.

Expected mapping:

bookent workspace.id -> messaging_engine_accounts.external_account_id (Chatwoot account id)
bookent channel connection -> Chatwoot inbox id

## Adapter contract

The browser must never call Chatwoot directly. It calls the bookent.ai backend
endpoint `POST /api/bookent/messaging/connect`, which authenticates the workspace
owner and delegates to this engine only after it has been configured.

Set these application-side secrets only when the dedicated host is ready:

- `BOOKENT_MESSAGING_ENGINE_URL` — HTTPS URL of the dedicated engine, for example `https://messages.bookent.ai`
- `BOOKENT_MESSAGING_ENGINE_API_TOKEN` — server-to-server provisioning token
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — used by the backend to verify workspace ownership

Until those secrets, the engine host, and provider credentials are present, the
endpoint intentionally returns `not_configured`. It must never mark WhatsApp,
Instagram, Messenger, email, or website chat as connected on its own.

## Production topology

- bookent.ai frontend/API: existing app infrastructure
- bookent.ai product database/auth: Supabase
- Messaging Engine: dedicated Docker host
- Chatwoot PostgreSQL: private to Messaging Engine
- Redis: private to Messaging Engine
- public engine hostname: messages.bookent.ai (planned)

Do not run Chatwoot on Vercel. It requires persistent Rails/Sidekiq/PostgreSQL/Redis services.

## First deployment

1. Provision a Linux VM or managed container host with persistent volumes.
2. Copy `docker-compose.production.yml` and `.env.example` to the host.
3. Create real `.env` secrets on the server only.
4. Set `CHATWOOT_HOSTNAME=messages.bookent.ai` and point that DNS record to
   the host before starting Caddy; it obtains and renews TLS automatically.
5. Start Postgres and Redis.
6. Run Chatwoot database preparation with
   `docker compose run --rm rails bundle exec rails db:chatwoot_prepare`.
7. Start Rails, Sidekiq and Caddy with `docker compose up -d`.
8. Create one Platform App/API key for the bookent.ai backend.
9. Store that key server-side only.
10. Provision one Chatwoot Account automatically per bookent.ai workspace.

The compose file pins the reviewed upstream Community Edition release. See
`UPSTREAM.md` for its exact source revision and licence notice.

## What is still needed before the Be Studios pilot can connect

1. A persistent Linux host and the `messages.bookent.ai` DNS record.
2. A Meta developer app configured with the production callback URL on that
   host, plus the WhatsApp Business Account/number and Instagram/Facebook Page.
3. Server-only provider secrets and the Chatwoot platform API token stored in
   the bookent.ai backend environment.

Only after those items are in place should the UI let a studio authorize a
provider. Until then it must clearly remain disconnected.

## Product rule

Do not expose or depend on Chatwoot Cloud pricing/accounts. The messaging engine is self-hosted and replaceable behind a bookent.ai adapter contract.
