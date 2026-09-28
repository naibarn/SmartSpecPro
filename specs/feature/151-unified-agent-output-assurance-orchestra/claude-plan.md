# Deep implementation plan

## Architecture

Extend the existing `agentRuntime` contract instead of creating a parallel runtime. Node owns admission, tenant/user/credit authority, manifest trust, hashes, provider capability lookup, and side-effect tokens. Python owns SDK execution, bounded tool/handoff loops, and mirrored validation. Both sides emit the same lifecycle states and finding codes.

## Sections and order

1. **Contract foundation** — Add shared TypeScript and Python assurance schemas, canonical hash helpers, runtime budgets, lifecycle statuses, evidence/output/provider/side-effect types, and current/current-minus-one compatibility tests.
2. **Deterministic assurance services** — Implement pure validators for contract/hash, evidence quality, provider limits, output structure, custom-character precedence, speaker-face requirements, budget/cycle limits, and side-effect authorization. No provider call occurs from these services.
3. **Python Agents SDK Orchestra seam** — Add an SDK-facing orchestrator around the existing adapter/skill runtime. It must accept the assurance envelope, use bounded Runner turns/tools/handoffs, reject recursive plans, return trace/checkpoint/result metadata, and never own side effects.
4. **Node planner and final gate** — Select verified manifests through the existing registry, construct an Orchestra plan, call the Python runtime, verify response hashes/findings/contract, and issue a one-time side-effect authorization only after all gates pass. Add provider profiles including Kie/Grok 4096.
5. **Replay, correction, and observability** — Persist/replay assurance events through the existing runtime event/checkpoint path, expose awaiting-user corrections and provider-unknown reconciliation, and redact untrusted prompt content from traces. Add metrics/event contracts without leaking tenant content.
6. **Agency freeze and migration guard** — Disable new Agency execution, reject Agency as an active origin, add a read-only migration/reconciliation contract and CI forbidden-reference check. Do not delete historical tables or package imports until the migration proof is complete.
7. **Regression and rollout proof** — Add cross-language fixtures for video/image/text/native/structured and phone/cross-location/shout modes, adversarial/fuzz/replay/budget/provider-boundary tests, and document release-only browser/provider/deployment gates.

## SDK upgrade strategy

Do not edit the dependency lock blindly. First isolate the new Orchestra profile and run resolver/import/contract tests against `openai-agents==0.21.1` and `openai>=3,<4`. Keep the Agency migration profile read-only and explicitly incompatible with active execution. Only remove the old `openai<3` constraint and Agency dependency when source/import and migration audits prove the runtime no longer needs them.

## Data and safety

All assurance records are tenant/user scoped, idempotent by contract+attempt, and append-only for evidence/findings/events. Unknown paid outcomes transition to reconciliation rather than retry. A user correction creates a new attempt while preserving the prior artifact and credit audit. No migration drops data.

## Verification commands

- Python: `DEBUG=false uv run --with pytest python -m pytest --no-cov python-backend/tests/unit/test_agent_output_assurance.py python-backend/tests/unit/test_openai_agents_contracts.py python-backend/tests/unit/test_openai_agents_adapter.py`
- Node: `npm --workspace apps/web exec vitest run apps/web/shared/agentRuntime/__tests__/assurance.test.ts apps/web/server/services/agentRuntime/__tests__/orchestraFinalGate.test.ts`
- Static: `git diff --check`; targeted TypeScript check if the workspace command is available.
- Release-only: authenticated browser flow, real vision/provider call, credit ledger reconciliation, deployment/rollback, and load/fault tests.

## Risks and mitigations

- **SDK dependency conflict:** isolate profile and prove imports before changing requirements.
- **False blocks:** record finding evidence and allow user correction; never weaken a required vision/evidence gate silently.
- **Credit leakage:** final gate and one-time authorization token are enforced at the Node/provider boundary.
- **Agency regression:** active origin rejection plus CI forbidden-reference check; migration worker is read-only and idempotent.
- **Cross-language drift:** golden fixtures and canonical hash parity tests run in both runtimes.

## Self-review outcome

The plan was adversarially reviewed after section splitting. The main corrections were to make the SDK upgrade resolver-gated, make Agency removal migration-proof-gated, bind provider/credit safety to a one-time Node authorization, and require immutable correction attempts plus cross-language hash fixtures. The section index was validated by the deep-plan checker (7/7 sections).
