## Research Brief: Capabilities-Based Model Selection (Chat → Agency)

### Findings

SmartSpecPro's Chat system uses a sophisticated **capability-aware model selection** pattern that should be replicated in Agencies. The pattern works in two layers:

#### 1. Model Capabilities Storage (llmModels table)

Nine boolean capability columns exist in the `llmModels` table:
- `supportsVision`, `supportsThinking`, `supportsFunctionTools`, `supportsStructuredOutputs`
- `supportsWebSearch`, `supportsCodeExecution`, `supportsComputerUse`, `supportsBackground`, `supportsResponses`
- Plus `contextLength` integer for context window requirements

These are the **single source of truth** for model capabilities. Legacy `configJson.supportsVision` is deprecated.

#### 2. Selection Algorithm (intelligentModelSelector.ts)

A pure function `selectBestLlmModel(requirements, models)` implements capability-aware selection:

**Algorithm:**
```
1. AND filter: Exclude models missing any capability marked true in requirements
2. Context filter: Exclude models with contextLength < requirement (if set)
3. Priority sort: Order remaining models by computeModelPriority(model)
4. Return: First (best) model's ID or null
```

**Priority Scoring:** Weighted sum of three components (total range 1–85, lower = better priority):
- **Recency** (15–40 pts): Models <30 days old get 40, >1 year get 10
- **Cost** (5–30 pts): Free models get 30, sub-$0.5 get 25, expensive get 5–10
- **Capabilities** (0–30 pts): Score = (count_true_flags / 9) * 30

#### 3. Current Chat Flow

1. User sends message
2. Skill detection matches a skill with `requirements: { supportsVision: true, ... }`
3. `skillExecutor.ts` calls `selectBestLlmModel(skill.requirements, enabledModels)`
4. Returns best matching model ID
5. `llmRouter.ts` resolves provider for that model (separate concern: cost/health-based)
6. Request executes on selected model + provider

---

### Current Architecture

#### Chat: Fully Implemented
- **Schema:** 9 capability boolean columns + contextLength in llmModels
- **Selection:** Pure function in Node.js (`intelligentModelSelector.ts`)
- **Entry point:** Skill frontmatter declares `requirements: { ... }`
- **Automatic:** No user intervention needed (system picks best model)

#### Agency: Minimal
- **Schema:** Single `model` varchar field in agencyAgents (no requirements stored)
- **Selection:** Manual dropdown picker (`ModelPicker.tsx`), no filtering
- **Entry point:** User manually selects model at agent creation time
- **Static:** Model field is hardcoded; never changes at runtime

#### Python Backend: Gap
- **Adapter:** `AgencySwarmAdapter` receives model string, passes directly to gateway
- **Orchestrator:** No capability awareness; no model resolution logic
- **Provider routing:** Uses `llmRouter.ts` (Node.js) but no capability filtering input

---

### Risks

1. **User burden:** Without smart model selection, users must manually understand model capabilities and manually select appropriate model for each agent.

2. **Suboptimal defaults:** Users may select expensive models when cheaper alternatives with needed capabilities exist.

3. **Capability mismatch:** No validation that selected model has required capabilities for agent's tools/skills. Agent may fail at runtime.

4. **Inconsistent UX:** Chat has automatic smart selection; Agencies require manual picker. Confusing for users familiar with Chat.

5. **Cost impact:** Without cost-based priority scoring, users tend to select premium models even when free models work.

6. **Audit trail:** Currently, no tracking of "requested model" vs "resolved model". If fallback were added, cost reconciliation would be complex.

---

### Options

#### Option A: Minimal — User-Validated Selection (3–4 hours)

**Scope:**
1. Add `capabilityRequirements` JSON field to `agencyAgents` schema
2. Enhance `ModelPicker.tsx` to display capability badges (vision icon, thinking icon, etc.)
3. Show which models match agent's required capabilities
4. Auto-select first matching model as default (user can override)

**Pros:**
- Quick (3–4 hours)
- Minimal backend changes
- User remains in control (can override if needed)
- No new selection logic to port/maintain

**Cons:**
- Still requires user to understand and declare requirements
- No automatic cost optimization
- No fallback if primary model unavailable
- UI must fetch requirements from DB at picker time (extra query)

**Recommendation:** Skip this; go to Option B.

---

#### Option B: Recommended — Smart Automatic Selection (7–13 hours)

**Scope:**
1. Add to `agencyAgents` schema:
   - `capabilityRequirements` (JSON, same type as CapabilityRequirements in Chat)
   - `modelStrategy` (varchar: "cheapest" | "best" | "fastest", default "best")

2. Enhance `ModelPicker.tsx`:
   - Show capability indicators (icons for vision, thinking, etc.)
   - Filter models based on agent's declared requirements
   - Show priority score for each model
   - Suggest top 3 models with explanations (e.g., "gpt-4o (best fit), claude-opus (free), gpt-4-turbo (cheapest)")

3. Add selection logic:
   - **Option B1 (Recommended):** Port `selectBestLlmModel()` to Python backend
     - Create `python-backend/app/services/capability_selector.py`
     - Implement same filtering + priority scoring as Chat
     - Call from orchestrator before delegating agent nodes
   - **Option B2:** Create tRPC wrapper
     - Add `agency.selectModelByCapabilities(requirements, strategy)` procedure
     - Reuse existing Chat selection logic via JavaScript call

4. Integrate with orchestrator:
   - Before executing agent node, check if `node.capabilityRequirements` is set
   - Call selection logic: `best_model = select_model(requirements, enabled_models, strategy)`
   - Pass `best_model` to `AgencySwarmAdapter` instead of static `node.model`
   - Track resolved model in audit log for cost/billing reconciliation

