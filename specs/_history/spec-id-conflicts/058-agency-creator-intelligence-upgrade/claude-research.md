# Research: AI Agency Creator Intelligence Upgrade

## Current Architecture

### 10-Phase Pipeline (agency_creator_task.py, 1151 lines)

1. **DISCOVER** — `_llm_discover()`: Analyze requirement, generate interview questions
2. **INTERVIEW** — Store questions, wait for user answers via Redis
3. **PLAN** — `_llm_plan()`: Design architecture with 14 node types
4. **REVIEW_PLAN** — `_llm_review_plan()`: Check plan (max 3 iterations)
5. **DESIGN** — `_llm_design()`: Generate full spec (nodes, edges, config)
6. **REVIEW_DESIGN** — `_llm_review_design()`: Check spec (max 3 iterations)
7. **VALIDATE** — `_validate_spec()`: Code-level validation + defaults
8. **IMPLEMENT** — `_implement_agency()`: Create agency via internal API
9. **VERIFY** — Status update
10. **DOCUMENT** — `_llm_document()`: Generate usage guide

### What's Already Upgraded (from earlier work today)

- **Design prompt** (lines 650-759): Already includes executionMode, planningStrategy, modelRequirements (7 capabilities), memory settings, objective
- **_self_review_spec()** (lines 786-858): 2-round self-review with 8-point checklist
- **_validate_spec()** (lines 962-985): Intelligence defaults (agentic + react + memory + auto model)
- **_implement_agency()** (lines 1027-1079): Maps modelRequirements, objective, sharedInstructions

### What's Still Missing / Needs Improvement

1. **Design prompt doesn't leverage existing memories** — If user has run this agency before, past learnings aren't fed into the design
2. **Plan phase prompt is outdated** — `_llm_plan()` (lines 484-552) doesn't mention intelligence features
3. **Review prompts are outdated** — `_llm_review_plan()` and `_llm_review_design()` don't check for intelligence/capability completeness
4. **No suggestion phase** — After creation, system doesn't suggest optional improvements
5. **Interview still asks user technical questions** — Should be fully LLM-driven
6. **Discover phase doesn't analyze capability needs** — Should output capability recommendations
7. **No memory retrieval during design** — Could use past agency memories to improve new designs
8. **Internal API `/api/internal/agency/create` doesn't save objective/sharedInstructions** — Missing field mapping

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `python-backend/app/tasks/agency_creator_task.py` | 1151 | Main pipeline |
| `python-backend/app/api/agency_creator.py` | 164 | FastAPI endpoints |
| `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx` | 452 | Frontend |
| `apps/web/server/routers/agency.ts` | saveBuilder | tRPC backend |
| `apps/web/server/_core/index.ts` | 915-1114 | Internal create API |
| `apps/web/server/services/intelligentModelSelector.ts` | 200+ | Model selection |

### Schema Fields Available

**agencies table**: objective (text), sharedInstructions (text)
**agencyAgents table**: modelRequirements (jsonb), nodeConfig (jsonb with executionMode, planningStrategy, enableLongTermMemory, memoryScope, maxReflectionCycles)

### Model Selection System

`selectBestLlmModel(requirements, rows)`:
- Filters by boolean capabilities (AND logic)
- Filters by contextLength
- Sorts by priority (recency 40 + cost 30 + capability 30)
- Strategy: cheapest/balanced/best affects priority weighting

### Testing

- `tests/test_agency_creator_v2.py` — 10-phase pipeline tests
- `tests/test_agency_creator_security.py` — Auth/security tests
- `apps/web/server/routers/__tests__/agency.test.ts` — saveBuilder tests
- pytest (Python), Vitest (TypeScript)

### Budget Constraints

- MAX_LLM_CALLS: 12 per creation session
- Adding self-review (2 rounds) + suggestion phase = need to increase to ~16
- Each LLM call: ~2-4K tokens, $0.01-0.05 cost
