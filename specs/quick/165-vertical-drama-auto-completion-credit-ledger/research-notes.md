# Research notes

## Discovery boundary

SocratiCode MCP tools are not exposed in this session, so discovery used bounded `rg` and targeted file reads after the repository instructions. The worktree contains unrelated user changes; no cleanup or reset is allowed.

## Current implementation

- `verticalDramaPromptExpansionService.ts` uses the real `llm-only` skill and `executeJsonPlanningCallWithRetry`, but charges only after the final validated preview. A real schema-invalid response can therefore consume provider cost without a credit transaction.
- `verticalDramaStoryBible.ts` uses real LLM calls and fixed skill slugs. Deep mode performs one corrective retry, then can persist a partial result; malformed/empty-dialogue existing items can be treated as complete by router filters.
- Deep charges often calculate metadata with the initially resolved `model`, not the helper's returned effective model after recovery/rotation.
- `verticalDramaSeries.ts` runs plan and deep jobs separately. Existing deep jobs persist the canonical active bible and a best-effort materialized mirror, but the user must trigger another action after missing episodes/dialogue.
- `verticalDramaDraftQualityQc.ts` and its jobs use a real QC skill slug, but a fixed reservation/draw/refund loop obscures individual evaluate/revise call transactions.
- `creditService.ts` supports `skillSlug`, `skillRunId`, `sourceType`, metadata, and idempotency. `settleSkillRun` creates user usage and revenue transactions atomically. `getTransactionHistory` joins skills by exact slug and has stable timestamp/id ordering.
- The Credits page can only display rows inserted by backend billing; missing rows are primarily backend call-site/ledger gaps, not only a UI label issue.

## Root-cause decisions

1. Completeness must use one canonical predicate: exact target episode set, valid shot structure, and at least one nonblank spoken line per episode.
2. Automatic repair belongs in the durable story worker, not a browser callback. It repairs only failing episode numbers and checkpoints after every successful repair.
3. Billing happens immediately after every real provider response, before output acceptance. The attempt key identifies stage + round + retry + scope; worker redelivery reuses it.
4. Explicit model pins are authoritative. If bounded policy rotation is allowed, metadata reports the effective model returned by the helper; if pinning forbids rotation, the stage fails instead of silently selecting another model.
5. Automatic repair is bounded (default two repair rounds per stage). Exhaustion is a durable failed/needs-user-action state with exact missing episode numbers and no fabricated output.
