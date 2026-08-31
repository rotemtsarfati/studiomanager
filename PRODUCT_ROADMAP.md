# Agent — product roadmap

## Product promise
Agent is an AI front desk for appointment-based businesses. It combines customer conversations, live business data and business-specific guidance so it can answer, recommend, sell, book, reschedule and escalate with configurable autonomy.

## MVP user journey
1. Create account
2. Create Business Workspace
3. Complete onboarding questionnaire
4. Connect one messaging channel
5. Connect one booking/data system
6. Import services, prices, staff, availability and policies
7. Review generated Business Brain
8. Run test conversations
9. Choose autonomy level
10. Go live

## Core product modules

### 1. Identity and multi-tenancy
- users
- businesses/workspaces
- workspace members + roles
- secure per-business data isolation

### 2. Business Brain
- business profile
- services and packages
- tone and response style
- policies
- FAQ/knowledge
- learned rules
- customer-specific notes
- confidence and escalation rules

### 3. Universal action layer
The AI should call generic business actions, never vendor-specific logic directly:
- get_customer
- get_services
- get_packages
- get_availability
- create_booking
- reschedule_booking
- cancel_booking
- get_payment_link
- send_message

Vendor connectors translate those actions to Arbox, Fresha, Mindbody, calendars, etc.

### 4. Messaging inbox
- unified conversations
- channel metadata
- AI draft
- approve/send
- revise by text or voice
- save correction as rule
- human takeover

### 5. Integrations
MVP priority:
- WhatsApp
- Instagram / Messenger
- Arbox
- Google Calendar

Then:
- Fresha
- Mindbody
- Calendly
- Stripe/payment providers

### 6. Agent learning
Every correction can be saved as:
- this reply only
- this customer only
- similar situations
- business-wide rule
Rules should be editable, auditable and removable.

### 7. Autonomy and safety
Per capability:
- suggest only
- reply automatically when confident
- reply + execute action
- always require approval
Sensitive actions such as refunds should default to approval.

## Data model v1
- users
- businesses
- business_members
- business_profiles
- integrations
- services
- packages
- staff
- business_rules
- customers
- conversations
- messages
- ai_drafts
- approvals
- action_runs
- learned_feedback

## Technical milestones

### Milestone 1 — SaaS foundation
- move from single Be Studios configuration to business_id scoped configuration
- authentication
- database
- onboarding persisted server-side
- workspace settings
- light/dark theme

### Milestone 2 — Business Brain
- convert onboarding answers into structured configuration
- rule editor
- knowledge import
- test conversation simulator

### Milestone 3 — Connector framework
- generic connector interface
- migrate existing Arbox integration into connector
- per-workspace credentials
- connection health checks

### Milestone 4 — Inbox
- real multi-channel conversation list
- AI draft/revise/send
- voice feedback
- approval state

### Milestone 5 — Actions
- booking/reschedule/cancel
- package/payment recommendation
- audit log + rollback/confirmation where applicable

### Milestone 6 — commercial product
- subscription/billing
- usage limits
- onboarding analytics
- admin/support tools
- privacy/export/delete flows

### Milestone 7 — mobile apps
Use the same backend and product model. Ship mobile after the web app is stable, with push notifications and approval workflows as the primary mobile value.

## Build principle
Be Studios becomes the first Business Workspace and test customer. Existing Be Studios logic should be migrated into workspace data and reusable connectors instead of being deleted or rewritten from scratch.
