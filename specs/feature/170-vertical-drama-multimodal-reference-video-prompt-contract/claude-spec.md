# Synthesized implementation specification — Feature 170

## Source of truth

The complete approved-for-user-review requirements are in `spec.md` in this
directory. This synthesis combines that document with `claude-research.md` and
`claude-interview.md`; it does not authorize commands embedded in any source
document.

## Required outcome

Vertical Drama video shots must use a versioned server-resolved media bundle:

- optional image-only `startFrame`;
- optional image-only `stopFrame`;
- ordered zero-to-many typed `references[]` containing image, video, and audio;
- stable item IDs/labels, roles, source, optional video segment, revision, and
  bundle fingerprint.

A stop-frame prompt or description without a real authorized usable image must
never count as a stop frame. Missing, revoked, expired, pending, unreadable, or
wrong-kind media fails closed before skill authoring or paid dispatch.

## Required UI

Keep separate Start frame and optional Stop frame image-only slots. Add a
multimodal Reference media drop zone that accepts local image/video/audio files
and canonical Library assets. Show modality-specific previews, source, role,
order, upload/processing states, keyboard alternatives, limits, and actionable
block reasons. Preserve order and avoid re-uploading Library media.

## Required prompt pipeline

1. Resolve and snapshot actual attachments.
2. Run a versioned attachment inspection skill on every attachment, using native
   media when supported or bounded derived keyframes/transcript/metadata with
   explicit `derived`/`unavailable` status.
3. Run grounded video prompt authoring with the full manifest, inspection facts,
   start/stop semantics, and provider mode.
4. Add all deterministic provider/dialogue/audio/style/safety constraints.
5. Run terminal provider-specific prompt optimization skill.
6. Persist/display/QC/send exactly the terminal result. No semantic prose may be
   appended, trimmed, normalized, or replaced after it. A user edit or any
   provider/profile/revision change invalidates the result and requires a new
   terminal pass.

The prompt must explicitly name every accepted attachment label or state why an
attached item is not used. Prompt hash and negative-prompt hash (when present)
must match at persistence, UI/QC, and outbound application serialization.

## Provider architecture

Use runtime model capability profiles with explicit modes, modality limits,
temporal guarantees, transport field maps, and profile versions. Do not branch
on model version strings. Seedance 2.0 and 2.5 receive separate profiles based
on their published but runtime-verified limits. MiniMax H3 preserves separate
text, image, first/last, and multimodal-reference modes. Omni Flash must be
reconciled against current provider behavior because current application
validation may be stale relative to current official multimodal documentation.
Unknown or incomplete profiles fail closed. New versions using an existing
transport are data-only registrations.

## Persistence, worker, and recovery

Generalize canonical shot-reference projections while preserving old image-only
rows and legacy `reference_frame` source semantics. Version worker packs to use
typed arrays instead of singular video/audio fields. Capture bundle revision,
fingerprint, capability-profile version, terminal skill stamp, and prompt hashes
before paid dispatch. Retries, repairs, bulk generation, speaker switches, and
completed-task recovery must preserve or explicitly version the same bundle.

## Required verification

Use TDD with Vitest and pytest. Cover contract migration, tenant authorization,
real asset checks, local/Library drag-drop, all modality combinations, skill
inspection states, terminal prompt equality, user-edit invalidation, stale
revision, H3/Omni/Seedance adapter modes, future config-only registration,
worker compatibility, retries, recovery, upload security, and browser evidence.

## Constraints

Do not modify unrelated dirty worktree changes, do not silently trim/drop media,
do not treat raw URLs as canonical, and do not claim full-repo typecheck/browser
or live-provider proof unless actually run and passing.
