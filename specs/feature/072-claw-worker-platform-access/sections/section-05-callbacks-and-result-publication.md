# Section 05: Callbacks and Result Publication

## Goal

Let a worker job return useful completion information back into SmartSpecPro so the user can see what the worker accomplished without leaving the system of record.

## Why this section exists

Bound Worker is only genuinely useful if it can hand results back in a human-friendly way. This section turns internal worker success into visible product value.

## Scope

1. Add callback endpoints for worker-job result publication.
2. Bind callback targets to the originating room, workflow, or user context.
3. Support summaries, artifact links, and output links.
4. Reuse existing artifact publication flow rather than creating a competing storage model.
5. Keep callback content safe, rate-limited, and auditable.
6. Apply explicit serving policy to active-content artifacts.
7. Support safe owner-library and RAG ingestion through the normal SmartSpecPro publication pipeline.

## Suggested files

- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerArtifactService.ts`
- room or workflow publication services
- monitoring or run-history presentation layers

## Recommended callback endpoints

- `POST /api/worker-jobs/:jobId/publish-room-update`
- `POST /api/worker-jobs/:jobId/publish-workflow-update`
- `POST /api/worker-jobs/:jobId/publish-user-notification`

## Callback rules

- target must match the originating job context
- idempotency keys must be enforced
- payloads should be plain text by default
- rich text, if allowed, must be sanitized
- only safe URL schemes and allowed destinations may be included
- SmartSpecPro-owned artifacts remain the primary system of record

Default callback policy:

- plain text only by default
- maximum summary length of 4,000 characters
- maximum 10 links per callback
- HTTPS-only for external links
- external dashboard links must use an admin-approved domain allowlist
- default rate ceiling of 10 publishes per 10 minutes per worker job

## Active-content artifact rules

Artifacts that may execute or render active content, such as HTML or SVG, must not be published with implicit trust.

This section should define:

- which artifact classes are safe to inline-render
- which must be sanitized first
- which must be forced to download
- which should be quarantined or blocked

Default active-content policy:

- HTML, SVG, and script-like bundles are download-only by default
- office-like formats with macro or active-content risk are scan-or-quarantine first, then download-only by default
- inline rendering requires an explicitly sanctioned safe viewer or sanitizer path

## Result expectations

The user should receive:

- success or failure state
- readable summary
- links to outputs
- SmartSpecPro artifact or publication references

If the worker uploads files for the owner's future knowledge use, the result flow should also expose:

- library or document references
- indexing or ingestion status
- any scan, quarantine, or file-type rejection outcome

## Design rules

- Do not grant the worker uncontrolled write access to arbitrary rooms or workflows.
- Do not rely on external dashboard links as the primary output record.
- Prefer publication through the existing library and artifact lineage flows where possible.
- Prefer owner-library or RAG ingestion through the existing artifact, library, and indexing path instead of direct vector-store mutation.

## Testing first

- route tests for allowed callback targets
- rejection tests for unrelated targets
- unsafe-link and oversize-payload rejection tests
- artifact-link validation tests
- active-content artifact handling tests
- user-visible result rendering or run-history tests where applicable
- owner-library or RAG ingestion tests with allowlisted and rejected file types

## Handoff to later sections

- Section 08 documents the user-visible outcome flow and help content.
