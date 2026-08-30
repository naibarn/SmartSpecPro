# Section 02 — Transport Integration and History Projection

## Ownership

Own `apps/web/server/services/mediaTaskPollingService.ts`, `apps/web/server/routers/media.ts`, source adapter projection helpers, and focused server tests.

## Work

Pass completed ordinary, deferred, MCP, Hermes, and other merged task projections through the shared artifact service. Preserve existing Vertical Drama and marketplace adapters. Make `listTasks` read artifact rows and return normalized fields without performing provider downloads. Enforce tenant/user ownership for artifact lookup and add a retry path for pending storage.

## TDD

Test every transport, list performance boundary, source identity, backward-compatible `resultUrl`, and cross-tenant/user denial.

## Acceptance

Every completed task source can produce R2-first artifact metadata; list requests do not trigger downloads; legacy task consumers still receive a compatible result URL.
