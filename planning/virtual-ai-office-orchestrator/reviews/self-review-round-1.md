# Plan Adversarial Review — Round 1

## Findings

### 1. Transaction Boundary for Team Creation (FIXED)
- `team.create` must atomically create: agency + agency_agents + assistant_team + assistant_profiles + memory scopes
- If any step fails, all must roll back
- **Fix**: Added explicit transaction note to teamService.ts description

### 2. Credit Tracking Delegation (OK)
- Plan says "per-agent cost tracking via existing creditService patterns"
- Existing `agency_credits.py` already handles per-agent tracking
- No change needed — the pattern is reusable

### 3. Brainstorm Hard Cutover Risk (ACCEPTABLE)
- Dropping brainstorm columns means existing conversations with brainstormPartnerModel will lose that metadata
- But: old messages remain readable, and the columns were only used for new conversation creation
- Risk is minimal — no data loss, just feature removal

### 4. Memory Migration Dual-Write Complexity (ACCEPTABLE)
- Dual-writing to both entity_memories and scoped_memories adds write latency
- But: this is temporary (transition period only)
- Migration script handles bulk copy; dual-write handles new writes during transition

### 5. pgvector Dependency (ACCEPTABLE)
- Requires pgvector extension on PostgreSQL
- Already available in our Docker setup
- Fallback: keyword-only retrieval works if embedding is null

### 6. SSE Scalability (ACCEPTABLE)
- Redis pub/sub for SSE fan-out is proven pattern
- 10 concurrent runs × 5 agents = ~50 events/second — well within Redis pub/sub capacity
- Heartbeat + reconnection strategy added in self-review round 2

## Changes Made
- Added transaction boundary note to teamService.ts section
- No other changes needed — plan is internally consistent
