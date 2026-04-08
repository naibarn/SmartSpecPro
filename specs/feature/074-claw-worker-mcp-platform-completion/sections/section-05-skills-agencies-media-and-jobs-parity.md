# Section 05: Skills, Agencies, Media, and Jobs Parity

## Goal

Convert the major operational MCP tool families from stub or bridge-only behavior into real delegated-worker execution paths.

## Why this section exists

After gateway and knowledge parity, these families make delegated workers meaningfully productive. They also represent most of the currently visible placeholder surface in public MCP.

## Scope

1. Implement real MCP wrappers for:
   - skills list/detect/execute
   - agencies list/invoke/status
   - media generate/status
   - jobs create/list/get/cancel where supported
2. Preserve and harden the agency tool bridge rather than rewriting it blindly.
3. Normalize long-running results into durable ids, status handles, and safe links.
4. Keep billing, budget, grants, and concurrency consistent with Section 03.

## Suggested files

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/publicSkillsApi.ts`
- `apps/web/server/routes/publicAgencyApi.ts`
- `apps/web/server/routes/publicMediaApi.ts`
- `apps/web/server/routes/publicJobsApi.ts`
- `apps/web/server/services/agencyMcpService.ts`

## Family-specific concerns

Important concerns that this section should resolve explicitly:

- skill execution should not bypass skill-level authorization or execution policy
- agency invocation should preserve current run tracking and stream/status semantics where relevant
- media generation should stop returning fake placeholder payloads
- jobs should return durable ids and status/cancel paths consistent with the current backend

## Design rules

- Reuse the strongest HTTP or service implementation rather than duplicating business logic in MCP.
- Hide families tool-by-tool if a sub-surface is still placeholder-only.
- Preserve source attribution and audit context when one family delegates into another backend component.
- Keep the worker-facing result format useful for automation, not just for human inspection.

## Testing first

- skills list/detect/execute wrapper tests
- agencies list/invoke/status wrapper tests
- agency tool bridge hardening tests
- media create/status wrapper tests
- jobs create/list/get/cancel wrapper tests
- async result-shape tests for long-running families

## Handoff to later sections

- Section 06 uses the same parity pattern for presentation and video artifact-heavy flows.
- Section 08 documents which families are production-ready after this phase.

## Implementation notes

- Registry-backed execution is now implemented for:
  - skills list/get/detect/execute
  - agencies list/invoke/status
  - media generate image/video/audio plus status
  - async jobs submit/list/get/cancel
- These families now return structured live results instead of placeholder bridge text.

## Verification

- `npm --prefix apps/web test -- server/_core/__tests__/mcpPublicServer.test.ts server/_core/__tests__/mcpPublicServerSecurity.test.ts`
