# Feature 201 — 15-round requirement-to-code audit

Audit date: 2026-09-18

Each round checked a separate boundary and recorded a result before the next
round. Rounds 04 and 06 first used an overly narrow grep assertion; the
assertions were corrected and rerun successfully. This was a check correction,
not a product gap.

| Round | Boundary | Result | Evidence / disposition |
|---:|---|---|---|
| 01 | Spec section inventory | PASS | `check-sections.py`: 10/10 |
| 02 | UI contract inventory | PASS | `check-ui-contracts.py`: 7 UI-affecting sections |
| 03 | Shared contract and intent | PASS | Shared envelope, choice resolution, strict ON/OFF intent |
| 04 | Persistence/migration | PASS | 18 Feature-201 tables, migration 0332, journal entry; migration-tool baseline collision recorded |
| 05 | Provider boundary | PASS | Configured provider fails closed; deterministic provider is test-only |
| 06 | Worker stages/result contract | PASS | All 7 ordered stages, bounded retry classification, secret/raw-byte redaction |
| 07 | Worker capability/admission | PASS | Rust capability requires explicit flag, provider, and executable command |
| 08 | Artifact/hash proof | PASS | Final artifact checksum, source checksum, self-detect confidence, stale fencing |
| 09 | Editor final render | PASS | Intent reaches Remotion worker metadata and final gate; preview is rejected |
| 10 | Vertical Drama compound | PASS | Source media IDs/checksums required; missing identity fails closed |
| 11 | Trailer/clip combination | PASS | Trailer output artifact and downloaded source refs enter compound gate |
| 12 | Modality/UI | PASS | Image/video/audio paths and modality-specific evidence; image flag fail-closed |
| 13 | Workspace/navigation | PASS | Top-level workspace, App routes, menu, Dashboard nested quick links, Settings deep link |
| 14 | Rights/verification/review | PASS | Owner/tenant scoping, cases, certificate guard, hashed expiry/revocation, disclaimer |
| 15 | Regression/release boundary | PASS | 199 focused TS tests, 3 Rust tests, rustfmt, diff check; provider/browser/DB baseline gates retained |

## Fixes made during the audit

- Reused queued verification runs instead of returning a permanently queued
  record; scoped idempotency to the requester for non-admin users.
- Scoped evidence-package asset selection to the case owner for non-admin users.
- Added trailer artifact/checksum/source-ref handoff.
- Removed the Node executor's early `PROTECTED` transition and reordered
  publication after canonical artifact reconciliation.
- Rejected Vertical Drama protection when source media identity/checksum is
  unavailable; rejected legacy in-process production assembly for ON.
- Added Dashboard nested quick links and fixed their feature-flag bypass.
- Added workspace controls for cases, evidence packages, rights claims, and
  certificates.

## Final residual gates

Local code evidence does not establish legal ownership. A real VideoSeal or
PixelSeal-compatible provider command, registered worker, authenticated browser
run, production migration validation, and legal/UAT review remain required
before enabling the feature for a tenant.
