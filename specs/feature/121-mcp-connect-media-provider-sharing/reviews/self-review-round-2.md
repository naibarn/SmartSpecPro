# Self Review Round 2: Plan Completeness Follow-Up

## Review Focus

Re-checked the implementation plan and section files for cross-section drift, implementation ambiguity, provider capability gaps, and release evidence completeness.

## Findings Fixed

1. Cross-section metadata contract was still too implicit.
   - Added canonical shared transport/asset/surface/credit/scope types.
   - Added `MediaTaskTransportMetadata` as the single persisted metadata shape.
   - Updated sections 04, 06, 07, and 08 to consume that shape instead of creating surface-specific variants.

2. Provider capability degradation paths needed explicit implementable behavior.
   - Added required handling for missing generation/status/cancel tools, schema changes, unsupported fields, expired sessions, and provider quota/credit exhaustion.
   - Added tests for safe pre-execution failures and schema-change behavior.

3. Task metadata persistence risk needed a stronger gate.
   - Plan now requires tests proving metadata survives create, poll, list, reload, cancel, and retry when using existing task JSON fields.
   - If those tests fail, implementation must add a migration before MCP routing ships.

4. Release evidence output was under-specified.
   - Added `<planning_dir>/implementation/release-evidence.md` as a required artifact.
   - Added provider mock/sandbox/live-account disclosure, rollout/rollback results, UI evidence links, and metadata evidence requirements.

## Verification

- `check-sections.py`: complete, 9/9 sections.
- `check-ui-contracts.py`: passed, 9 UI-affecting section files checked.
- Placeholder and open-item scan: clean.

## Residual Risk

No blocking spec gaps remain in the plan. Implementation still needs to inspect the actual media task storage behavior before deciding whether existing JSON fields are sufficient for MCP transport metadata.
