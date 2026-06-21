# Self Review Round 1: Feature 121 Deep Plan

## Verdict

The plan is implementable and aligned with the spec, but three improvements are needed before section splitting.

## Findings

### Finding 1: Feature Flag Naming Needs Code/Spec Mapping

The spec lists snake_case flag names, while existing SmartSpecPro `featureFlags.ts` patterns commonly use TypeScript-friendly keys. The plan must require an explicit mapping so implementation does not accidentally create mismatched UI/server flags.

Action: Add a feature flag mapping table and require client/server use of the same exported keys.

### Finding 2: OAuth Callback Route Registration Is Too Implicit

The plan creates `McpConnectCallback.tsx`, but does not explicitly name route registration. Without this, implementers may add the page but miss app routing.

Action: Add route registration requirement for `/auth/callback/mcp-connect` or equivalent provider-safe callback path.

### Finding 3: MCP Provider Schema To UI Dynamic Fields Needs Ownership Boundary

The plan says to adapt discovered input schema where practical. That can lead to inconsistent UI behavior. The plan should place schema-to-field mapping in a shared helper so Media Studio and scoped workflows do not each parse MCP schemas differently.

Action: Add a shared frontend/backend-safe schema projection helper contract.

## Changes Applied

- Added feature flag mapping section.
- Added callback route registration to frontend file list and OAuth flow.
- Added `mcpToolSchemaProjection` ownership boundary for dynamic input fields.

## Follow-up Review Patch

After a later completeness review, the plan was strengthened with:

- explicit runtime env/config contract for MCP OAuth/provider calls;
- section-level test file paths;
- a `mediaGenerationService.ts` decision checklist;
- minimum verification command matrix.
