# Orchestra Progress

Loop policy:
  orchestra_id: kie-attachment-boundary-repair
  purpose: durable Kie image/video reference preparation repair
  iteration: 13/13
  tool_call_batches: 30/30
  estimated_cost_usd: unknown <= 0.50
  dispatch_waves: 0/4
  active_subagents: 0/4
  parallel_writers: 0/2
  repair_rounds: 5/5
  stop_conditions: tests_passed, no_open_blockers, convergence_reached
  stop_reason: convergence_reached

Repeat audit status — 2026-09-13:
  iteration: 20/20 fresh rounds completed
  repair_rounds: 3 scoped repairs
  stop_reason: convergence_reached_with_baseline_gates_recorded
  must_do_now_gaps_fixed: [staged raw fallback, configured-limit retry marker mismatch, private managed-path bypass, redirect target check, transient video download classification]
baseline_gates_recorded: [mediaGenerationService.test.ts 7/52 baseline failures, repository npm run check baseline failures, full legacy Ruff baseline diagnostics]
external_gates_recorded: [live Kie/provider, deployment/restart, browser, production recovery]

Feature 186 current continuation — 2026-09-13:
  review_rounds: 14/14
  fixes: [outbox cancellation race, cancelled outbox index migration, adapter attempt-reference validation, Node pre-executor lease fence, Python assert-active parity, Kie redirect/private-target/declared-size guard]
  proof: [Node 6 files/35 tests, Python 85 focused tests with no-cov, Python compileall, additive migration verifier, call-site inventory, JSON validation, diff check]
  skipped_by_user: [TypeScript typecheck due RAM constraint]
  external_gates: [production Cloudflare/Hyperdrive, live provider, deploy/restart, browser, full legacy adapter migration]

Evidence ledger:
  source: ui-only + test-output + code-path inspection
  identifier: URL-too-long screenshot; Kie provider and Qwen3 catalog paths
  observed failure: image reference preparation is conditional on input_urls, while Qwen3 uses image_urls
  data state: production task id/log not supplied; local code and tests inspected
  confidence: high for recurring local code-path defect

## Status

[DONE] wave-1-contract-tests — regression coverage proves the recurring failures before the fix
[DONE] wave-2-provider-boundary — unsafe image/video refs are fetched, byte-validated, and streamed to Kie
[DONE] wave-3-node-config-impact — staged WebP normalization no longer uses lossy JPEG conversion
[DONE] wave-4-verification-convergence — focused Python 69/69 and Node 29/29 tests passed; live provider/deploy gates remain external
[DONE] review-rounds-1-13 — attachment contract, byte fidelity, data URL, video object arrays, dynamic fields, upload response, legacy compatibility, SSRF, redaction, limits, suffix/byte consistency, and final regression gates completed

Implemented contract points:

- Protected, signed, query-bearing, data, non-http, and overlong references never reach the Kie task JSON.
- Image/video bytes are detected from magic bytes; stale content-type and filename metadata cannot relabel a payload.
- Base64 data URLs are decoded to original bytes and streamed; there is no provider JSON base64 fallback.
- Kie file-upload URLs are cached per source within a request to avoid duplicate uploads.
- Invalid/unsupported media fails before paid task submission and is classified as non-retryable input failure.
- Existing staged WebP normalization is PNG/lossless and stores the matching `.png`/`image/png` metadata.

Verification evidence:

- `DEBUG=false ./.venv/bin/pytest -q tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py tests/tasks/test_media_task_retry_state.py --no-cov` — 69 passed.
- `npm exec -- vitest run server/services/__tests__/marketplaceAutoReviewStagedPipeline.test.ts server/services/__tests__/marketplaceAutoReviewStagedPipeline.selfHealPersist.test.ts --no-file-parallelism` — 29 passed.
- `ruff check` passed for the changed provider and provider tests; `git diff --check` passed.
- Final rerun: Python attachment/retry suites 77/77 passed; Qwen/mode/transparency suites 29/29 passed; Node media/staged/catalog suites 57/57 passed; provider and provider-test Ruff passed; changed Python files compile successfully.
- Full `media_tasks.py` Ruff remains baseline-noisy with unrelated existing diagnostics; no broad cleanup was applied.

## Worktree discipline

- SocratiCode MCP was unavailable; scoped shell discovery is the fallback.
- Unrelated dirty/untracked files are preserved and excluded from this repair.
- No live Kie call, credit spend, deployment, or `.env` mutation is authorized.
- Legacy compatibility provider has pre-existing Ruff diagnostics unrelated to this repair; its changed path is syntax-compiled and routed through the canonical attachment preparer.

Final repeat-audit note:

- The 20-round ledger found and repaired all material in-scope attachment-boundary gaps identified locally. No provider call, credit spend, deployment, `.env` mutation, or destructive recovery was performed.
- SocratiCode was unavailable, so scoped shell discovery and focused source/test inspection were used as the documented fallback.
