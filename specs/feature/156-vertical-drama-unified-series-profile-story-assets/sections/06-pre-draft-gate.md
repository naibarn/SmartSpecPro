# Section 06 — Pre-Draft Gate and Story Integration

Non-fiction, review, and hybrid profiles must pass a server-side source-pack
readiness gate before any story draft entry point can run.

The gate accepts either the staged `draftSessionId` pack during wizard
composition or the attached `seriesId` pack after creation. `startDraftComposition`
is a real draft entry point and is blocked until readiness; `synthesizeGenrePreset`
is permitted only as a non-canonical preview that cannot emit factual or
source-backed story claims.

The gate checks required slots, source identity, managed ownership, asset
analysis, approval, factual status, rights/disclosure status, stale snapshots,
and cost estimate when available. Text drafting requires an explicit rights
status, required disclosure, and a creator-approved or user-authored slot
description; it must label unverified claims instead of presenting them as
facts. Production binding/rendering additionally requires `rightsApproved` or
an explicitly creator-owned equivalent. `unknown` or `permission_pending`
media may remain text-only with a visible warning but can never render.
It returns actionable missing/repair items and preserves incomplete packs for
later continuation.

The story prompt receives a compact approved Source Pack digest, not raw URLs or
unapproved assets. Revisions preserve slot IDs and evidence provenance. The
existing story memory, relationship graph, closure QC, and visual grounding
remain higher-authority contracts.
Legacy `productContext`/`businessContext` inputs may remain as creative hints,
but the adapter must exclude them from factual evidence unless they resolve to
an approved Source Pack claim.

The server gate covers standard draft, deep draft, premium/deep draft, extend,
revise, repair, and storyboard/prompt-generation calls that request source
usage. It composes with, and does not replace, the existing Draft Quality
QC/foundation receipt required by the create wizard. A UI-only check is
insufficient: direct server calls receive a typed readiness error with
actionable slot/asset IDs before paid generation starts. The error code is
`VD_SOURCE_PACK_NOT_READY`; its bounded repair items include an item code,
severity, applicable slot/asset ID, and creator-safe action, plus server-
computed `textDraftAllowed` and `productionRenderAllowed` fields.

For long-form runs, the digest is scoped to the current episode/chunk and is
bounded/cached by source-pack and profile/visual versions. The digest schema
contains only approved slot IDs, bounded observations/claims, verification
status, allowed usage, and relevant media capabilities; it never contains raw
URLs or unapproved vision text. Server byte/token/claim/media limits are hard
caps: compaction must return a typed repair item rather than silently truncate.
Profile, source, approval, or catalog changes invalidate the digest and require
re-readiness; stable slot IDs survive revisions and resumable 120+ episode
generation.

The integration adapter maps approved claims into the existing
`requiredEvidence`/`format_evidence` contract and keeps legacy product-tie-in
consumers compatible without creating a second evidence authority.

Fiction profiles keep the optional path, but supplied references still require
ownership and approval before downstream media use.
