# Section 01 — Profile Contracts

## Objective

Introduce one versioned Series Profile authority for fiction, documentary,
location review, restaurant review, product review, software review, and hybrid
docu-drama. The profile must drive content format, visual grounding, evidence,
disclosure, default source slots, and B-roll policy without exposing conflicting
legacy selectors.

## Target Files

- `apps/web/shared/verticalDramaSeries/seriesProfile.ts`
- `apps/web/shared/verticalDramaSeries/seriesFormat.ts`
- `apps/web/shared/verticalDramaSeries/seriesLookLock.ts`
- `apps/web/shared/verticalDramaSeries/visualGrounding.ts`
- `apps/web/server/services/verticalDramaSeries/`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/shared/verticalDramaSeries/*.test.ts`

## Tests First

1. Add registry tests for twelve profile rows and required fields.
2. Add resolver tests for legacy format/look precedence and conflict warnings.
3. Add tests proving non-fiction keys never serialize into fiction look-lock.
4. Add invalidation tests for profile and visual-version changes.

## Implementation

- Define branded profile IDs, profile version, content engine, strict grounding
  cues, forbidden drift cues, evidence policy, disclosure policy, default slot
  templates, and production rights policy.
- Keep fiction look-lock values as a compatibility projection only. Non-fiction
  profiles use canonical profile visual keys and must not fall back to a generic
  documentary preset.
- Provide pure `resolveSeriesProfile`, `projectLegacySeriesFormat`, and
  `buildProfileChangeInvalidation` functions. Make conflict warnings explicit
  and preserve manual/inherit-source fiction customization.
- Export a bounded profile summary for the client; never expose internal prompt
  policy or provider credentials.

## Acceptance

- Exactly twelve supported profile records are covered by tests.
- Every draft request carries a profile ID/version and strict grounding contract.
- The old format/look fields remain readable for existing series and are never a
  second editable source of truth in the new flow.

## UI/UX Contract

### Target User / JTBD

Choose one understandable profile and know what content and image behavior it controls.

### Surface Inventory

Profile picker, legacy-series warning, and profile summary in the wizard.

### Component Map

ProfilePicker, ProfileSummary, ConflictNotice.

### State Matrix

Loading, ready, incompatible legacy value, changed-with-invalidation, and error.

### Responsive Matrix

One-column cards on narrow screens; grid cards on desktop; keyboard navigation in both.

### Accessibility Acceptance

Use labelled radio semantics, visible focus, text alternatives, and no color-only status.

### Copy Contract

Explain that one profile controls the whole series and that changing it may require re-analysis.

### Browser Evidence Required

Capture profile selection, conflict warning, and changed-profile readiness state.
