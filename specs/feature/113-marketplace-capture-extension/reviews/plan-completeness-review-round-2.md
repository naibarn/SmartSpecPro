# Plan Completeness Review Round 2

Date: 2026-05-17
Reviewer: Orchestra inline review

## Verdict

The plan was already implementation-ready after round 1. Round 2 focused on operational completeness and release readiness: provenance, async boundaries, quotas/cost, extension packaging review, accessibility, diagnostics, and legal/product release gates.

## Additional Findings Added

### 1. Field Provenance And Schema Versioning

Risk: Future audits need to know whether a saved value came from DOM, LLM, or user edit. Shopee DOM changes can also make old captures hard to interpret.

Added:

- field-level provenance and user-edit metadata
- capture payload schema version
- LLM output schema version
- adapter/parser heuristic version
- migration verification and rollback notes

### 2. Async Job Boundary And Config Validation

Risk: Analyze/mirroring/cleanup can outgrow synchronous route execution. Missing env values can create unsafe production defaults.

Added:

- async-compatible service boundary and status contract
- fail-closed production config validation
- route shape compatible with future queue-backed execution

### 3. Token Storage And Paired Extension Management

Risk: Raw refresh-token persistence and all-or-nothing revoke behavior are weak operational security.

Added:

- hashed/protected refresh tokens
- token binding to extension id, environment, pairing record, user, and tenant
- SmartSpecPro UI/API for per-extension revoke

### 4. Partial Upload And Orphan Cleanup

Risk: multipart uploads can leave orphaned storage objects or duplicate evidence.

Added:

- checksums and duplicate suppression
- orphan cleanup for failed DB writes and abandoned assets
- paginated capture/candidate retrieval

### 5. LLM Budget, Model Policy, And PII Prefilter

Risk: analyze can overspend credits or send unnecessary account/contact noise to the LLM.

Added:

- per-user/tenant analyze budget checks
- model policy config for text, vision, and repair
- PII/minimization prefilter before LLM input

### 6. Web UI Accessibility And Bounded Lists

Risk: product/capture lists can become unbounded, and image picker controls can be inaccessible.

Added:

- pagination/search/filter requirements
- loading/empty/error/retry/partial/stale/deleted evidence states
- keyboard and accessible-name requirements for image picker and icon buttons

### 7. Extension Build/Packaging Review

Risk: Chrome Web Store review evaluates compiled output, and environment mixups can leak production or dev data.

Added:

- compiled bundle scan for remote hosted code strings, broad permissions, source-map leakage, and secrets
- visible dev/staging/prod labels
- optional host permission guidance where practical

### 8. Adapter Diagnostics And Cancellation

Risk: Shopee DOM breakage and lazy-load failures will be hard to support without safe diagnostics. Users need a clean cancel path.

Added:

- adapter diagnostics without full page dumps
- scan/capture queue cancellation, duplicate suppression, and backoff
- capture cancellation that clears local temporary evidence

### 9. Operations And Legal/Product Readiness

Risk: production operation needs alerts/runbooks; marketplace capture has ToS, privacy, copyright, and data deletion implications.

Added:

- metrics/alerts for capture volume, upload failures, analyze failures, storage growth, LLM spend, rate limits, rejected origins, and validation failures
- disable/cleanup runbooks
- legal/product checklist for marketplace terms, user responsibility copy, copyright/IP handling, privacy policy, deletion/export expectations
- Playwright Chrome extension E2E plan

## Remaining Decisions

These remain product/config decisions and should be resolved before implementation or before production enablement:

- Exact retention windows for unconfirmed and confirmed evidence.
- Whether marketplace image copying is MVP or post-MVP.
- Whether products sync into Library/catalog or stay standalone.
- Production Chrome extension ID and SmartSpecPro domain allowlists.
- Which LLM models are approved for text, vision, and repair.
- Whether extension host permissions should be install-time or optional runtime for each supported marketplace.

## Final Assessment

Completeness: Strong.
Security: Strong planning baseline, with explicit release gates still required.
Operations: Improved; now includes metrics, runbooks, cleanup, and packaging checks.
Implementation Readiness: Ready to hand to `deep-implement` section by section.

