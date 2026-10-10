# SPEC-308 Decisions

[2026-10-09T04:05:00Z] AUTO-APPROVED: Use the uploaded R1.2 spec as the new SPEC-308 candidate after live canonical ID check.
Reason: smart_auto mode active; origin/main registry lists 308 next safe, source tree has no SPEC-308, and no duplicate identity exists.
Risk: MEDIUM
Files affected: specs/feature/308 - SmartAIHub Cooperative Dual Surface/*, specs/_status/*

[2026-10-09T04:05:00Z] DECISION: Preserve this task's orchestration state under `orchestra/tasks/spec-308-20261009/` rather than archive or overwrite shared root Orchestra files.
  Context: shared root Orchestra contains active state from unrelated work; archive would interfere with its recovery.
  Alternatives considered: overwrite/replace root state (rejected as unsafe); keep state only in chat (rejected as not durable).

[2026-10-09T04:05:00Z] DECISION: Restrict visual attention to newly seen distinct authorized notification row IDs.
  Context: current authenticated SSE row ID is stable per user but repeated group occurrences can reuse it; no occurrence ID exists.
  Alternatives considered: infer via count/title/metadata (rejected as unauthorized/ambiguous); extend backend contract (rejected for this presentation-only spec and no owner/runtime evidence).

[2026-10-09T19:03:33Z] DECISION: Fence Chat/Task Control conversation state by authenticated user and tenant, including users without a current tenant; clear scoped drafts/context when identity changes and suppress late prompt completions.
  Context: read-only review found an in-flight conversation result could otherwise be stored after account/tenant transition and surface to the next scope.
  Alternatives considered: keep the old conversation in component state (rejected due cross-identity leakage); clear drafts on balloon visibility changes (rejected because ordinary presentation changes must preserve drafts).
  Risk: HIGH; verification remains pending on the exact candidate SHA.
