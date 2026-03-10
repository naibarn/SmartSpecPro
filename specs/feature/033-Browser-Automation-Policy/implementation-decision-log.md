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

### Audit and incident-control shape
- section: 06
- options considered:
  - couple browser-policy audit, metrics, and incident control behavior directly to existing runtime services first
  - land deterministic helper artifacts and summaries first, then wire them into the runtime path once the execution seam exists
- decision taken: land deterministic helper artifacts and summaries first, then wire them into the runtime path once the execution seam exists
- mode used: auto
- rationale: the live browser execution seam is still missing, but the audit schema, integrity model, and fail-closed incident semantics can still be specified and tested now. This keeps section 06 moving without pretending the runtime plumbing is complete.

### Rollout-gate shape
- section: 07
- options considered:
  - defer all rollout and migration work until real partition DDL and deployment hooks exist
  - encode the approved thresholds and rollback posture now as executable helpers, while recording raw-SQL and deployment integration as follow-up work
- decision taken: encode the approved thresholds and rollback posture now as executable helpers, while recording raw-SQL and deployment integration as follow-up work
- mode used: auto
- rationale: threshold math and rollback posture are stable product rules that benefit from immediate executable tests. The raw SQL partition path and deployment orchestration remain separate operational work items and should stay explicit rather than implied.

### Live execution policy seam
- section: 04
- options considered:
  - continue treating the browser-policy helpers as pre-runtime modules until a workflow-backed entitlement identity exists
  - introduce an execution-scoped Automation Copilot policy context and a Node-owned internal evaluation endpoint so the Python executor can enforce decisions immediately
- decision taken: introduce an execution-scoped Automation Copilot policy context and a Node-owned internal evaluation endpoint so the Python executor can enforce decisions immediately
- mode used: auto
- rationale: the repo already supports authenticated Python-to-Node internal calls, while Automation Copilot still lacks a stable workflow entitlement ID. An execution-scoped context keeps the runtime decision authority in Node, enables pre-dispatch and transition enforcement now, and fails closed for higher-risk capabilities that are not explicitly granted.

### Approval wait strategy
- section: 04
- options considered:
  - fail every `require_approval` decision immediately and leave human approval as a separate follow-up
  - create approval requests from the live executor and wait on the existing approval DB state before dispatching the action
- decision taken: create approval requests from the live executor and wait on the existing approval DB state before dispatching the action
- mode used: auto
- rationale: this reuses the existing approval system and polling model without inventing a second browser-specific approval transport. It keeps risky actions blocked until approved while preserving the current two-stack architecture.

### Executor event-surface enforcement
- section: 04
- options considered:
  - keep popup, iframe, and prompt events as documented follow-up work until the executor exposes richer native primitives
  - attach lightweight Playwright event watchers now and feed synthetic transition/prompt actions through the existing Node-owned policy client
- decision taken: attach lightweight Playwright event watchers now and feed synthetic transition/prompt actions through the existing Node-owned policy client
- mode used: auto
- rationale: the current executor already exposes the relevant Playwright `page.on(...)` hooks, so waiting for a larger execution refactor would leave an avoidable runtime gap. Synthetic popup/frame transitions and prompt/file/download surfaces reuse the existing policy contract with a small diff and keep healing retries compatible by sharing one page-level event queue.

### Live transfer primitive coverage
- section: 05
- options considered:
  - leave upload and clipboard actions as policy-only concepts until the generator and executor gain a richer transfer model
  - implement the current executor primitives now for `upload`, `clipboard_write`, and `clipboard_read`, and thread their counter semantics through the existing policy client
- decision taken: implement the current executor primitives now for `upload`, `clipboard_write`, and `clipboard_read`, and thread their counter semantics through the existing policy client
- mode used: auto
- rationale: section 05 already has the transfer policy logic and thresholds, but the live executor only knew generic DOM actions. Adding the existing Playwright-backed upload and clipboard primitives is a small, reversible diff that activates real policy-controlled transfer behavior now without inventing a larger DSL or Redis-backed counter layer first.

### Approval cache revalidation
- section: 06
- options considered:
  - keep approved correlation keys as permanent in-memory bypasses until a richer incident-status channel exists
  - re-read approval state on every cached approval reuse and fail closed if the request was revoked, cancelled, rejected, or expired
- decision taken: re-read approval state on every cached approval reuse and fail closed if the request was revoked, cancelled, rejected, or expired
- mode used: auto
- rationale: the current runtime already has the request id for each approval correlation key, so revalidating it is a small, local change that closes a real post-approval revocation gap without waiting for a larger operator-status transport.
