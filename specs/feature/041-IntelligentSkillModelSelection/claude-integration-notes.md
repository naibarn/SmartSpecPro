# Integration Notes — Opus Review of Feature 041

## Integrating

### H1 — Update loadEnabledLlmModelRows() ✅ Integrating
Adding an explicit sub-step to Section 03: modify `enabledLlmModels.ts` to include all capability columns, priority, priorityLocked, and contextLength in the SELECT. This is load-bearing for the entire feature.

### H2 — Add supportsVision to SkillExecutionPolicyConfig.requirements ✅ Integrating
Adding `packages/skills/src/types.ts` to the files list in the spec and explicitly noting that this shared package type must be updated. Rebuild of `@smartspec/skills` needed after this change.

### H3 — Drop preferredStrategy from v1 Zod schema ✅ Integrating
`preferredStrategy` will be removed from the Section 08 Zod additions. The existing type field in `SkillExecutionPolicyConfig` remains (it was there before this feature), but we won't add it to the new input validation or claim it does anything in v1. The implementation note will say "reserved for v2" in code comments.

### M2 — Resolve priority 0 vs sentinel contradiction ✅ Integrating
Dropping the "0 is sentinel" convention entirely. Priority range in `updateModelPriority` validation: 0–999 (all values valid). The scoring formula already uses `Math.max(1, ...)` to avoid 0, but an admin can explicitly set 0 if they want. This is simpler and less surprising. Update Section 05 validation.

### M3 — disallowedModels out of scope ✅ Integrating
Adding explicit note in Section 03 and Section 04: `disallowedModels` is stored in executionPolicyJson but NOT filtered in v1. Feature scope deferred. A code comment will document this.

### M4 — Define hybrid mode behavior ✅ Integrating
Adding to Section 04: `mode: "hybrid"` means "try fixedModel first; if unavailable (not in enabled rows), fall back to requirements-based selection." This makes the behavior explicit.

### M5 — Pre-load availableModels JSON for bulkSet ✅ Integrating
Adding note to Section 05: When computing priorities during `bulkSetAdminModelCatalogEnabled`, pre-load all relevant providers' `availableModels` JSON arrays in a single query and build a Map<modelId, SyncedModel> before the loop. Avoids N+1 queries.

### L1 — Backfill script ✅ Integrating (as optional SQL in Section 01)
Adding a one-time backfill note to Section 01: after migration, admins can optionally run a backfill that populates computed priorities for all existing rows where `priority = 0 AND priorityLocked = false`. Provide the invocation pattern (call computeModelPriority for each row).

### L3 — Debounce previewModelResolution ✅ Integrating
Adding debounce note to Section 07 UI implementation.

### L4 — Lucide lock icon ✅ Integrating
Use `<Lock size={14} />` from lucide-react. Already used throughout the codebase.

## Not Integrating

### M1 — Priority formula bias toward cheap/new
The 40/30/30 weighting is intentional and is a reasonable starting point. Admins can always override via the priority quick-edit UI. Documenting the bias in the scoring function comments is sufficient; changing the weights is post-launch based on real-world feedback.

### M6 — null contextLength documentation
Will add a code comment in `selectBestLlmModel()`: "Models with null contextLength fail the contextLength requirement filter (conservative default)." This is the right behavior — don't allow unknown-capacity models for context-sensitive skills.

### L2 — SkillSettings fixed mode confusion
The preview UI will show the modelSource field ("skill_llmModelId" vs "requirements_match") which is sufficient to distinguish fixed vs requirements mode. The label text should be clear: "Fixed model: claude-sonnet-4-6" vs "Requirements match: claude-sonnet-4-6". This is a UI wording choice, not a plan change.
