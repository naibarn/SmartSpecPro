<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/cloudflare-runtime test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-inventory-and-evidence
section-02-hard-cutover-startup
section-03-canonical-worker-handler
section-04-scheduler-provider-admission
section-05-compatibility-drain
section-06-migration-reconciliation
section-07-python-parity-and-failure-ci
section-08-local-handoff-and-gap-review
END_MANIFEST -->

# Feature 192 Implementation Sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 inventory and evidence | - | 02, 03, 04, 05, 06, 07, 08 | No |
| 02 hard-cutover startup | 01 | 03, 04, 05, 07 | No |
| 03 canonical Worker handler | 01, 02 | 04, 05, 07 | No |
| 04 scheduler/provider admission | 03 | 05, 07 | No |
| 05 compatibility drain | 02, 03, 04 | 06, 07 | No |
| 06 migration reconciliation | 01, 05 | 07, 08 | Yes after 05 |
| 07 Python parity and failure CI | 02, 03, 04, 05, 06 | 08 | No |
| 08 local handoff and gap review | 01-07 | - | No |

## Execution order

1. Inventory and evidence.
2. Hard-cutover startup safety.
3. Canonical Worker handler and local publication path.
4. Scheduler and provider admission.
5. Compatibility drain closure.
6. Migration/schema reconciliation.
7. Python parity, failure injection, and focused CI.
8. Local evidence handoff and ten-round spec-to-code review.

## Section summaries

### section-01-inventory-and-evidence

Create the exact local inventory, ownership classifications, Google allowlist,
and evidence helpers/manifests without claiming external proof.

### section-02-hard-cutover-startup

Guard retired startup paths and classify timers so hard cutover cannot execute
untracked business work or select a Google runtime.

### section-03-canonical-worker-handler

Implement the injected local canonical Worker handler/repository path and
independent Cloudflare capability contract tests.

### section-04-scheduler-provider-admission

Move business scheduling to canonical intent and verify provider queue
acceptance, admission, waiting-external, and durable polling behavior.

### section-05-compatibility-drain

Migrate or quarantine remaining legacy calls/readers while preserving canonical
IDs, status projection, late-delivery safety, and historical references.

### section-06-migration-reconciliation

Implement the read-only Drizzle journal/schema reconciliation and local schema
compatibility checks.

### section-07-python-parity-and-failure-ci

Repair the focused test module boundary, prove Python envelope/worker parity,
add failure injection, and create reproducible focused verification.

### section-08-local-handoff-and-gap-review

Emit the local handoff/dry-run evidence and compare implementation against the
spec in at least ten documented review rounds, applying concrete fixes.
