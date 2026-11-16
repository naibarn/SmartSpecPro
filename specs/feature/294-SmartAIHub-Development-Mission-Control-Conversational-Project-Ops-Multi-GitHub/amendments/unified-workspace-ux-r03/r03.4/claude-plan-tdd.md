# R03.4 Focused Verification Plan

1. DB contract: verify the intended functions/columns exist, function ownership and EXECUTE ACL are limited, and input scopes reject mismatched actor, tenant, workspace, conversation, runner, mission, job, session, and attempt.
2. Correlation: a real fixture schema with two workspaces and two Runner instances proves only explicit workspace-bound conversations and canonical session→Job→Attempt relationships are returned; historical jobs with null identity remain null.
3. Core APIs: anonymous requests return 401; authorized user gets only workspace rows; cross-workspace IDs return 404/empty; malformed and oversized cursors are rejected; event order and cursor are stable; no API calls dispatch or mutate.
4. UI: LIVE route uses only LIVE API responses; empty/offline/stale/unavailable labels are accurate; tabs restore canonical selected IDs; exact Task Control link preserves Mission/Harness/Job/Run/Attempt and refresh context; DEMO fixture route remains isolated.
5. Runtime: verify `modular-debian-dev` release target, source SHA, Core/Shell/Chat health, LIVE API auth boundary, and actual Runner heartbeat/catalog independently. Mark owner browser UAT pending unless it was performed with an authorized MFA session.
