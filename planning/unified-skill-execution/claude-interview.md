# Interview Transcript — Unified Skill Execution Pipeline

## Q1: Chat Persona Context — How should persona work in Chat?

**Question:** Chat currently has NO persona/memory context. When the unified service adds this for Chat, how should it work — should Chat use the user's active persona (from conversation settings), or should persona context only apply when explicitly set?

**Answer:** Always use active persona. If conversation has `activePersonaId`, always inject persona context (style, restrictions, memory) into skill execution.

---

## Q2: Memory Scope — What memory types should Chat get?

**Question:** For Chat's entity memory injection — should it retrieve memories scoped to the conversation, to the persona, or both? Team Room currently uses scoped memory (per persona) + entity memory (per conversation).

**Answer:** Both scoped + entity. Match Team Room behavior: retrieve persona-scoped memory AND conversation entity memory.

---

## Q3: Media Skill Boundary — Should unified service handle media skills too?

**Question:** The spec mentions media skills stay in chat.ts (not unified). Should the unified service handle the decision boundary, or should chat.ts check skill type BEFORE calling the unified service?

**Answer:** **Unified handles ALL capabilities** — but in a "unified orchestrates, specialized pipelines execute" pattern.

Key decisions:
- Unified becomes the **canonical orchestration layer** for ALL capabilities: text, image, video, audio, swarm, create-skill
- Unified owns routing + policy + execution contract
- Media/video generation still uses existing pipelines **through adapters** (no big-bang rewrite)
- Both `chat.ts` and team chat become **thin channel shells** that delegate to unified
- Logic must be identical between channels; only permissions/flags/quotas differ

**Architecture vision:**
```
chat.ts (thin shell) ──┐
                       ├──> Unified Orchestrator
team chat (thin shell) ┘      -> Intent Parser
                               -> Policy Engine
                               -> Capability Router
                               -> Executor Registry
                                   -> TextExecutor
                                   -> ImageExecutor (wraps existing)
                                   -> VideoExecutor (wraps existing)
                                   -> AudioExecutor (wraps existing)
                                   -> SwarmExecutor
                                   -> CreateSkillExecutor
```

**Phased rollout:**
1. Unified Capability Contract (schema + capability families)
2. Move decision logic into unified (routing, policy, media boundary, fallback)
3. Wrap existing media/video/audio pipelines as executor adapters
4. Wire chat.ts to call unified first (future phase)
5. Remove duplicate logic from callers (future phase)

**Parity principle:** Same input through chat or team chat must produce same routing decision, same executor selection, same policy application. Differences only in auth, entitlements, feature flags, quotas, and UI rendering.

---

## Q4: Plan Scope — How many phases should this plan cover?

**Question:** Should this plan cover all phases through Phase 5, or scope to fewer phases?

**Answer:** Phase 1-3 only. Plan the contract, text executor (LLM skills unified), and media executor adapters (wrapping existing pipelines). Defer Phase 4-5 (full migration + cleanup from chat.ts) to a later plan.

---

## Q5: Executor Registry Pattern — Static or dynamic?

**Question:** Should executors be statically registered at startup, or dynamically discovered from skill metadata?

**Answer:** Hybrid. Static base executors for known types (text, image, video, audio, swarm, create-skill) + dynamic extension point for custom/future executors via skill metadata capability tags.

---

## Q6: Parity Test Suite — How to structure tests?

**Question:** Should parity tests be a separate suite or integrated into existing test files?

**Answer:** Both. Dedicated parity suite for routing/policy decisions (`channelParityTests.test.ts`) + per-executor tests for execution behavior.

---

## Q7: Credit Handling — Who deducts credits?

**Question:** Should the unified orchestrator always deduct credits, or should the caller decide?

**Answer:** Unified deducts, with override. Credit accounting should be centralized in the unified orchestrator:
- **Default**: deduct for all normal user-facing executions
- **Override**: `calculate_only` / `skip-deduction` for special cases (dry-run, preview, batch, internal workflows)
- Single source of truth for accounting without blocking legitimate non-deductive flows

---

## Q8: Message Persistence — Who saves messages?

**Question:** How should the unified service handle conversation message persistence?

**Answer:** Unified provides hook (event/callback). Each channel registers its own persistence handler:
- Chat → saves to conversation messages
- Team Room → saves to team room messages
- This decouples the unified service from storage concerns while allowing each channel to handle its own persistence format
