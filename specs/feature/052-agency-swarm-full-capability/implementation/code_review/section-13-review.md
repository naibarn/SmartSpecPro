## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `python-backend/app/services/agency_swarm_adapter.py:294` | `config.examples` is stored in `AgentConfig` but `prepend_examples()` is never called inside `create_agent`. The field is passed from the orchestrator at line 1053 of the diff but no code in `create_agent` reads it to inject examples into the agent's initial message history. Few-shot examples are entirely inert at runtime. | In `create_agent`, after building `instructions`, import `prepend_examples` from `agency_few_shot` and use `config.examples` to seed the agent's initial messages (passing via whatever kwarg the agency-swarm `Agent` accepts for a pre-seeded message list). |
| HIGH | `apps/web/server/routers/__tests__/agencyFewShot.test.ts` | This file does not exist in the diff. The spec mandates 11 Vitest router-level tests: valid examples accepted, invalid role rejected, max-10-pairs rejected, conversationStarters accepted, max-10-starters rejected, sharedInstructions accepted, 50001-char sharedInstructions rejected, sharedToolIds creates junction rows, UNIQUE deduplication handled, delete-insert replacement, and `getAgency` returning all new fields. Zero of these are present. | Create `apps/web/server/routers/__tests__/agencyFewShot.test.ts` implementing all 11 spec-required tests. |
| HIGH | `apps/web/server/services/__tests__/conversationStarterCache.test.ts` | The spec-required test "skips caching when cacheConversationStarters is false" is absent. More critically, the `cacheStarterResponse` function has no `cacheEnabled` parameter — callers must consult the flag themselves, but there is no demonstration in the diff that any call site does so. The flag is stored in the DB but never read before a cache call. | Add a `cacheEnabled` parameter to `cacheStarterResponse` (with early return when `false`) and add the missing test. |
| HIGH | `python-backend/tests/unit/services/test_agency_few_shot.py` | Two of the eight spec-required pytest tests are absent: (1) "resolve_shared_tools merges shared tools with agent-specific tools (1 overlapping, 4 unique result)" and (2) "resolve_shared_tools returns only agent tools when no shared tools". These test `merge_tools_deduped` which is new code with zero Python coverage. | Add a `TestMergeToolsDeduped` class to this test file covering both merge cases. |
| MEDIUM | `python-backend/app/services/agency_service.py` (loader, not shown) | `AgencyConfig.shared_instructions`, `conversation_starters`, and `cache_conversation_starters` are defined on the Pydantic model but no code in the diff maps these fields from the `agencies` DB row to the config object. The orchestrator reads `getattr(self.agency_config, "shared_instructions", None)` — if the loader does not populate this field, shared instructions silently never apply. | Confirm the agency-loading code maps `agencies.sharedInstructions` → `AgencyConfig.shared_instructions`, `agencies.conversationStarters` → `conversation_starters`, and `agencies.cacheConversationStarters` → `cache_conversation_starters`. This mapping must exist before the feature works end-to-end. |
| MEDIUM | `python-backend/app/services/agency_orchestrator.py:395` | Shared tools are resolved once per agent node inside the per-agent loop, issuing one DB query per agent. The spec §5 explicitly requires resolving shared tools "once per agency run (not per agent)". With 10 agents this is 10 identical queries. | Move the `resolve_shared_tools_for_agency()` call outside the per-agent loop (before the loop begins) and cache the result in a local variable, reusing it for each agent's `merge_tools_deduped` call. |
| MEDIUM | `apps/web/server/routers/agency.ts:1443` | `sanitizeExamples(agent.examples)` is called inside the DB transaction without a try/catch. If the sanitizer throws (which it does for invalid input), the entire `saveBuilder` transaction raises an unhandled exception that propagates as an internal server error rather than a `BAD_REQUEST`. Zod should catch most of these cases first, but the sanitizer's role validation and length checks are redundant guards that can still throw in edge cases. | Wrap the call in try/catch and translate the thrown error to `throw new TRPCError({ code: "BAD_REQUEST", message: err.message })`. |
| MEDIUM | `apps/web/client/src/components/agency/ConversationStarterChips.tsx`, `SharedInstructionsPanel.tsx`, `SharedToolsBadge.tsx` | All three new components are created but their integration into parent views is not visible in this diff. `ConversationStarterChips` is unrendered in the agency chat view. `SharedInstructionsPanel` is unrendered in the agency settings sidebar. `SharedToolsBadge` is unrendered in `ToolPicker.tsx` (which is not modified). The spec's acceptance criteria explicitly require all three to be visually present. | Wire the components into their respective parent views: (1) agency chat page renders `<ConversationStarterChips>`, (2) agency settings sidebar renders `<SharedInstructionsPanel>`, (3) `ToolPicker.tsx` renders `<SharedToolsBadge>` next to shared tool names. |
| LOW | `apps/web/client/src/components/agency/FewShotExamplesEditor.tsx:39` | `key={pairIdx}` is used on the list of pairs. If pairs are deleted or reordered, React may misidentify which pair changed, causing textarea content to appear in wrong positions. The spec mentions drag-to-reorder. | Use stable keys per pair (e.g., a UUID generated on pair creation and stored alongside the content), not array index. |
| LOW | `apps/web/client/src/components/agency/FewShotExamplesEditor.tsx` | Drag-to-reorder via `GripVertical` icon is specified in §7 of the spec but is not implemented. The `GripVertical` icon is not imported and there is no drag handle or reorder handler. | Implement drag reordering using the project's existing dnd pattern, or render the grip icon as a placeholder for a follow-up. |
| LOW | `apps/web/server/services/conversationStarterCache.ts:779` | `redis.del(...keys)` spreads the array as variadic arguments. If `keys` is large (>255), some Redis client versions may reject the call. | Pass the array directly as `redis.del(keys)` or batch into chunks of 100. |
| LOW | `python-backend/app/services/agency_tools.py:1147` | `base_config.pop("endpoint_url", None)` mutates the dict from the DB row in-place. If SQLAlchemy's result cache reuses the same dict object across queries, this mutation is a side-effect. | Use `base_config = dict(row.base_config or {})` to copy before mutating. |

