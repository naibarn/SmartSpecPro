# Section 07 — B-roll and Production Binding

## Objective

Allow approved source images and video shots to become B-roll references while
enforcing managed-media durability, rights, disclosure, timing, safe zones, and
profile consistency at production time.

## Target Files

- `apps/web/server/services/verticalDramaSeries/brollBindingService.ts`
- `apps/web/server/services/verticalDramaSeries/productionReadiness.ts`
- `apps/web/server/services/verticalDramaSeries/storyboardService.ts`
- `apps/web/client/src/components/verticalDramaSeries/`
- `apps/web/server/services/verticalDramaSeries/*.test.ts`

## Tests First

1. Test approved image/video slot binding and removal without orphaned media.
2. Test provider URL expiry versus managed storage availability.
3. Test rights/disclosure gates, trim/duration, safe-zone, aspect ratio, and
   audio collision rules.
4. Test that production prompts retain profile grounding and B-roll intent.
5. Test unavailable media produces an actionable repair, never silent regeneration
   or duplicate credit charge.

## Implementation

- Bind slots by stable source asset IDs and snapshot the slot description/version
  into storyboard/prompt inputs. Keep media provenance and user intent separate.
- Use managed URLs/storage checks at render time. Treat missing managed objects as
  unavailable even when the provider URL still exists.
- Require `production_ready` for render/export, with explicit commercial/privacy
  disclosure and rights decisions. Keep text-only draft behavior per the matrix.
- Validate shot trim, duration, vertical framing, safe-zone, subtitles, and audio
  before enqueueing production jobs; return repairable blocking items.
- Preserve image/video B-roll ordering and allow user-defined slot priority.

## UI/UX Contract

### Target User / JTBD

Choose which source media should appear and understand production restrictions.

### Surface Inventory

B-roll chooser, timeline preview, rights/disclosure badges, and render gate.

### Component Map

BrollPicker, ShotPreview, RightsGate, ProductionReadinessPanel.

### State Matrix

Unbound, bound, unavailable, rights-pending, trim-invalid, ready, and blocked.

### Responsive Matrix

Use a vertical shot list on mobile and timeline/grid layout on desktop.

### Accessibility Acceptance

Keyboard reorder, captions/alt text, clear media labels, and readable gate reasons.

### Copy Contract

Explain that attaching a source to a draft does not grant production rights.

### Browser Evidence Required

Show binding, unavailable-media repair, and production-ready transition.
