# Stakeholder Interview — 052 Agency Swarm Full Capability Upgrade

Date: 2026-03-22

---

## Q1: Implementation Scope

**Q:** The spec defines 5 phases over ~18 weeks. Are you planning to implement ALL 23 features, or is there a subset you want to prioritize first?

**A:** All 23 features (full plan). Plan the complete implementation across all 5 phases as specified.

---

## Q2: SSE Streaming Architecture

**Q:** For SSE streaming (Feature 2.5): Should the new agency streaming go through the existing Node.js SSE layer (Python → Redis → Node.js SSE) or directly from Python FastAPI?

**A:** Through Node.js (Recommended). Python publishes to Redis, Node.js proxies SSE to client. Consistent with existing patterns, single auth layer.

---

## Q3: Custom Tools Scale

**Q:** What's the expected scale for custom tools? How many tenants will create custom tools?

**A:** Small (5-10 tenants, <20 tools each). Internal/enterprise use, mostly power users.

---

## Q4: AI Agency Creator v2 — Node Type Coverage

**Q:** Should the AI Creator v2 be able to generate ALL 14 node types from day one?

**A:** All 14 from launch. Creator must know all node types. More complex prompts but full capability.

---

## Q5: Guardrail LLM Strategy

**Q:** For the llm_classify guardrail strategy, should it use a dedicated small model or SmartSpecPro's existing LLM Gateway?

**A:** LLM Gateway (Recommended). Uses existing model routing, credit tracking, and fallback. Consistent with codebase patterns.

---

## Q6: Feature Flag Granularity

**Q:** Are feature flags tenant-level or global?

**A:** Global default + tenant override. Global flag with per-tenant override capability.

---

## Auto-Decisions (Technical)

These decisions were made by the architect based on codebase research:

1. **Database schema pattern**: Follow existing Drizzle ORM pgTable pattern with camelCase columns. All new columns nullable for backward compatibility.
2. **Frontend node registration**: Extend existing BaseAgencyNode dispatcher switch statement (single "agency" ReactFlow type).
3. **Tool bridge pattern**: Follow existing agency_tools.py HTTP bridging via adapter.create_tool_class().
4. **SSE event format**: Match existing orchestratorStream.ts pattern (id/event/data fields, Redis pub/sub).
5. **Validation**: Zod schemas in tRPC router (matching existing saveBuilder .superRefine() pattern).
6. **Python orchestrator**: Extend existing match statement in agency_orchestrator.py for new node types.
7. **Test framework**: Vitest for tRPC procedures, pytest for Python services (matching existing setup).
8. **Encryption**: Use existing crypto.ts AES-256-GCM for tool headers and MCP tokens (dedicated *Encrypted columns).
9. **Rate limiting**: Use existing Bottleneck + BullMQ patterns with per-endpoint configs.
10. **Feature flags**: Use existing useTenantFeatureFlag hook (client) and systemSettings table (server) — extend for global + tenant override.
11. **AI Creator phases**: Extend existing Celery task structure (agency_creator_task.py) with new phase functions.
12. **SSRF protection**: Use existing ssrf_guard.py patterns for custom tool URL validation.
