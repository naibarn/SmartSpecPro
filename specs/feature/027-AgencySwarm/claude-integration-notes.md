# Review Integration Notes

## Findings Integrated

### H1 + H2: Dependency Conflict Resolution (INTEGRATE)
Adding explicit Phase 0 dependency resolution task. Will document all transitive conflicts (langchain-openai, anthropic, chromadb). Will add `OpenAIError` → `APIError` rename to audit checklist.

### H3: Credit Model Simplification (INTEGRATE)
Removing reserve/reconcile system. Aligning with spec's corrected approach: per-call gateway deduction + multiplier markup at run completion. Eliminates Section 5.5 (internal credit endpoints).

### H4: Dual-ORM FK Strategy (INTEGRATE)
Removing DB-level FK constraints from SQLAlchemy models. Using plain columns + application-level integrity. Documenting migration ordering (Drizzle before Alembic).

### H5: Thread Safety (INTEGRATE)
Adding per-request Agency instantiation mandate. Adding thread safety validation task to Phase 1. Sizing httpx connection pool.

### H6: Approval Gate Descoping (INTEGRATE)
Removing runtime approval gates from MVP. Only pre-configured whitelists in Phase 4. Runtime pause/resume deferred to future release.

### H7: CreditSourceType (INTEGRATE)
Adding "agency" to CreditSourceType union.

### M2: Python Direct DB Read (INTEGRATE)
Python reads agency config directly via read-only SQLAlchemy models instead of HTTP calls to Node.js. HTTP bridge for mutations only.

### M4: Scope Boundary (INTEGRATE)
Adding explicit scope boundary section listing what's deferred.

### M6: SSE Heartbeat + Nginx (INTEGRATE)
Adding heartbeat events, Nginx config notes, `X-Accel-Buffering: no`.

### M7: Consistent UUIDs (INTEGRATE)
Changing `agency_conversations.id` to `varchar(36)` UUID.

### L3: Junction Table (INTEGRATE)
Replacing `agency_agents.tools` JSON column with `agency_agent_tools` junction table.

### L5: Test Strategy (INTEGRATE)
Adding testing strategy section.

### L6: Nginx Config (INTEGRATE)
Adding Nginx SSE configuration notes.

## Findings NOT Integrated (with rationale)

### M1: Feature Flag System Redesign (NOT INTEGRATING)
The existing `system_settings` approach is sufficient for MVP. Per-tenant overrides can use the same table with `tenantId` column. Full flag evaluation hierarchy is over-engineering for initial release.

### M3: PII Redaction Scope Change (NOT INTEGRATING)
The user explicitly chose "redact before storage" in the interview (Q18). While regex has limitations, the recommendation to change to "store raw, redact on display" contradicts the user's stated preference. Will note the tool_calls JSON exemption as a refinement.

### M5: React Flow Bundle Size (ACKNOWLEDGED, NOT BLOCKING)
React Flow is needed for the full canvas builder the user requested. Bundle size impact is acceptable for the functionality provided. Will verify if already installed.

### M8: Python Rate Limiting (NOT INTEGRATING)
Internal Python endpoints are not exposed externally. Node.js rate limits are the primary defense. Adding Python-side rate limits is defense-in-depth but not critical for MVP.

### L1: Template Storage (NOT INTEGRATING)
JSON files in a dedicated directory is simpler than a DB table for 4 templates. Can migrate to DB later if admin-managed templates are needed.

### L2: Default Timeout (NOT INTEGRATING)
10 minutes is the user-specified target (Q14). Complex agencies can override via `maxRunTimeSeconds` per agency.

### L4: Archival Mechanism (NOT INTEGRATING)
Implementation detail for Phase 4. Will be defined when that section is written.
