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

### Raw browser launch guard
- section: 04
- options considered:
  - leave the raw browser route unchanged until full Automation Copilot integration exists
  - block the raw browser route immediately unless the shared policy contract is explicitly wired
- decision taken: block the raw browser route immediately unless the shared policy contract is explicitly wired
- mode used: auto
- rationale: the raw route is a concrete bypass risk today, while the live Automation Copilot hook still needs a new cross-stack execution seam. Tightening the raw-browser surface is an in-scope safety win that does not require inventing a fake workflow context.

### Data-handling control shape
- section: 05
- options considered:
  - push section-05 controls directly into the main policy engine as ad hoc branches
  - extract reusable trust-tier and rate-limit helpers, then compose them into the existing data-handling policy seam
- decision taken: extract reusable trust-tier and rate-limit helpers, then compose them into the existing data-handling policy seam
- mode used: auto
- rationale: section 05 needs several related controls with shared reason codes across Node and Python. Keeping the logic in focused helpers keeps the diff smaller, makes service-level tests straightforward, and avoids baking threshold logic into one large engine function.
