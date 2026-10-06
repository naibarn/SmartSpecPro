# Implementation Plan — 058: AI Agency Creator Intelligence Upgrade

## 1. Overview

The AI Agency Creator currently generates basic multi-agent topologies but leaves intelligence fields empty — no execution mode, no capability-based model selection, no memory, no objective. Users are asked technical interview questions they cannot answer.

This upgrade transforms the Creator so that **the user provides only their goal** and the **LLM makes all technical decisions**: how to decompose the work, what capabilities each agent needs, which execution mode fits, and how memory should be configured. After creation, the system suggests optional improvements and allows saving successful designs as templates.

### What Already Exists (from earlier work today)

The design prompt in `_llm_design()` was already upgraded to include executionMode, planningStrategy, modelRequirements, enableLongTermMemory, memoryScope, and objective. The `_validate_spec()` already adds intelligent defaults. The `_implement_agency()` already maps modelRequirements and objective. A 2-round `_self_review_spec()` exists.

**What this plan adds beyond the existing work:**
- Phase 1 DISCOVER upgrade (capability analysis)
- Phase 2 INTERVIEW → fully LLM-driven planning (no user technical questions)
- Phase 3 PLAN upgrade (memory-informed, capability-aware)
- Phase 4+6 REVIEW upgrades (intelligence-aware checks)
- New Phase 9+: Post-creation suggestions
- Template save feature
- Memory retrieval during design
- Internal API upgrade (pass objective + sharedInstructions)

---

## 2. Phase 1: DISCOVER Enhancement

### Current
`_llm_discover()` analyzes the requirement and generates interview questions. Returns `is_clear`, `domain`, `estimated_agents`, `questions`.

### Change
Add capability analysis to the discover phase. The LLM should output:
- `recommended_capabilities`: Which capabilities are likely needed (web_search, thinking, vision, code_execution, computer_use)
- `complexity_level`: "simple" | "moderate" | "complex" — drives execution mode defaults
- `memory_recommendation`: Whether this agency benefits from long-term memory
- `domain_insights`: Domain-specific considerations (e.g., "social media content requires trending topic research")

### Prompt Change
Update the system prompt in `_llm_discover()` to include a section requesting capability analysis. Add output fields to the JSON schema.

### File
`python-backend/app/tasks/agency_creator_task.py`, function `_llm_discover()` (lines 413-443)

---

## 3. Phase 2: Replace Interview with LLM Planning

### Current
When discover finds unclear requirements, it generates questions and waits for user answers via Redis. The user sees a form and must answer technical questions.

### Change
**Remove the interview step entirely for technical questions.** Instead:
1. If requirement is unclear, the LLM should ask **only clarification questions about the user's GOAL** (not technical implementation)
2. All technical decisions (capabilities, execution mode, model selection) are made by the LLM based on the requirement + discover analysis
3. The `skip_interview` flag effectively becomes the default behavior
4. Keep interview mechanism only for goal-clarification questions (max 2 simple questions like "What is the primary audience?" or "What output format do you want?")

### Impact
- `_llm_discover()` generates fewer, goal-focused questions (not "Which execution mode?")
- `create_agency_design_task` receives discover analysis with capability recommendations
- Design prompt uses capability analysis instead of user technical answers

### File
`python-backend/app/tasks/agency_creator_task.py`, discover task (lines 91-185) and design task (lines 190-360)

---

## 4. Phase 3: Memory-Informed Planning

### Current
`_llm_plan()` plans architecture from scratch every time, with no awareness of past agency successes/failures.

### Change
Before the planning LLM call, query existing memories for relevant learnings:

1. Query `agency_agent_memories` table for memories with:
   - Same `tenantId` as the creator
   - `memoryType` in ("strategy_success", "strategy_failure", "process", "insight")
   - `isActive = true`
   - Ordered by confidence DESC, limit 10
2. Query `agency_improvement_history` for recent changes in same tenant
3. Format these as "past learnings" context and inject into the planning prompt

