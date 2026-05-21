# Plan Completeness Review

Date: 2026-05-17
Reviewer: Orchestra inline review

## Verdict

The plan is strong enough for implementation planning and already covers the most important product and security requirements: user-assisted capture, extension pre-upload review, scoped extension auth, strict origin handling, multipart uploads, SSRF safety, prompt-injection hardening, web preview confirmation, and retention.

I found several completeness gaps that are not blockers to the product direction but should be added before implementation starts. These were patched into `claude-plan.md`, `claude-plan-tdd.md`, and the relevant section files.

## Findings Added To The Plan

### 1. Evidence Minimization, Cropping, And Redaction

Risk: The extension may capture marketplace header/account areas or unnecessary full viewport screenshots.

Added:

- crop screenshots to intended evidence regions where feasible
- full viewport screenshot warning/confirmation
- redaction metadata for obvious account/header/user-personal regions
- user can remove DOM/HTML blocks before upload

### 2. State Machine And Long-Running Status Recovery

Risk: MV3 service workers can suspend, LLM analysis can take time, and retries can duplicate or corrupt state.

Added:

- explicit `analysisStatus`, `assetUploadStatus`, `stateVersion`, and transition metadata
- status endpoint/polling contract for upload/analyze recovery
- idempotency scoped by user, endpoint, action, and payload hash where feasible

### 3. Variant/SKU Support

Risk: Shopee product pricing often depends on selected variants. Saving one visible price without variant context can mislead users.

Added:

- optional variant/SKU schema and extraction
- extension scanner capture for visible option labels and selected price context
- web preview variant/SKU editor

### 4. Extension Security Hardening

Risk: Extension attack surface includes forged messages, remote-code policy, overly broad permissions, and local queued evidence.

Added:

- strict cross-context message validation
- no remote JS/eval CSP checks
- local token/draft hygiene and logout/revoke cleanup
- service worker recovery behavior

### 5. Product Lifecycle After Confirm

Risk: The original plan covered confirm save but not deletion, rescan/update, or purge visibility.

Added:

- delete draft/product evidence behavior
- rescan creates new capture and price snapshot
- preview/product detail shows retained vs purged evidence

### 6. LLM Extraction Ledger And Fallback

Risk: Extraction results need reproducibility, audit, and graceful behavior when LLM is unavailable.

Added:

- extraction run metadata: provider/model, prompt version, schema version, evidence asset IDs, repair count
- deterministic DOM-first fallback extraction when LLM is disabled or rate-limited

### 7. Chrome Web Store And Threat Model Release Gates

Risk: Extension submission can fail on single-purpose, permissions, data disclosure, or remote-code policy gaps.

Added:

- Chrome Web Store checklist
- explicit threat model release gate
- retention/deletion tests as production blockers

## Remaining Recommended Additions Before Implementation

These are useful but can be handled as implementation tasks rather than more planning edits:

- Decide exact retention periods for unconfirmed and confirmed raw evidence.
- Decide whether product images should be copied from marketplace CDN in MVP or remain original URLs.
- Decide whether marketplace capture products eventually sync into Library/catalog records.
- Confirm production extension ID and SmartSpecPro domains for CORS/host permissions.

## Final Assessment

Completeness: Good after patch.
Security: Good foundation after patch; production still requires security tests and threat model.
Implementation Readiness: Ready for `deep-implement` section-by-section once product constants and env values are chosen.

