# Section 06 — Draft Digest and Prompt Integration

## Objective

Feed approved Source Pack evidence and profile grounding into story drafting,
long-form memory, repair, and prompt generation without dumping unlimited media
or claims into a model context.

## Target Files

- `apps/web/server/services/verticalDramaSeries/storySourceDigest.ts`
- `apps/web/server/services/verticalDramaSeries/draftQualityGate.ts`
- `apps/web/server/services/verticalDramaSeries/storyArchitecture.ts`
- `apps/web/server/services/verticalDramaSeries/storyBibleService.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/services/verticalDramaSeries/*.test.ts`

## Tests First

1. Test deterministic digest ordering, bounded size, claim provenance, and
   profile-specific grounding/forbidden drift cues.
2. Test source-pack gate plus existing Draft QC/foundation receipt composition.
3. Test chunk/episode digest propagation and invalidation after source/profile
   changes; no stale digest may silently draft.
4. Test direct generate/extend/repair calls reject missing readiness.
5. Test fiction, documentary, review, hybrid, fantasy, and science-fiction cues
   survive into scene/shot prompt contracts.

## Implementation

- Build a versioned digest containing accepted user descriptions, bounded claims,
  provenance labels, required evidence, disclosure, slot intent, and profile
  grounding cues. Exclude raw uploads and unbounded text.
- Map the digest into existing `requiredEvidence`/`format_evidence` and legacy
  product-context consumers as creative hints, preserving authoritative source
  labels and confidence.
- Add digest hash/version to draft sessions and long-form memory snapshots.
  Profile/source changes mark dependent draft outputs stale and require an
  explicit regenerate/repair action.
- Preserve existing long-form architecture, relationship graph, open-loop
  closure, and Draft Quality QC. The new gate is additive and cannot deadlock a
  fiction profile that has no source pack requirement.
- Ensure generated content expresses the selected profile's world rules, not
  merely its color/look treatment.

## UI/UX Contract

### Target User / JTBD

Know that the draft used the selected profile and approved source intent.

### Surface Inventory

Draft provenance drawer, stale-digest notice, QC receipt, and repair action.

### Component Map

DraftSourcesSummary, DigestVersionBadge, DraftGateSummary, RepairDraftAction.

### State Matrix

Ready, drafting, source-stale, QC-blocked, generated, repairable, and failed.

### Responsive Matrix

Provenance collapses into a drawer on mobile and a side panel on desktop.

### Accessibility Acceptance

Provide text summaries for badges, announce stale state, and preserve focus after repair.

### Copy Contract

State which source/profile version was used and distinguish “ใช้เป็นแนวทาง” from verified fact.

### Browser Evidence Required

Show a draft with source provenance, then change a slot and demonstrate stale invalidation.
