# Section 01: Contracts and Persistence

## Goal

Create the shared data contracts and persistence layer that make delegated worker execution possible. This section establishes the durable vocabulary that later sections depend on.

## Why this section exists

Feature 071 already has workers, worker jobs, artifacts, and billing envelopes. Feature 072 needs new persisted concepts for:

- delegated worker platform sessions
- job-scoped resource grants
- delegated budget metadata
- worker-origin metadata that survives downstream API calls
- delegated capability-manifest data that tells a worker what it can actually use

Without these contracts, later sections would be forced to invent ad hoc route-specific state.

## Scope

1. Add schema support for delegated worker sessions.
2. Add schema support for worker-job resource grants.
3. Add shared TypeScript contracts for delegated claims, scope profiles, grant types, and worker-origin metadata.
4. Add migration planning for any new tables or enum changes needed by delegated worker flows.
5. Keep the contracts runtime-aware so OpenClaw is the first path, not the only path forever.
6. Add shared schema support for delegated capability-manifest payloads.

## Suggested files

- `apps/web/drizzle/schema.ts`
- new drizzle migration files under `apps/web/drizzle/`
- `apps/web/shared/workerRuntime.ts`
- new shared files for delegated session and grant schemas
- worker-service type files used by routes and services

## Data model expectations

### Delegated session record

Expected fields:

- session ID
- tenant ID
- team ID when relevant
- worker ID
- worker job ID
- acting user ID
- owner user ID
- runtime type
- bound profile or connector context
- scope profile
- granted scopes
- grant-set reference
- budget envelope
- lease fingerprint
- revocation status
- expiration timestamp
- trace ID

### Worker job grant record

Expected fields:

- grant ID
- worker job ID
- tenant ID
- grant type
- resource ID or scoped JSON payload
- created timestamp
- expiration timestamp

### Worker-origin metadata contract

Expected fields:

- `originSurface`
- `workerId`
- `workerJobId`
- `runtimeType`
- `delegatedSessionId`
- `traceId`
- `delegatedByUserId`
- `ownerUserId`
- `leaseId`
- `recursionDepth`

### Delegated capability manifest contract

Expected fields:

- worker job ID
- delegated session ID when already issued
- allowed HTTP route families
- allowed MCP namespaces
- allowed scope profile
- allowed model aliases or provider profiles
- allowed skills or agencies where preselected
- owner-library and owner-RAG capability flags
- upload policy summary including file classes and size limits
- callback target permissions
- feature availability state such as `ready`, `experimental`, or `unavailable`

## Design rules

- Contracts must not hardcode OpenClaw-specific semantics where a generic worker-runtime field is appropriate.
- Grant types should be expressive enough for both HTTP and MCP enforcement.
- Expiration and revocation state must be first-class fields, not only inferred from timestamps.
- Shared contracts must be usable by routes, services, and tests without copy-pasted types.

## Testing first

- schema tests for delegated-session and grant records
- shared validation tests for delegated claim parsing
- migration tests or schema regression tests for new tables and enums
- metadata contract tests that ensure worker-origin fields are preserved structurally
- contract tests that owner-user linkage is present for owner-bound delegated flows
- manifest schema tests for capability discovery payloads

## Handoff to later sections

- Section 02 consumes delegated session and grant contracts for issuance and auth.
- Section 03 consumes scope profiles and grant types for route enforcement.
- Section 04 consumes budget and metadata fields for billing propagation.
- Section 07 consumes recursion-depth and revocation-related fields for security controls.
