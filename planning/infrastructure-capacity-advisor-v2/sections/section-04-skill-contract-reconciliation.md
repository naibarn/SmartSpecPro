# Section 04 — Skill Contract and LLM Reconciliation

## Objective

Make the product skill useful for explanation while preventing it from becoming
an untrusted source of operational facts.

## Scope and ownership

Update `apps/web/skills/infrastructure-capacity-advisor/skill.md`, input/output
schemas, examples/fixtures, and verification. Require policy version,
deterministic decision, evidence keys, coverage/truncation metadata,
workload/storage/forecast groups, controlled severity/action/horizon values, and
recommendation evidence references.

Keep the prompt sanitized and bounded. If truncation occurs, include a marker and
affected groups. At the service boundary validate every model claim against the
authoritative snapshot/policy. Matching claims pass; mismatched current value,
threshold, severity, trend, or horizon is corrected/downgraded/omitted by a
deterministic normalization rule. Render only the reconciled DTO. Malformed or
unavailable output falls back to deterministic status with an explicit LLM
unavailable note.

## TDD first

Test schema rejection, sanitization, truncation markers, matching evidence,
mismatch correction, malformed output, unsupported action, and skill fixture
parity. Include tests proving no secret/private/raw-log field reaches the skill.

## Acceptance

Every visible recommendation cites authoritative evidence keys. The LLM cannot
claim healthy when server data is stale/unknown/critical and cannot invent a
forecast horizon. Skill verification passes using repository-local fixtures.

## Dependencies

Sections 01 and 03; collector fields from section 02. Blocks the run worker/UI
result contract.

## UI/UX Contract

N/A for skill contracts; the reconciled DTO is rendered under section 06.

### Target User / JTBD

N/A — no browser surface changes.

### Surface Inventory

N/A — no browser surface changes.

### Component Map

N/A — no browser components.

### State Matrix

N/A — no browser states.

### Responsive Matrix

N/A — no layout changes.

### Accessibility Acceptance

N/A — no user-facing markup.

### Copy Contract

N/A — no user-facing copy.

### Browser Evidence Required

N/A — browser proof is owned by section 06 and 08.