**Pros:**
- Same smart behavior as Chat (users get consistent experience)
- Cost-optimized (cheaper models preferred when capabilities match)
- Automatic: no user training needed
- Fallback-ready (can add N candidates later)
- Portable: same logic works for other features (workflows, etc.)

**Cons:**
- Requires porting selection logic or creating tRPC wrapper (2–4 hours)
- Adds complexity to orchestrator (but minimal)
- Requires capability requirements to be declared (UI/process question)

**Recommendation:** Implement this. Use Option B1 (Python) for performance; B2 if team prefers staying in Node.js.

---

#### Option C: Advanced — Multi-Model Fallback (13–20 hours)

**Extends Option B:**
1. Store `modelCandidates: string[]` instead of single `model` in agents
2. Selection logic returns top N models sorted by priority
3. Orchestrator tries first model; if it fails (timeout, rate limit, error), tries next candidate
4. Audit trail tracks all attempted models + reasons for fallback

**Pros:**
- Resilience: if primary model unavailable, automatically falls back
- Cost optimization: tries cheapest first, upgrades if needed
- Perfect for scale (some users may hit GPT-4 rate limits)

**Cons:**
- Complex audit trail (multiple model attempts per request)
- Cost reconciliation more complex (which model to charge?)
- Orchestrator complexity (fallback logic, retry limits)
- Not needed for MVP

**Recommendation:** Defer to Phase 2. Only implement if scale/resilience becomes priority.

---

### Recommendation

**Implement Option B (Smart Automatic Selection) with the following roadmap:**

**Phase 1: Schema & UI (3–4 hours)**
- Add `capabilityRequirements` and `modelStrategy` fields to `agencyAgents`
- Enhance `ModelPicker.tsx` to show capabilities and filter models
- Suggest top 3 models as defaults

**Phase 2: Selection Logic (2–3 hours, Python preferred)**
- Implement `selectBestLlmModel()` in `python-backend/app/services/capability_selector.py`
- Match Chat behavior: AND filtering + priority scoring
- Add unit tests (test AND logic, priority scoring, edge cases)

**Phase 3: Orchestrator Integration (1–2 hours)**
- Modify `AgencyOrchestrator._execute_node()` to resolve model before delegating
- Resolve model at agent-creation time (cache per run)
- Pass resolved model to `AgencySwarmAdapter.create_agent()`

**Phase 4: Testing & Audit (1–2 hours)**
- Integration test: agent with requirements selects correct model
- Cost tracking test: resolved model captured in audit log
- Edge case: no model matches requirements (should fail clearly)

**Why this approach:**
1. **Consistency:** Chat users get the same smart selection in Agencies
2. **Maintainability:** Single source of truth (Python implementation) reduces drift
3. **Performance:** Selection happens once per run, not per message
4. **Audit-ready:** Resolves cost tracking question early
5. **Future-proof:** Foundation for fallback (Phase 2) and other features

---

### Open Questions

Before implementation, clarify with product/design:

1. **Automatic vs Manual?**
   - Should system automatically select model based on capabilities?
   - Or should user select, system only validates?
   - *Recommended:* Automatic (matches Chat, better UX)

2. **Where do requirements come from?**
   - User explicitly declares in agent config (new field)?
   - Inferred from agent's tools/skills (dynamic)?
   - Both (explicit overrides inferred)?
   - *Recommended:* Explicit (simple, deterministic)

3. **Fallback strategy?**
   - If primary model unavailable, try next-best?
   - Or fail immediately?
   - *Recommended:* Fail for MVP (can add fallback later)

4. **Resolution timing?**
   - All agents resolved to same model at run start?
   - Each agent independently resolved when executed?
   - *Recommended:* Per-agent at execution time (allows dynamic adaptation)

5. **Cost tracking?**
   - Should we audit "requested model" vs "resolved model"?
   - Needed for fallback cost reconciliation?
   - *Recommended:* Track both from day 1 (enables auditing)

---

### Critical Code Locations

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **llmModels schema** | `apps/web/drizzle/schema.ts` | 701–722 | 9 boolean capability columns |
| **CapabilityRequirements** | `apps/web/server/services/intelligentModelSelector.ts` | 118–130 | Interface definition |
| **Selection algorithm** | `intelligentModelSelector.ts` | 160–203 | `selectBestLlmModel()` |
| **Priority scoring** | `intelligentModelSelector.ts` | 89–109 | `computeModelPriority()` |
| **agencyAgents schema** | `apps/web/drizzle/schema.ts` | 4655–4765 | Agent table (needs: capabilityRequirements, modelStrategy) |
| **ModelPicker** | `apps/web/client/src/components/agency/ModelPicker.tsx` | 1–136 | Current picker (needs enhancement) |
| **AgencySwarmAdapter** | `python-backend/app/services/agency_swarm_adapter.py` | 193–220 | Model passthrough (needs capability input) |
| **Orchestrator** | `python-backend/app/services/agency_orchestrator.py` | 177–300+ | Agent execution (needs model resolution call) |
| **llmRouter** | `apps/web/server/services/llmRouter.ts` | 54–192 | Provider selection (already works, stays unchanged) |

---

### Success Criteria

- [ ] Agencies can declare capability requirements (new schema field)
- [ ] Model selection filters by AND logic (requirements match)
- [ ] Priority scoring matches Chat behavior (recency + cost + capabilities)
- [ ] Orchestrator resolves model before delegating to swarm adapter
- [ ] Resolved model captured in audit log (cost tracking)
- [ ] UI shows suggested models with explanations
- [ ] Integration test: agent with vision requirement gets vision-capable model
- [ ] No regression: agent-only agencies continue to work unchanged
