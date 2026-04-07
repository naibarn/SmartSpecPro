# Review Findings

## Purpose

This note records the main completeness gaps found while checking Feature 071 against the current SmartSpecPro codebase and the concrete spec upgrades applied afterward.

## Findings and resolutions

### 1. The original spec was too abstract about rollout gating

Finding:

- the first draft described REST worker APIs, but did not account for the current server behavior where bearer-authenticated callers bypass `publicApiFeatureGuard`

Resolution:

- added a dedicated tenant feature flag recommendation: `openClawExternalRuntime`
- made worker routes explicitly enforce that flag rather than relying on `/v1` middleware

### 2. The original spec did not bind cleanly to the existing library/indexing system

Finding:

- SmartSpecPro already has durable asset publication patterns via `library_items`, `library_links`, `createLibraryItem()`, and `safeEnqueueLibraryIndexJob()`
- the original spec still spoke in generic “artifact publication” terms

Resolution:

- specified that OpenClaw publication must reuse existing library/indexing services
- added recommended library conventions such as `source = "worker_runtime"` and `library_links.linkType = "worker_job_artifact"`

### 3. Credit and budget handling was underspecified

Finding:

- current platform behavior centralizes billing and budget checks in `creditService.deductCredits()`
- the original spec did not clearly state when or how worker-dispatched jobs should charge or reconcile credits

Resolution:

- added a worker-job credit posture
- required idempotent charging, tenant budget checks, and refund/reconciliation semantics
- recommended a dedicated worker credit source type instead of hiding usage under `other`

### 4. Team and run integration missed a UI compatibility trap

Finding:

- the current workflow UI derives “waiting for external connector” state from human-readable reason strings
- a new structured worker integration could silently break that UI if it only emitted new codes

Resolution:

- added a run-state compatibility contract
- required structured codes plus a backward-compatible human-readable reason during rollout
- expanded TDD coverage for `RoomWorkflowPanel` compatibility

### 5. Observability and audit hooks were not concrete enough

Finding:

- the current codebase has a rich audit logger, but the first draft did not list the worker-runtime event types that need to be added

Resolution:

- added concrete worker audit event recommendations
- required trace correlation between worker actions and library/publication outcomes

### 6. Gateway compatibility for Claw runtimes was still too implicit

Finding:

- the codebase already has a substantial HTTP LLM proxy surface via `/v1/chat/completions`, `/v1/responses`, and `/v1/models`
- however, the first review pass still did not lock down what "Claw-family gateway support" really means
- the current MCP public server advertises `smartspec.llm.*` tools, but those handlers are placeholders
- the current `/v1/responses` route performs tenant feature checks, but external callers still fall back to `tenantId = "default"`
- there is no public `/v1/embeddings` route, and public docs do not yet publish the LLM proxy endpoints as a formal compatibility contract

Resolution:

- added a gateway compatibility profile to the feature spec
- documented the current family-level position: HTTP gateway mostly ready, MCP LLM parity not ready
- added a tenant-normalization requirement so Claw gateway callers are not silently collapsed into the default tenant
- added acceptance criteria so we do not claim full gateway support while MCP LLM tools still return placeholders
- added a dedicated `gateway-compatibility-review.md` note to capture supported, partial, and missing surfaces

## Outcome

After this review pass, Feature 071 is materially more implementation-ready because it now ties OpenClaw support to:

- current bearer-auth and route-hosting behavior
- tenant feature-flag rollout patterns
- existing library and indexing services
- current credit and budget infrastructure
- existing team-room pause and workflow UI behavior
- the actual readiness of the existing HTTP and MCP gateway surfaces for Claw-family runtimes
