<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-and-installation
section-02-enrollment-and-proof
section-03-canonical-runner-control
section-04-live-ux-deploy-and-uat
END_MANIFEST -->

# R03.7 Sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contract-and-installation | - | 02, 03 | No |
| section-02-enrollment-and-proof | 01 | 03 | No |
| section-03-canonical-runner-control | 02 | 04 | No |
| section-04-live-ux-deploy-and-uat | 03 | - | No |

## Execution Order
1. Verify current binaries and extract Rust wire contracts.
2. Implement isolated pairing, device proof, credentials and bounded DB authority.
3. Implement canonical capability/heartbeat/claim/session/event/receipt control.
4. Enroll, run one real Codex Job, verify Mission/Task navigation, deploy and hand off UAT evidence.

## Section Summaries
- `section-01-contract-and-installation`: R37-01, R37-02 foundation; inspect-only installed tool evidence and exact client contract fixtures; no runner source changes.
- `section-02-enrollment-and-proof`: R37-02, R37-03; Hono pairing, proof, credential lifecycle and role-limited storage functions if justified by inspected schema.
- `section-03-canonical-runner-control`: R37-02, R37-04, R37-06; capability, heartbeat, canonical Job/Attempt/session/event/receipt and replay/fence semantics.
- `section-04-live-ux-deploy-and-uat`: R37-04, R37-05, R37-06, R37-07; real job, exact Mission/Task identity, DEV deployment and owner UAT evidence.
