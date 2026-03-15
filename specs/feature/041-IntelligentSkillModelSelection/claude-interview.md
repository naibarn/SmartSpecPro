# Interview Transcript — Feature 041

## Q1: Priority auto-assignment formula when admin enables a new model

**Answer:** Balanced scoring — recency (40pts) + cheapness (30pts) + capability count (30pts). `priority = 100 - score`. Newer, cheaper, more-capable models rank highest automatically.

## Q2: Behavior when no model satisfies skill requirements

**Answer:** Silent fallback. Fall back to unfiltered selection (existing cascade: llmModelId → defaultModel → conversationModel → system_default). Emit a warning-level audit log event so we can monitor and improve model catalog coverage. Do NOT block execution.

## Q3: How manually-set priorities survive model re-imports

**Answer:** Lock flag. Add `priorityLocked: boolean DEFAULT false` column to `model_provider_map`. When an admin explicitly sets a model's priority, set `priorityLocked = true`. Auto-scoring only assigns priority when `priorityLocked = false`.

## Q4: supportsVision column

**Answer:** Add now. One migration: `ALTER TABLE model_provider_map ADD COLUMN supportsVision boolean DEFAULT false`. Skills for image analysis need this. Worth doing in the same release.

## Q5: Migration strategy for skills with existing llmModelId

**Answer:** Auto-migrate if requirements defined. If a skill has BOTH `executionPolicyJson.requirements` (or frontmatter `model_requirements`) AND `llmModelId`, prefer requirements mode. `llmModelId` becomes a fallback hint if requirements find nothing. If a skill has ONLY `llmModelId` with no requirements, existing hard-coded behavior unchanged.

## Q6: User conversation model vs skill requirements

**Answer:** Requirements take priority. When a skill declares requirements, the selected model ignores conversation model. Skills declare what they need — user's active model preference is irrelevant. (Note: `allowConversationOverride: true` in frontmatter can opt out of this if ever needed, but defaults to false.)

## Q7: SkillSettings UI — show resolved model

**Answer:** Show resolved model preview. Display: "Currently would select: claude-sonnet-4-6 (matched: vision, tools)" below the requirements config. Helps admin verify requirements work before skill is published.
