# Synthesized Implementation Specification

Implement the approved additive V2 character identity and Skill-first Visual Bible flow.
Persist a canonical narrative role and detailed role tier separately from occupation and
legacy role text. AI assigns roles at preset/Story Bible creation time; users can edit and
confirm them in the character UI. The canonical value must survive wizard, seed,
reconciliation, manual, variant, twin, DTO, and Visual Bible paths.

Upgrade the Visual Bible input contract with `contract_version: 2`, an authoritative
`target_character`, structured `generation_request`, `reference_assets`, `reference_lock`,
approved immutable/mutable DNA, strict schemas, instruction-resolution reports, role
readability, similarity risk, and QA metadata. Migrate legacy fields through a deterministic
normalizer. Require role-aware prompts and semantic validation.

The runtime must load the short system prompt plus the canonical skill and selected
references. The skill must author the complete natural provider prompt. Remove all external
creative prompt append/marker logic. On semantic failure, retry the same skill with compact
violation codes at most twice; do not concatenate corrective prose in server code.

Retain safety, identity locks, DNA, anti-clone, archive comparison, and provider safety.
Reduce role stereotypes and add role-specific visual intent, reference-lock precedence,
three-direction selection, scores, role-aware fixtures, and post-generation visual QA.
Keep V1 consumers readable, make backfill idempotent and reviewable, and verify focused
server, UI, contract, migration, skill, and end-to-end tests without touching unrelated
dirty-worktree changes.
