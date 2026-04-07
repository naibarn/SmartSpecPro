# Section 03: HTTP Gateway Compatibility and Docs

## Ownership

This section owns the truthful Claw-compatible HTTP gateway contract and the public documentation/discovery work needed so external runtimes know exactly which routes are supported.

## Target files and modules

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/routes/publicDocsApi.ts`
- gateway docs/discovery tests

## Scope

- document the supported HTTP gateway contract around:
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
  - `GET /v1/models`
  - `GET /v1/credits`
  - `GET /v1/events` where relevant
- define the auth profile external runtimes are expected to use
- make embeddings support explicit:
  - implement a real route in-scope
  - or document it as unsupported in this phase
- keep docs and discovery truthful so the published contract matches real behavior

## TDD expectations

- update docs tests before editing the OpenAPI/public docs output
- add route-contract assertions for supported gateway endpoints
- add negative assertions so unsupported embeddings or MCP parity are not accidentally documented as available

## Acceptance checks

- external runtimes can read one clear HTTP gateway contract from SmartSpecPro docs
- docs do not overstate support
- gateway compatibility language matches the actual routes and auth behavior

## Risks and coordination notes

- do not hide important caveats such as unsupported embeddings
- keep this section independent from MCP parity so HTTP support can ship first
