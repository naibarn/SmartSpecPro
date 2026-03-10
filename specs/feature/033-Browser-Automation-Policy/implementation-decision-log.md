# Implementation Decision Log

## 2026-03-10

### Run bootstrap
- section: workflow
- options considered:
  - implement the full seven-section feature directly in live execution paths first
  - establish the storage, contract, and policy-engine foundation as pure modules first
- decision taken: establish the storage, contract, and policy-engine foundation first, then wire the enforceable router/launch-guard seams
- mode used: auto
- rationale: the current Node and Python browser paths do not yet share an action-by-action policy seam. Building the stable schema, contract, classifier, and approval payload primitives first keeps the diff smaller, keeps tests deterministic, and creates the substrate required for later execution-path hooks.
