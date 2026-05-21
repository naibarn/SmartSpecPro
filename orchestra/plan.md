## Task Classification
- Scope: small
- Risk: medium
- Affected domains: Frontend Storyboard Review persistence
- Estimated file count: 2-3
- Chosen route: single-agent
- Bug route: true
- Classification notes: User reports a persistence regression after replacing an uploaded video in storyboard-review. Likely localized to draft save/load flow and tests.

---

# Orchestra Plan - Marketplace Capture Extension Plan Review

## Task

Review the completeness of the Marketplace Capture Extension deep-plan and patch missing planning/security gaps.

## Task Classification

- Scope: large
- Risk: low
- Affected domains: planning artifacts, security review notes, extension/backend/web implementation plan
- Estimated file count: 15+
- Chosen route: installed-skill-flow / orchestra inline review
- Bug route: false
- Classification notes: The request reviews a large multi-domain feature plan but changes only markdown planning artifacts, so implementation risk is low.

## Impact Preflight

- SocratiCode status was green.
- Reviewed deep-plan artifacts under `specs/feature/113-marketplace-capture-extension`.
- No application source files were modified.
- Risk-sensitive surfaces considered in the plan: auth/token handling, CORS, uploads, tenant isolation, SSRF, LLM prompt injection, preview XSS, Chrome extension permissions, and data retention.

## Review Outcome

The plan was already broadly complete. Orchestra added missing implementation-planning coverage for evidence minimization/cropping/redaction, state-machine and long-running recovery, variants/SKUs, extension CSP/message/token hygiene, product evidence lifecycle, LLM extraction ledger/fallback, and Chrome Web Store/threat-model release gates.

## Round 2 Review Outcome

Additional production-readiness coverage was added for:

- field provenance, user edit lineage, and schema/parser/adapter versions
- async-compatible analyze/mirroring/cleanup boundaries and fail-closed config validation
- protected refresh token storage and per-extension revoke
- upload checksums, duplicate suppression, orphan cleanup, and paginated retrieval
- LLM quota/cost/model policy and PII/minimization prefilter
- web UI accessibility, bounded lists, and complete UI states
- extension compiled-bundle scan, environment labels, and optional permission guidance
- adapter diagnostics, cancellation, retry/backoff, and local evidence cleanup
- operations metrics/alerts/runbooks, legal/product checklist, and Chrome extension E2E plan
# Orchestra Plan

## Task
Run a full deep-plan chain for `specs/feature/114-gemini-omni-suite-media-assets/spec.md`.

## Classification
- scope: large
- risk: high
- affected_domains: Media Studio frontend, Admin Media Models, skill runtime, skill packages, Node/tRPC media routers, Drizzle schema/migrations, Python Kie provider, pricing/credit reservation, QA/learning recommendations
- estimated_file_count: 20+
- chosen_route: deep-plan-chain
- task_summary: Produce a detailed TDD implementation plan and sectionized work breakdown for Gemini Omni Suite Media Assets.
- bug_route: false

## Activation Decision
- orchestra: explicitly requested by the user.
- deep-plan: explicitly requested by the user and appropriate because a full spec exists and the feature spans DB, UI, backend, Python provider, skills, QA, and pricing.
- deep-implement: not started in this turn; this turn is planning-only per user request.

## Blast Radius Summary
- Direct planning target: `/home/dev/projects/SmartSpecPro/specs/feature/114-gemini-omni-suite-media-assets/spec.md`
- Deep-plan outputs: `claude-research.md`, `claude-interview.md`, `claude-spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, and `sections/`
- Implementation domains expected later:
  - `apps/web/client/src/pages/MediaStudio.tsx`
  - `apps/web/client/src/components/media/*`
  - `apps/web/client/src/lib/mediaModelInputs.ts`
  - `apps/web/server/routers/media.ts`
  - `apps/web/server/routers/mediaModels.ts`
  - `apps/web/server/services/mediaGenerationService.ts`
  - `apps/web/server/services/modelRegistry.ts`
  - `apps/web/shared/mediaModelPricing.ts`
  - `apps/web/drizzle/schema.ts`
  - `apps/web/scripts/seed-media-models-kie-ai.ts`
  - `apps/web/scripts/seed-media-providers.ts`
  - `apps/web/skills/gemini-omni-*`
  - `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- Risk-sensitive surfaces:
  - DB migration and tenant-scoped asset access
  - tRPC/router authorization and media generation credit reservation
  - external Kie.ai provider calls and redacted logging
  - skill auto-learning recommendation flow
  - Media Studio UI and storyboard generation UX
- Confidence: high for planning route; implementation details will be validated in section plans.
