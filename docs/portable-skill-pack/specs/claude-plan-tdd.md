# TDD Plan: Character Narrative Role and Skill-First Visual Bible V2

Tests below are written before the corresponding implementation wave. They describe
behavioral stubs, not full implementations. Test names should follow existing Vitest and
skill-fixture conventions.

## Wave 0 — Baseline and ownership guard

- Capture the baseline result of existing character Visual Bible, custom-instruction,
  prompt-QC, and character identity-map suites.
- Add a regression search/assertion that the scoped final diff contains no new
  `VD_CHARACTER_CUSTOM_REQUIREMENTS` references after cleanup.

## Wave 1 — Shared canonical role contract

- Parse every canonical `narrativeRole` and `roleTier` enum value.
- Map each canonical value to the expected Thai and English label.
- Reject unknown role/tier values and invalid child/adult combinations.
- Verify legacy aliases are normalization-only and never mutate source text.
- Verify DTO/profile serialization preserves nullable V2 fields and legacy `role`.
- Verify role grouping/lead detection uses canonical tier before occupation keywords.
- Verify migration/schema metadata exposes the additive fields and expected nullability.

## Wave 2 — Creation, synthesis, and reconciliation

- Preset output accepts structured role/tier/occupation and rejects occupation-only role
  when production mode requires canonical role.
- Wizard preserves a structured character object through draft state and submit payload.
- Legacy text draft still parses without losing the old role string.
- Series seeding persists canonical fields and provenance for each character.
- Story Bible reconciliation updates an unconfirmed role but preserves a user-confirmed
  role.
- Ambiguous refinement marks review-required and does not promote a lead.
- Manual, update, variant, twin, and AI variant routes round-trip canonical roles.
- A CEO heroine remains `lead_female` after every route and retains `CEO` as occupation.

## Wave 3 — Backfill and legacy normalization

- Backfill prefers structured Bible/DNA evidence over free-text occupation.
- Backfill is idempotent across two runs and tenant-scoped.
- Ambiguous rows retain legacy role text and receive review-required state.
- V1 Visual Bible input normalizes legacy reference and custom fields into V2.
- Normalizer does not mutate caller input and emits stable contract version 2.
- Missing target role fails production validation before any provider call.

## Wave 4 — Visual Bible Skill bundle V2

- Empty input fails the strict V2 input schema.
- Missing target character, role, role tier, or required context fails with exact paths.
- Unknown fields fail strict objects; explicit extensions remain allowed.
- Reference lock enabled without source asset fails; valid face-only and full-appearance
  locks pass.
- Output without non-null `character_design_dna`, reports, scores, or prompt pack fails.
- Candidate direction count must equal three.
- Lead threshold/status mismatch fails; incomplete archive evidence cannot claim pass.
- Full-body output contains head-to-toe/no-cropped-feet semantics.
- Front-facing output contains both-eyes-visible/no-profile semantics.
- Face-only lock permits hair/wardrobe changes; full lock reports the conflict.
- Hidden villain output does not contain overt villain coding.
- Child output rejects adult glamour/body-emphasis terms.
- Solo output contains an explicit one-person constraint.
- Skill mirror parity check detects drift between lowercase and uppercase artifacts.
- `verify.sh` validates both schema and semantic fixtures, not only JSON parsing.

## Wave 5 — Skill runtime and prompt ownership

- Runtime loads system prompt, canonical skill core, and selected references in order.
- Runtime fails clearly if the canonical skill or system prompt is missing.
- Canonical role tier is passed unchanged to the skill target character.
- Legacy role fallback is marked provisional and cannot silently satisfy lead thresholds.
- Server-owned comparison evidence is normalized without mutating creative fields.
- Semantic violation causes a bounded same-skill retry with violation codes.
- Retry count is capped and final failure is explicit.
- Preview prompt equals the exact provider prompt for direct and approved branches.
- Final prompt contains no marker block, external suffix, or `buildCharacterRenderPrompt`
  output.
- Empty custom instruction preserves valid skill output without adding text.
- Model-family fallback is rejected before provider charge when it cannot satisfy gates.

## Wave 6 — Character UI and warnings

- Character card renders canonical Thai narrative label separately from occupation.
- Role selector renders grouped labels and persists the selected enum.
- AI-assigned, user-confirmed, and review-required states are visible and localized.
- Loading disables mutation controls; success preserves both chips; error preserves old
  data and exposes retry.
- Lock conflict, child styling, hidden-villain cue, and missing-role warnings render with
  actionable copy.
- Keyboard traversal reaches selector, warning, save, cancel, and prompt actions.
- Focus ring and accessible names exist for every icon-only control.
- Role/occupation layout has no overflow at 390x844, 768x1024, and 1440x900.
- Prompt preview and primary action remain reachable on tablet.

## Wave 7 — Visual QA and observability

- QA reports identity, role, age, framing, people count, wardrobe, hair, continuity, and
  production readiness scores.
- Pass persists safe provenance; revise returns a skill-owned revision request; reject
  preserves approved DNA.
- Audit event contains contract/version/model/retry/outcome fields but no full prompt,
  private story text, or signed asset URL.

## Wave 8 — Integration, gates, and cleanup

- Focused suites pass after every wave and stale gates are rerun after later changes.
- Skill verification, TypeScript check, migration check, and route-level browser evidence
  are recorded with pass/skip status.
- Scoped diff contains only intended files; unrelated dirty changes remain untouched.
