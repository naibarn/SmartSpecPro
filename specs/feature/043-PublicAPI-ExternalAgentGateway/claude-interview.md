# Interview Transcript — 043-PublicAPI-ExternalAgentGateway

Date: 2026-03-14

---

## Q1: Which external agents/platforms are the highest-priority consumers?

**Answer:** All equally — no single platform takes priority. Build the full API surface in parallel covering Manus AI, OpenClaw, custom agent builders, and internal tools.

## Q2: Expected API scale in the first 6 months?

**Answer:** Low — fewer than 100 API keys, under 1K requests/day. Small team/pilot usage. Simple infrastructure is acceptable; no need for horizontal scaling considerations initially.

## Q3: Should the Admin UI (API key management, usage dashboard) be included?

**Answer:** Yes, include in this spec. Build API key CRUD UI, usage charts, and webhook management in the admin panel.

## Q4: How should the deep-plan be organized — follow spec phases or domain-based?

**Answer:** Domain-based sections. Organize by domain (auth, skills API, agencies API, MCP, admin UI) regardless of the spec's 5-phase sequencing.

## Q5: Webhook callback retry policy?

**Answer:** Both (configurable). Let API key owners choose retry policy per webhook endpoint. Support retry with exponential backoff (3 retries: 1s, 5s, 25s, then dead-letter) as default, with fire-and-forget as opt-in alternative.

## Q6: MCP client compatibility targets?

**Answer:** Spec standard only. Implement per MCP v2025-03-26 specification and test with reference client. No specific client (Claude Desktop, Cursor, Manus AI) prioritized.

## Q7: Who can create API keys — admin-only or users too?

**Answer:** Users + admin. Users can create personal API keys (scoped to their own credit budget). Admins can create tenant-wide keys. Users can view/manage their own keys but not others'.

## Q8: Should new API keys work on existing OpenAI-compatible endpoints?

**Answer:** Unified auth. New API keys work on ALL existing endpoints (/v1/chat/completions, /v1/models, etc.) through a single auth layer. No separate namespaces.

## Q9: Compliance requirements?

**Answer:** Audit logging required. All API calls must be logged with user, timestamp, and action for audit trail. No full SOC2/GDPR compliance needed — standard security best practices plus comprehensive audit logging.

---

## Key Takeaways

1. **Equal priority** across all consumer types — no phased rollout by consumer
2. **Low scale** initially — keep infrastructure simple, optimize later
3. **Full admin UI** included — not deferred
4. **Domain-based sections** for implementation planning
5. **Configurable webhooks** — retry + fire-and-forget, per endpoint
6. **MCP spec standard** — no vendor-specific compatibility hacks
7. **User + admin keys** — users create personal keys within their credit budget
8. **Unified auth** — single auth layer across all endpoints (new + existing)
9. **Audit logging** — mandatory for all API calls, standard security practices
