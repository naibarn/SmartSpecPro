# Interview Transcript: Feature 121 MCP Connect Media Provider Sharing

## Interview Outcome

No additional user questions were required during deep planning.

The source spec already resolves the business decisions that would otherwise require stakeholder input:

- v1 scope is limited to Media Studio, Auto Storyboard Review, Marketplace Capture, and Storyboard Review;
- `gateway_api` remains the default and MCP is additive;
- tenant admins can force-disable MCP Connect/group sharing;
- shared video generation requires owner approval per job in v1;
- group sharing is explicit, revocable, and account-owner-credit based;
- non-v1 surfaces remain on `gateway_api`;
- public REST API and public SmartSpecPro MCP tool transport selection are future scope.

## Auto-Decisions

### AD1: Use Existing Web Stack

Use the existing `apps/web` TypeScript, React, tRPC, Drizzle, and Vitest/Playwright conventions. Do not add a new backend service unless provider MCP runtime requirements later force it.

### AD2: Keep MCP Transport Inside Async Media Boundary

Implement MCP transport through existing async media procedures and shared services. Do not create a parallel MCP-only generation UI or queue.

### AD3: Use Settings Integration Pattern

Model the Settings/Profile MCP Connect UX on existing Google Drive/OneDrive integration panels: provider cards, popup OAuth callback, connected/expired states, disconnect dialog, and tabs for richer details.

### AD4: Treat External MCP Data as Untrusted

Treat provider tool schemas, tool descriptions, status payloads, and result summaries as untrusted external data. Persist only redacted summaries and safe labels.

### AD5: Keep Group Sharing Conservative

For v1, keep shared video jobs owner-approved per job, enforce atomic usage/concurrency reservations, and keep group sharing behind dedicated feature flags.
