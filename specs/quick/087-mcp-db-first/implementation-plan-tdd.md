# TDD Plan

1. Extend `mediaTransportResolver.test.ts` mocks to include
   `listMcpConnections`.
2. Add failing tests for:
   - stale caller ID plus one fresh personal connection;
   - stale caller ID plus one fresh shared connection;
   - duplicate eligible group shares for one physical connection;
   - multiple physical connections with valid and invalid caller selections.
3. Update the resolver minimally until those tests pass.
4. Change `mcpMediaAdapter.test.ts` expectations so bare/quota `403` is not an
   auth error while 401 and explicit invalid/expired token remain auth errors.
5. Update the classifier minimally until tests pass.
6. Run both targeted test files, then the relevant router regression test and
   web type check.

Mocks must return safe connection objects with `connectionScope`,
`sharedGroupId`, `allowedAssetTypes`, defaults, provider key, and status.