---

### Contract Compliance

| Contract | Status | Notes |
|---|---|---|
| `saveBuilder` Zod: `examples` per agent (max 10 pairs, roles enum, max 2000 content) | PASS | Schema matches spec exactly |
| `saveBuilder` Zod: `sharedInstructions` max 50000, `conversationStarters` max 10, `cacheConversationStarters` bool, `sharedToolIds` max 50 | PASS | All four fields at correct schema level |
| `saveBuilder` mutation: writes `sharedInstructions`, `conversationStarters`, `cacheConversationStarters` to `agencies` table | PASS | Implemented via `setValues` block |
| `saveBuilder` mutation: delete-insert pattern for `agency_shared_tools` with deduplication | PASS | Correct implementation with `new Set()` |
| Cache invalidation on `sharedInstructions` / `sharedToolIds` / `systemPrompt` change | PASS | Fire-and-forget `invalidateStarterCache().catch(() => {})` is appropriate |
| `getAgency` returns `sharedToolAssignments` | PASS | Added to response |
| `getAgency` returns `conversationStarters`, `sharedInstructions`, `cacheConversationStarters` | PARTIAL | Returned via `...agency` spread only if the `agencies` select query includes the new columns — confirm the select is not a partial projection |
| `fewShotSanitizer.ts`: exports `sanitizeExamples` and `frameExamplesForPrompt` | PASS | Both exported with correct signatures |
| Sanitizer strips injection patterns (ignore previous instructions, system:, you are now, `<|...|>`, `[INST]`, `<<SYS>>`) | PASS | All six pattern types covered |
| Sanitizer strips HTML tags | PASS | Simple regex strip implemented |
| `conversationStarterCache.ts`: key pattern `agency:{id}:starter:{hash}`, TTL 86400 | PASS | Correct |
| `conversationStarterCache.ts`: SCAN + DEL (not KEYS) for invalidation | PASS | Correct pattern used |
| `cacheConversationStarters` flag enforced before caching | FAIL | Flag is stored in DB but `cacheStarterResponse` has no awareness of it |
| `agency_few_shot.py`: `prepend_examples` inserts system framing + pairs before history | PASS | Format matches spec exactly |
| `agency_few_shot.py`: `prepend_shared_instructions` with `[SHARED INSTRUCTIONS]` delimiters | PASS | Format matches spec |
| `AgentConfig` gains `examples` field | PASS | Added at adapter line 1069 |
| `AgencyConfig` gains `shared_instructions`, `conversation_starters`, `cache_conversation_starters` | PASS | Added correctly |
| `prepend_examples` called at runtime to inject examples into agent history | FAIL | `config.examples` is never consumed in `create_agent` |
| Shared tools resolved once per agency run | FAIL | Called per-agent inside the agent creation loop |
| `agencyFewShot.test.ts` router tests (11 required) | FAIL | File does not exist |
| `conversationStarterCache.test.ts`: 6 required tests | PARTIAL | 5 of 6 present; "skips caching when flag is false" absent |
| `test_agency_few_shot.py`: 8 required pytest tests | PARTIAL | 6 of 8 present; `resolve_shared_tools` merge/no-shared-tools tests absent |
| `SharedToolsBadge` rendered in `ToolPicker.tsx` | FAIL | Component created but `ToolPicker.tsx` not modified |
| `ConversationStarterChips` rendered in agency chat view | UNVERIFIED | Component created; integration not shown in diff |
| `SharedInstructionsPanel` rendered in agency settings sidebar | UNVERIFIED | Component created; integration not shown in diff |

---

### Summary

The implementation has strong bones: the sanitizer, cache service, Python pure-functions module, Zod schema extensions, DB write paths, and individual frontend components are all correctly implemented and closely match the spec. However, four issues prevent the feature from working end-to-end: (1) `prepend_examples()` is never called inside `create_agent` so few-shot examples are silently discarded at runtime, (2) the required `agencyFewShot.test.ts` router test file is entirely absent, (3) two spec-required pytest tests for `merge_tools_deduped` are missing, and (4) the `cacheConversationStarters` flag has no enforcement at the call site. Additionally, three new frontend components are orphaned — they exist but are not wired into any parent view, so none of the visual acceptance criteria can be met.
