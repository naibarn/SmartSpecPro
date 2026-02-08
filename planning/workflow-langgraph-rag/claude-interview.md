# Interview Transcript: Workflow Editor LangGraph + RAG Integration

Date: 2026-02-08

---

## Q1: LangGraph Integration Strategy

**Q:** The codebase already has a basic LangGraph integration in the orchestrator. Should we (A) deepen the existing integration, or (B) rebuild the orchestrator from scratch around LangGraph?

**A:** Full rebuild around LangGraph. The user wants a complete rebuild of the orchestrator using LangGraph as the core runtime, not just an enhancement of the existing custom orchestrator.

---

## Q2: Node Expansion Phasing

**Q:** For the 74-node expansion: should all 74 nodes be implemented in the first release, or phased?

**A:** Custom phasing plan provided (see Q6 for full details). User will provide a specific multi-phase development plan.

---

## Q3: Vector Store for RAG

**Q:** For vector store in RAG pipeline nodes, which should be the primary production backend?

**A:** pgvector (Recommended). Already have PostgreSQL, no new infrastructure needed, good for < 5M vectors.

---

## Q4: AI Workflow Generation ("Create with AI")

**Q:** For the 'Create with AI' feature (auto-generate workflow from natural language), how important is this for the first release?

**A:** Must-have for first release. Users need to be able to describe a workflow in natural language and get a starting point in the visual editor.

---

## Q5: LangGraph Graph Architecture

**Q:** Should each workflow node become a LangGraph node in a dynamic StateGraph, or should we build LangGraph subgraphs per node category?

**A:** Hybrid approach. Common patterns (RAG pipeline, approval flow, etc.) as reusable pre-built subgraphs, individual nodes (LLM call, HTTP request, etc.) as standalone LangGraph nodes. The visual workflow compiles into a LangGraph StateGraph at runtime using this hybrid approach.

---

## Q6: Caching Implementation Scope

**Q:** Should semantic cache (pgvector similarity) be implemented alongside exact-hash cache from the start?

**A:** Exact-hash first, semantic later. Ship Redis exact-hash cache first for quick wins in Phase 1, add pgvector semantic cache in Phase 2.

---

## Q7: Policy Gate Storage

**Q:** Should policy rules be stored in the database (admin-configurable per tenant) or in code?

**A:** Both: code defaults + DB overrides. Ship with sensible code defaults, allow tenant admins to override via database/admin UI. Full admin UI for tenant-level policy management comes in Phase 3.

---

## Q8: Development Phases (Detailed)

**Q:** Please describe the development phases.

**A:** Three-phase plan:

### Phase 1: LangGraph Core Runtime + MVP Node Set + Reliability/Safety
**Goal:** Run workflow end-to-end in production (no RAG focus yet)

**1) Runtime/Infra:**
- LangGraph State + Postgres checkpointing (resume/replay)
- astream_events (streaming status/telemetry)
- interrupt() for HITL (approval/review)
- Secrets/Vault + RBAC (minimum)
- Audit log + run history + structured logs + metrics/alerts

**2) MVP Nodes (~25-35 nodes):**

Triggers:
- Manual Trigger
- Webhook / HTTP Trigger
- Schedule Trigger
- Message Queue Trigger (for async/scale)

Core I/O:
- HTTP Request (must-have)
- Database Query
- Storage Action
- Email/SMS/Chat Send (at least 1 notification channel)
- Webhook Response

Data Shaping & Control:
- Set / Edit Fields
- Map / Rename Fields
- Filter
- If
- Switch / Router
- Merge / Join
- Split / Iterator
- Batch / Chunk Processor
- JSON/XML/CSV Transformer
- Schema Validator

Reliability & Cost Control:
- Retry with Backoff
- Rate Limiter / Throttle
- Timeout / Circuit Breaker
- Idempotency / De-dup Key
- Dead Letter Queue (DLQ)
- Checkpoint / Resume (paired with LangGraph + Postgres checkpointer)

Security/Governance (minimum):
- Secrets / Credential Vault
- Permission & RBAC (at least role-based for edit/run)
- Audit Log
- Structured Logging
- Metrics & Alerting
- Run History & Replay

HITL & Code:
- Approval / Human-in-the-loop (bind to interrupt())
- Code Step (for edge cases nodes don't cover)

**3) Caching:** Exact-hash cache (Redis/DB) for deterministic tool/LLM results

**Result:** Diverse workflow execution + risk control + debug/replay capability. This is the foundation that makes Phase 2-3 grow fast.

### Phase 2: AI Layer + RAG + Model Routing + Policy Gate
**Goal:** Add AI capabilities without making the system fragile or expensive

- RAG pipeline nodes: ingest/chunk/embed/retrieve + retrieval cache
- Model routing (select model/strategy by difficulty & risk)
- Enhanced policy gate: pre-LLM (redaction, tool allowlist, budget caps), verifier/validator
- Semantic cache for safe scopes
- "Create with AI" workflow generation

**Result:** Document/text/agent workflows run "faster and cheaper" with control

### Phase 3: Expand Outputs + Enterprise/Industry Integrations
**Goal:** Complete the full 74 nodes and support real enterprise deployment

- Industry outputs: CRM/Ticketing/Marketing/Analytics-DWH/Search index/Cache KV/CI-CD/Payments/E-sign/Calendar/Push/IoT/Feature flag
- Admin UX for tenant policy overrides (DB overrides) + versioning + audit
- Multi-tenant hardening: quotas, rate controls, isolation, governance

**Result:** Cover use cases across all industries, deploy in enterprise

---

## Q9: Code Step Sandbox Language Support

**Q:** For the Code Step node (sandbox execution): should it support only Python, or also JavaScript/TypeScript?

**A:** Python + JavaScript. Support both languages in the code sandbox.

---

## Q10: Secrets/Credential Vault Architecture

**Q:** Should the Secrets/Vault integrate with external vault services or use the existing encryption system?

**A:** Abstraction layer supporting both. Internal AES-256-GCM encryption as default, with a pluggable interface to support external vaults (HashiCorp Vault, AWS Secrets Manager) later.

---

## Summary of Key Decisions

| Decision | Choice |
|----------|--------|
| LangGraph strategy | Full rebuild around LangGraph |
| Graph architecture | Hybrid: subgraphs for common patterns + individual nodes |
| Phase 1 scope | ~30 nodes + LangGraph runtime + caching + security |
| Phase 2 scope | RAG + Model routing + Policy gate + Semantic cache |
| Phase 3 scope | Industry outputs + Enterprise features + Full 74 nodes |
| Vector store | pgvector (primary) |
| Caching approach | Exact-hash first (Phase 1), semantic later (Phase 2) |
| Policy gate storage | Code defaults + DB overrides |
| AI workflow generation | Must-have (Phase 2) |
| Code sandbox languages | Python + JavaScript |
| Secrets management | Abstraction layer (internal crypto default, external vault pluggable) |
