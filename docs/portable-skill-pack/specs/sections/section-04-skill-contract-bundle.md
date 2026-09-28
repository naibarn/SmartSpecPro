# Section 04 — Visual Bible Skill Contract V2

## Goal

Make the complete skill bundle agree on a strict, role-aware, reference-aware V2 contract.

## Ownership

- `apps/web/skills/vertical-drama-character-visual-bible/skill.json`
- `skill.md`, generated `SKILL.md`, `prompts/system.prompt.md`
- input/output/UI schemas, references, help, examples, fixtures, tests, and `verify.sh`.

## Contract behavior

Require `contract_version: 2`, `target_character`, character design context,
continuity controls, and output options. Target character is authoritative and includes
IDs, narrative role/tier, age, occupation, emotional facts, visual intent, and prohibited
drift. `generation_request`, `reference_assets`, and `reference_lock` are structured and
strict. Legacy fields normalize only through V1 compatibility.

Output requires non-null DNA, three-direction evidence, scores, all prompt pack types,
instruction resolution, lock report, role readability, similarity risk, and QA checklist.
Semantic verification checks full-body/front-facing/solo/reference-lock/child-safety and
role-aware rules. The skill keeps useful DNA, recall, approved-DNA, archive, anti-clone,
family-resemblance, safety, and attachment behavior while reducing fixed stereotypes.

Use lowercase `skill.md` as the SmartSpec executable source. Generate uppercase `SKILL.md`
as a normalized parity mirror. The system prompt is a short mandatory layer. References
contain role matrices, lock semantics, anti-clone rules, and the required production
fixtures/examples.

## TDD stubs

- Strict input/output schema failures and V1 normalization.
- Required reports/DNA/candidate count and role score semantics.
- Full-body, front-facing, face-only/full-lock, hidden-villain, child, and solo prompt
  semantic assertions.
- Mirror parity and loader artifact-path tests.
- `verify.sh` runs JSON Schema and semantic checks for pass/fail fixtures.

## Completion proof

Run skill `scripts/verify.sh`, fixture suite, and bundle parity checks. Ensure the active
skill body is concise enough that mandatory target data is not buried by generic examples.
