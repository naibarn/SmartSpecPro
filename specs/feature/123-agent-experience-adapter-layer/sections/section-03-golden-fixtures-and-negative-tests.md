# Section 03: Golden Fixtures And Negative Tests

## Objective

Create deterministic fixture coverage for adapter behavior, negative cases, rollback expectations, data classification, and fixture inventory.

## Dependencies

- section-01-shared-contracts-and-flags
- section-02-agency-and-team-adapters

## Scope

- Add required fixture JSON files.
- Add fixture metadata validation.
- Add fixture inventory documentation.
- Add tests for fixture naming, schema versioning, expected event types, expected dropped reasons, synthetic/redaction status, and secret/signed URL rejection.

## Files To Add

- `packages/agent-experience/src/testing/fixtures/*.fixture.json`
- `packages/agent-experience/src/__tests__/fixtures.test.ts`
- `specs/feature/123-agent-experience-adapter-layer/fixture-inventory.md`

## Required Fixtures

- `agency.happy-path.2026-06-22-v1.fixture.json`
- `agency.legacy-path.2026-06-22-v1.fixture.json`
- `agency.approval-path.2026-06-22-v1.fixture.json`
- `agency.malformed-path.2026-06-22-v1.fixture.json`
- `team.run-path.2026-06-22-v1.fixture.json`
- `team.private-internal-visibility.2026-06-22-v1.fixture.json`
- `artifact.pointer-path.2026-06-22-v1.fixture.json`
- `approval.rejected-to-denied.2026-06-22-v1.fixture.json`
- `rollback.flags-off-legacy-rendering.2026-06-22-v1.fixture.json`

## Fixture Metadata

Every fixture must include:

- `fixtureId`
- `schemaVersion`
- `adapterVersion` when relevant
- `surface`
- `source`
- `scenario`
- `synthetic`
- `redactionReviewed`
- `expectedEventTypes`
- `expectedDroppedReasons` when relevant
- `relatedRequirement`

Privacy and retention metadata must include:

- source kind: synthetic or production-derived;
- redaction reviewer or owner;
- source date when production-derived;
- removal criteria when production-derived;
- confirmation that raw prompts, user content, OAuth/API tokens, signed URLs, privileged storage paths, and tenant-identifiable samples are absent.

## UI/UX Contract

### Target User / JTBD

- Developers and reviewers need deterministic fixtures that prove preview UI states before any live stream integration.

### Surface Inventory

- Fixture files and test harness only.
- No customer-visible screen is added in this section.

### Component Map

- No UI components are created here.
- Fixtures must cover future preview components: timeline, artifact pane, approval card, debug inspector, and safe error states.

### State Matrix

- empty fixture;
- all-valid fixture;
- mixed valid and dropped fixture;
- malformed fixture;
- missing identity;
- unsupported schema version;
- redacted debug payload;
- unknown event kind.

### Responsive Matrix

- Fixture metadata should identify which UI state each fixture supports.
- Responsive rendering is validated in Section 04.

### Accessibility Acceptance

- Fixture-driven states must include text alternatives for errors, empty states, and action labels.
- Fixtures must not require inaccessible hover-only behavior.

### Copy Contract

- Fixture names and user-visible sample copy use `Agent Experience`.
- Avoid `Persona` in fixture ids, labels, and sample text.

### Browser Evidence Required

- Not required for fixture-only tests.
- Section 04 consumes these fixtures for browser evidence.

## Tests First

- Test file naming convention.
- Test unique fixture IDs.
- Test required metadata exists.
- Test fixture inventory lists every fixture file.
- Test expected canonical event types match adapter output.
- Test expected dropped reasons match adapter output.
- Test fixture lint rejects API keys, OAuth tokens, signed URLs, storage paths, and tenant-identifiable samples.
- Test schema version bump requires fixture update or compatibility fixture.
- Test or checklist production-derived fixtures cannot merge without owner, redaction review, and removal criteria.

## Acceptance Criteria

- Fixture inventory exists.
- All required fixtures are present and tested.
- No fixture contains raw customer data, token-like values, signed URLs, or privileged storage paths.
- Fixture inventory records synthetic/production-derived status, redaction review, and retention/removal notes.
- Sections 01-03 can be implemented without enabling any live preview.
