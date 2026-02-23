# Interview Notes

Date: 2026-02-22
Mode: `smart_auto`

## Q1. Canvas object scope for MVP
**Question:** Which object types must be fully editable in Phase 1 vs later?

**Answer:**
- Phase 1 required: `text`, `image`, `shape`, `line`
- Later: `icon`, `group`, `video`
- Clarification:
  - `icon` can be handled initially via image/SVG upload path
  - `group` does not need persistence in initial scope
  - `video` is deferred

## Q2. Schema strategy
**Question:** Should rollout use dual-read migration compatibility or hard switch to v2?

**Answer:**
- Selected: `hard_switch_v2`
- Clarification:
  - No legacy data expected for this feature context
  - Read/write should be v2-only (`presentation_canvas_v2`)
  - v1 can be removed or disabled via feature flag

## Q3. Mobile interaction priority
**Question:** Should mobile include full transform editing initially or safe-core editing?

**Answer:**
- Selected: `mobile_safe_core`
- Clarification:
  - Mobile scope: select/move/basic text + zoom/pan
  - Resize/rotate/advanced transforms are desktop-first

## Q4. Export compatibility rule
**Question:** How to handle objects/effects renderer cannot faithfully export?

**Answer:**
- Selected: `degrade_and_export_with_warning`
- Clarification:
  - Use deterministic fallback (e.g., rasterize/placeholder)
  - Surface warnings summarized per slide

## Q5. Template source in initial phases
**Question:** Internal templates only vs external marketplace inclusion.

**Answer:**
- Selected: `internal_only`

## Q6. Collaboration scope
**Question:** Include comments/realtime now vs defer.

**Answer:**
- Selected: `comments_phase_next`
- Clarification:
  - No collaboration implementation in this feature
  - Leave extension hooks for next phase

## Q7. Brand/Typography scope
**Question:** Global-only vs tenant brand pack support.

**Answer:**
- Selected: `global_only` for this feature
- Selected: `tenant_brand_pack_later` for follow-up phase

## Q8. PDF export handling
**Question:** How to handle PDF export in current scope.

**Answer:**
- Selected: `out_of_scope_now`

## Q9. Hard-switch safety mode
**Question:** Feature-flagged hard switch vs immediate global switch.

**Answer:**
- Selected: `with_feature_flag`

## Consolidated Decision Summary
- MVP object editing: `text`, `image`, `shape`, `line`
- Schema: hard switch to `presentation_canvas_v2` behind feature flag
- Mobile first release: safe-core editing only
- Export incompatibility policy: deterministic degrade + warning
- Templates: internal-only
- Collaboration: deferred to next phase
- Brand pack: global fonts now, tenant brand packs later
- PDF export: out of scope
