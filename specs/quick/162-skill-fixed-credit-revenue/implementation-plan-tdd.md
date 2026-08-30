# TDD guidance

1. Add schema/registry tests proving fixed fields default to 2/0 and folder sync preserves admin overrides.
2. Add billing service tests with mocked transaction primitives proving one user debit, recipient grants, same-owner aggregation, missing-owner fail-closed, and idempotent retry.
3. Add refund tests proving an existing auto-refund marker prevents duplicate reversal and a normal refund reverses all settled shares.
4. Add router/UI tests proving admin list/edit payloads carry the two shares and user history keeps one combined run charge with split metadata.
5. Run focused suites first, then changed-file diagnostics, formatting, and diff checks.
