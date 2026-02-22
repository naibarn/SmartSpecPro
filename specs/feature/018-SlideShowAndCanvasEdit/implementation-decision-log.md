# Implementation Decision Log

## 2026-02-22 - Section 01 - Working Tree/Branch Strategy
- options_considered:
  - `switch_branch`: create feature branch before implementation
  - `proceed_main`: proceed on `main` with current dirty tree
- decision_taken: `proceed_main`
- mode_used: `asked`
- rationale: User explicitly selected option 2 after preflight warning.

## 2026-02-22 - Section 01 - Presentation Guard Contract Shape
- options_considered:
  - `throw_errors`: throw RPC errors for wrong-editor and disabled states
  - `deterministic_payload`: return deterministic guard payloads with stable error code + recovery CTA
- decision_taken: `deterministic_payload`
- mode_used: `auto`
- rationale: Lower frontend integration risk and directly satisfies section requirement for deterministic recovery metadata.

## 2026-02-22 - Section 01 - Shared Contract Placement
- options_considered:
  - `server_local`: keep presentation constants/contracts only in server router
  - `shared_module`: define constants/contracts under shared module and consume from server/client
- decision_taken: `shared_module`
- mode_used: `auto`
- rationale: Section explicitly requires shared typed contracts and stable machine-readable codes used by backend/client.