### Where to Query
Use the Node.js internal API or direct SQL query (since we're in a Celery task, direct SQL is simpler). Query via SQLAlchemy async session.

### Prompt Addition
Add to `_llm_plan()` system prompt:
```
Past learnings from similar agencies (use these to inform your design):
{formatted_learnings}
```

### File
`python-backend/app/tasks/agency_creator_task.py`, new function `_fetch_relevant_memories()` + modify `_llm_plan()` (lines 484-552)

---

## 5. Phase 4+6: Review Enhancement

### Current
`_llm_review_plan()` and `_llm_review_design()` check for structural issues (connectivity, entry point, etc.) but don't verify intelligence/capability settings.

### Change
Add to both review prompt checklists:
- "Does every agent/supervisor node have executionMode set?"
- "Does every agentic node have planningStrategy?"
- "Are modelRequirements.capabilities aligned with agent responsibilities?"
- "Is enableLongTermMemory true for agents that should learn?"
- "Is the agency objective specific and measurable?"
- "Are research/analysis agents given supportsWebSearch/supportsThinking?"

### File
`python-backend/app/tasks/agency_creator_task.py`, functions `_llm_review_plan()` (lines 567-598) and `_llm_review_design()` (lines 601-639)

---

## 6. New Phase: Post-Creation Suggestions

### Design
After Phase 8 (IMPLEMENT) succeeds, add a new Phase 9: SUGGEST.

1. LLM analyzes the completed spec and generates 3-5 optional improvement suggestions
2. Each suggestion includes: category, description, impact level, and whether it can be auto-applied
3. Suggestions are stored in Redis alongside the task status
4. Frontend shows them as cards in the completion view

### Suggestion Categories
- `add_node`: "Add a QA Reviewer node before final output"
- `add_capability`: "Enable vision for the Visual Designer agent"
- `upgrade_mode`: "Switch Researcher from single_shot to agentic for deeper analysis"
- `add_tool`: "Add code-interpreter to the Data Analyst for calculations"
- `improve_flow`: "Add error handler for the API calling node"

### LLM Prompt
New function `_llm_suggest_improvements()` that receives the final spec and returns suggestions JSON.

### Frontend Display
In `AutoCreateAgencyModal.tsx`, after completion:
- Show suggestions as cards with Apply/Skip buttons
- Apply calls `saveBuilder` with the modification
- Skip dismisses the suggestion

### File
- `python-backend/app/tasks/agency_creator_task.py`: new `_llm_suggest_improvements()`, modify design task Phase 9
- `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx`: suggestion cards in completion view

---

## 7. Template Save Feature

### Design
After creating a successful agency, user can save it as a template.

### Backend (tRPC)
New procedure `saveAsTemplate` in agency router:
- Input: agencyId, templateName, templateDescription
- Reads the agency + agents + flows
- Creates a new `agencyTemplates` record with the topology
- Marks as "community" or "personal" template

### Frontend
- "Save as Template" button in AutoCreateAgencyModal completion view
- Also available in Agency Builder header (existing page)

### Database
Uses existing `agencyTemplates` table (already has all needed fields).

### File
- `apps/web/server/routers/agency.ts`: new `saveAsTemplate` procedure
- `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx`: save template button

---

## 8. Internal API Update

### Current Issue
The internal create endpoint at `/api/internal/agency/create` (in `server/_core/index.ts` lines 954-978) does not accept `objective` or `sharedInstructions` in its request schema.

### Change
Add `objective` and `sharedInstructions` to the Zod schema for the internal create endpoint. Pass them through when inserting the agencies record.

### File
`apps/web/server/_core/index.ts`, lines 954-978 (request schema) and lines 1051-1108 (insert logic)

---

## 9. Budget Increase

### Current
MAX_LLM_CALLS = 12, which is tight with the new phases.

### Change
Increase to MAX_LLM_CALLS = 18:
- Discover: 1 call
- Plan: 1 call + 1 memory fetch
- Review Plan: 1-3 calls
- Design: 1 call
- Self-Review: 2 calls
- Review Design: 1-3 calls
- Suggest: 1 call
- Document: 1 call
- Total: 10-14 calls typical, 18 max

### File
`python-backend/app/tasks/agency_creator_task.py`, line 242

---

## 10. Testing Strategy

### Unit Tests (Python)
- Test `_llm_discover()` returns capability analysis fields
- Test `_fetch_relevant_memories()` returns formatted learnings
- Test `_validate_spec()` applies intelligence defaults correctly
- Test `_llm_suggest_improvements()` returns valid suggestions
- Test reduced interview (only goal questions, not technical)

### Integration Tests
- End-to-end: requirement → agency with all intelligence fields populated
- Verify: every agent node has executionMode, modelRequirements, enableLongTermMemory
- Verify: agency has objective
- Verify: suggestions are generated after creation

### Frontend Tests
- Suggestion cards render correctly
- Apply/Skip actions work
- Save as Template button appears after creation

---

## 11. Migration / Schema Impact

**No schema changes needed.** All new fields already exist:
- `agencies.objective` ✅ (added in spec 056 migration)
- `agencies.sharedInstructions` ✅ (existed before)
- `agencyAgents.modelRequirements` ✅ (existed before)
- `agencyAgents.nodeConfig` ✅ (supports all intelligence fields)
- `agencyTemplates` ✅ (existed before)

---

## 12. Security Mitigations (from audit)

| ID | Severity | Issue | Mitigation | Section |
|----|----------|-------|-----------|---------|
| F01 | CRITICAL | Memory prompt injection | Sanitize via `sanitize_llm_input()` + wrap in `<historical_data>` tags | 03 |
| F02 | HIGH | Cross-tenant memory leak | Scope query by `tenantId + userId` | 03 |
| F03 | HIGH | Unvalidated suggestion apply | Typed `applySuggestion` procedure with whitelisted mutations only | 08 |
| F04 | HIGH | Template table missing ownership columns | Schema migration required before feature implementation | 06 |
| F05 | HIGH | console.error leaks field values | Replace with structured logger, truncate to 200 chars | 07 |
| F06 | HIGH | computer_use enabled without guardrail | Feature flag gate in `_validate_spec()` | 01 |
| F07 | MEDIUM | Interview filter keyword bypass | Treat as UX hint, not security boundary | 02 |
| F08 | MEDIUM | objective/sharedInstructions no length enforcement at DB | `.slice()` at insert point | 07 |
| F09 | MEDIUM | Suggestions in shared Redis key | Separate Redis key + Zod validation before response | 05 |
| F10 | MEDIUM | No per-user rate limit on creation | Redis counter: max 5 creations/hour/user | 05 |

## 13. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| LLM hallucinates capabilities | _validate_spec() applies safe defaults as fallback |
| Self-review loop takes too long | Max 2 rounds + 90s timeout per call |
| Memory retrieval returns irrelevant data | Filter by tenant+user + limit to 10 + sanitize |
| Suggestions confuse users | Clear category labels + "Skip all" option |
| Budget exceeded | Increase MAX_LLM_CALLS to 18 + per-user rate limit (5/hr) |
| Template abuse | Schema migration adds tenantId+createdBy + ownership check |
| Poisoned memories corrupt design | sanitize_llm_input() + `<historical_data>` framing |
| computer_use enabled inappropriately | Feature flag gate: AGENCY_COMPUTER_USE_ENABLED |
