# Chat provider admission regression tests

- Source repository: `smartaihub-platform`
- Integrated source commit: `78018b7a50c05234071e31f6b1361a70440915a3`
- Focused command: `pnpm --filter @smartaihub/saas-core exec vitest run src/chat/providerControlDO.test.ts`
- Result: 1 test file passed; 4 tests passed.

The tests exercise concurrent admission serialization and the three-second minimum spacing, the provider account concurrency limit of 10, the per-user concurrency limit of 3, fail-closed behavior when provider quota is exhausted, and provider cooldown behavior.

The Durable Object is mocked with an in-memory SQLite test double. This verifies the admission policy and its serialized transactions, but does not prove real Workerd Queue redelivery, Durable Object persistence across process restart, managed Cloudflare Queue autoscaling, provider throughput under load, or an authenticated live LLM response. The deployed `aimarkethubs.com` artifact remains source commit `ba37ee16658a36ecb907580e3fb582c10072c9e5`; this test-only commit has not been deployed.
