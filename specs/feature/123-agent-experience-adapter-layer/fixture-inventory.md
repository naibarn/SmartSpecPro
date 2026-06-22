# Agent Experience Fixture Inventory

All fixtures are synthetic and redaction-reviewed for Phase 0. Production-derived fixtures require owner, source date, redaction reviewer, and removal criteria before commit.

| Fixture | Source | Scenario | Expected events | Expected dropped reasons | Redaction |
|---|---|---|---|---|---|
| `agency.happy-path.2026-06-22-v1.fixture.json` | agency | happy-path | session/message/tool/workflow | none | synthetic reviewed |
| `agency.legacy-path.2026-06-22-v1.fixture.json` | agency | legacy-path | message/tool | none | synthetic reviewed |
| `agency.approval-path.2026-06-22-v1.fixture.json` | agency | approval-path | approval.request | none | synthetic reviewed |
| `agency.malformed-path.2026-06-22-v1.fixture.json` | agency | malformed-path | none | unsupported_event, malformed | synthetic reviewed |
| `team.run-path.2026-06-22-v1.fixture.json` | team | run-path | workflow/message/tool | none | synthetic reviewed |
| `team.private-internal-visibility.2026-06-22-v1.fixture.json` | team | private-internal-visibility | none | private_internal | synthetic reviewed |
| `artifact.pointer-path.2026-06-22-v1.fixture.json` | agency | artifact-pointer-path | artifact.created | none | synthetic reviewed |
| `approval.rejected-to-denied.2026-06-22-v1.fixture.json` | approval | rejected-to-denied | approval.decision | none | synthetic reviewed |
| `rollback.flags-off-legacy-rendering.2026-06-22-v1.fixture.json` | fixture | flags-off-legacy-rendering | none | none | synthetic reviewed |
