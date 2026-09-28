# TDD Plan — Feature 156

Tests are written before implementation in each section and use existing Vitest,
React Testing Library/jsdom, Drizzle schema tests, and Playwright conventions.

## Section 01 — Profile contracts

- Registry contains exactly twelve profiles with required fields.
- Every profile resolves to a strict visual contract and forbidden-drift cues.
- Legacy format/look precedence is deterministic, read-only, and warns on
  conflicts.
- Non-fiction profile keys never serialize into the fiction look-lock enum.
- Profile/visual-version changes invalidate dependent source/digest inputs.

## Section 02 — Persistence

- Schema tests verify tables, nullable staged/series ownership, foreign keys,
  indexes, version fields, readiness states, and soft deletion.
- Repository tests verify one active staged pack, optimistic conflict,
  attach-once, idempotent retry, tenant crossover rejection, and rollback-safe
  failed attachment.
- Migration tests verify expand/read compatibility, legacy projection, rollback,
  and no destructive deletion.

## Section 03 — API and gate

- Auth/tenant ownership is required for every read/write.
- Session create/claim rejects legacy unbound IDs and cross-owner claims.
- Pack/slot mutations are idempotent and version-conflict safe.
- `VD_SOURCE_PACK_NOT_READY` has bounded repair items and readiness booleans.
- Existing `verticalDramaSeries.create` atomically binds once and returns the
  same series on retry; no second endpoint is introduced.
- Direct draft/generation/repair calls reject missing or stale source readiness.

## Section 04 — Ingestion and vision

- Product/place snapshots preserve selected media only and mark changes stale.
- Upload content sniffing, size/duration bounds, quarantine, SSRF rejection,
  ownership, and rights flags are covered.
- Vision output is provenance-tagged, schema validated, retryable, and cannot
  promote unverified claims without explicit review.
- Completed analysis retries do not duplicate charges or links.

## Section 05 — Wizard and source hub

- Six step IDs/count remain stable; profile picker removes conflicting editable
  selectors.
- Profile-specific slots, custom slots, image/video upload, description
  generation, approval, retry, and two readiness states render correctly.
- Non-fiction sequence prevents composition before source readiness while
  preserving the existing Draft QC gate.
- Loading/empty/error/stale/blocked/ready/rights-warning states are accessible,
  localized, responsive, and actionable.

## Section 06 — Digest and prompt integration

- Digest contains only approved bounded claims, slot IDs, status, and allowed
  usage; raw URLs/unapproved vision text never pass through.
- Profile/source/approval changes invalidate cached digest versions.
- Existing evidence adapter receives the expected claim shape.
- Creative context cannot become factual evidence without Source Pack approval.
- Standard, deep, premium, extend, revise, repair, storyboard, and media prompt
  entry points share the same server gate.

## Section 07 — B-roll

- Binding requires creator approval, managed ownership, production rights,
  valid trim/aspect/safe-zone/audio policy, and current source version.
- Invalid/stale/missing media fails closed with a repair item.
- Usage remains advisory until approval and does not rewrite story canon or
  inject into every episode.

## Section 08 — Migration and rollout

- Legacy product tie-in projection is reviewable and never silently verified.
- Feature flags can disable new writes/gates without deleting legacy rows.
- Abandoned session archive/restore and orphan reconciliation are auditable.
- Metrics/events redact signed URLs, private coordinates, and raw vision text.

## Section 09 — Convergence

- Full focused suite, typecheck, and formatting run after all sections.
- At least five clean review loops are recorded after the final fix.
- Any browser/provider/deployment proof not run is explicitly separated from
  local proof; no skipped implementation section is marked complete.
