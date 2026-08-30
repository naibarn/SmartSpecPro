# Self-review round 1

## Findings

1. Existing queue implementations must be reused rather than replaced. The plan now names each existing queue family and limits the new runtime to typed interactive jobs.
2. Billing must not be inferred from job success. The plan explicitly requires settlement in the worker and deterministic call keys.
3. Polling timeout must not become an LLM failure. This is stated in the spec, plan and client section.
4. Source analysis already has a durable row, so the plan explicitly reuses it instead of adding a duplicate table.
5. Full-story dialogue omission is covered by the completion/repair section and tests.

## Scorecard

- Structural integrity: PASS
- Completeness against approved design: PASS
- Implementability: PASS with file-level inspection required during implementation
- Internal consistency: PASS
- Edge cases and failure modes: PASS

No unresolved design blocker remains. The implementation must still verify exact existing function signatures before editing.
