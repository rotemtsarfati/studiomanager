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
4. Start Postgres and Redis.
5. Run Chatwoot database preparation.
6. Start Rails + Sidekiq.
7. Put HTTPS reverse proxy in front of port 3000.
8. Create one Platform App/API key for the bookent.ai backend.
9. Store that key server-side only.
10. Provision one Chatwoot Account automatically per bookent.ai workspace.

## Product rule

Do not expose or depend on Chatwoot Cloud pricing/accounts. The messaging engine is self-hosted and replaceable behind a bookent.ai adapter contract.
