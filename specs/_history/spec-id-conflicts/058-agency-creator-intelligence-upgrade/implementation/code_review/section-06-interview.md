# Section 06 Code Review Interview

## Auto-fixed
1. **HIGH-1: Sensitive field exclusion guard** — Added SECURITY comment above agentDefinitions builder warning to never spread full agent row (mcpServers, mcpServerTokensEncrypted).
2. **MEDIUM-4: agencyAgentTools tenant scoping comment** — Added comment documenting that isolation is guaranteed by scoped agentIds.
3. **LOW-3: Missing test assertions** — Added `not.toHaveProperty("id")`, `not.toHaveProperty("agencyId")`, `nodeConfig` and `modelRequirements` assertions.

## Let go
- HIGH-2: agencyAgents has no tenantId column, so can't add WHERE clause. Outer agency lookup already ensures tenant isolation. Defence-in-depth gap is theoretical.
- MEDIUM-1: Migration coupled with social tables — this is drizzle-kit batch behavior, not something we can easily control.
- MEDIUM-3: Admin test insert assertions — not critical, test already verifies templateId is returned.
- LOW-1/LOW-2: Cosmetic issues, not worth the churn.

## Test Results
22 tests pass (19 existing + 3 new saveAsTemplate tests)
