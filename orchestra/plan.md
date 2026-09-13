# Orchestra Plan

## Task

Repair the Kie.ai attachment boundary end-to-end so Vertical Drama and other
Kie image/video jobs do not regress between long URLs, inaccessible managed
assets, low-quality base64 fallback, and unsupported image formats.

## Classification

- scope: medium
- risk: high
- affected_domains: [Node media reference resolution, Python Kie adapter, model capability/config, focused tests]
- estimated_file_count: 6-10
- chosen_route: direct-standard-light with inline TDD and convergence review
- bug_route: true
- planned_agents: []
- dispatch_preference: inline-fallback; SocratiCode MCP unavailable

## Evidence ledger

- source: ui-only + test-output + code-path inspection
- identifier: screenshot error `500: Image generation failed: URL too long`; Kie provider path `python-backend/app/llm_proxy/providers/kie_ai_provider.py`; Qwen3 catalog `apps/web/scripts/seed-media-models-kie-ai.ts`
- observed failure: Kie reference upload currently activates mainly for `input_urls`; Qwen3 image-to-image uses `image_urls`, so protected signed app URLs can reach the provider unchanged. The provider contract/docs require provider-reachable file URLs and model-specific size/format limits.
- data state: no production task id/log/database row was supplied; local catalog and provider tests confirm the affected routing boundary.
- confidence: high for the recurring code-path defect; live provider/deployment behavior remains unverified
- next evidence needed: focused regression tests and local adapter payload proof; no paid/live provider call

## Invariants for this repair

1. Kie generation payloads never contain a SmartAIHub authenticated/protected
   storage URL or a data/base64 URL for image/video references.
2. Managed references are fetched with tenant-scoped server authorization and
   re-hosted through the Kie file upload boundary before provider submission.
3. Provider input is validated from downloaded bytes: supported media type,
   non-empty content, and bounded size; extension/metadata alone is not trusted.
4. Reference upload must preserve source fidelity; no lossy base64 conversion
   or silent WebP-to-JPEG conversion is introduced. A provider-specific format
   normalization is explicit and tested if a model requires it.
5. Unsupported or inaccessible references fail before paid task submission with
   a stable, actionable error and redacted diagnostics.
6. Public URL references remain supported, but long/protected/known app URLs
   take the same upload path so Kie receives a short provider URL.
7. Image and video references use one shared preparation policy with model
   capability limits; the provider field names remain catalog-driven.

## Waves

### Wave 1 — contract and regression tests

- Extend Kie adapter tests for Qwen3 `image_urls` with long protected URLs,
  already-public URLs, data URLs, invalid/empty responses, content mismatch,
  and video reference preparation.
- Add a small pure policy helper or testable decision boundary if the current
  inline logic cannot express the invariant without duplication.
- Confirm tests fail before implementation.

### Wave 2 — provider-boundary implementation

- Make Kie reference preparation select a single safe upload path for protected,
  oversized, data, and provider-required references.
- Validate bytes and MIME signatures consistently for image/video uploads.
- Preserve source bytes and provider URL; do not silently fall back to base64.
- Add bounded redacted error classification and prevent task submission after
  preparation failure.

### Wave 3 — Node/config integration and impact closure

- Audit Node reference URL resolution and model config so all Kie calls reach the
  Python boundary with tenant context and no accidental base64/data URL path.
- Check Kie seed/migration/runtime config for field-name and format drift.
- Add/adjust focused Node tests only where the contract is currently unguarded.

### Wave 4 — verification and convergence review

- Run focused Python Kie tests, Python lint/compile, relevant Node tests,
  TypeScript check if touched, and `git diff --check`.
- Perform a targeted second-order review for image/video, public/protected URL,
  format, size, error/redaction, and no-paid-call guarantees.
- Record deferred live-provider/deployment proof separately; do not claim it from
  mocks or health checks.

## Worktree discipline

- Preserve all unrelated dirty/untracked user files.
- Do not read or mutate `.env` secrets.
- Do not call Kie, consume credits, run deployment, or alter production data.
- The previous Orchestra state was archived at
  `.orchestra-archive/20260913T015406Z/`.
