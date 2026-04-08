# Section 06: Presentations, Video, and Artifact-Safe Results

## Goal

Complete the presentation and video families while normalizing safe result handling for long-running, artifact-heavy MCP work.

## Why this section exists

Presentations and video work are highly valuable for delegated workers, but they also raise the hardest result-handling problems: long-running async work, export/download flows, and potentially unsafe artifact payloads.

## Scope

1. Implement real MCP wrappers for:
   - presentation create
   - presentation get/list where supported
   - presentation export/download/progress
   - video project create/get/list where supported
   - video export/download or equivalent status flows
2. Normalize artifact-safe result handling:
   - durable task or export identifiers
   - artifact refs
   - safe download links
   - no oversized inline payloads
3. Reuse existing worker callback posture where completion should be surfaced to rooms, workflows, or user notifications.
4. Preserve safe-serving policy for active content.

## Suggested files

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/publicPresentationsApi.ts`
- `apps/web/server/routes/publicVideoApi.ts`
- `apps/web/server/services/workerArtifactService.ts`
- `apps/web/server/services/workerCallbackService.ts`

## Result model

This section should establish the durable result pattern that artifact-heavy MCP families use:

- creation returns a stable task or job id
- progress/status returns current state
- exports return artifact or download refs
- completion summaries can be reported through existing callback channels when the worker chooses to surface them back to the owner-facing product

## Design rules

- Do not return unsafe inline markup or binary blobs when a reference is enough.
- Do not bypass existing artifact publication or safe-serving policy.
- Keep result payloads structured and automation-friendly.
- Preserve the same access controls on export/download flows that HTTP already applies.

## Testing first

- presentation wrapper tests
- video wrapper tests
- artifact-safe result tests
- safe-serving tests for active-content outputs
- callback integration tests for MCP-triggered long-running completion reporting

## Handoff to later sections

- Section 08 documents the expected runtime behavior and safe result expectations.

## Implementation notes

- Presentation create/get/progress/export/download wrappers are implemented in the canonical MCP registry.
- Video project create/get/download wrappers are implemented in the same registry.
- Result metadata now distinguishes structured results, artifact references, and safe download references.

## Verification

- `npm --prefix apps/web run check -- --pretty false`
