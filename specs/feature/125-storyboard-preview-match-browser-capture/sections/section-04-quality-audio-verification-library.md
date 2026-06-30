# Section 04: Quality, Audio, Verification, And Library Publish

## Goal

Convert the raw browser capture into a verified MP4 that can be safely published to Media Library and trusted as preview-match output.

## Scope

- Add standard/high encode policy.
- Mix final audio with FFmpeg from source clips and approved audio events.
- Probe and verify final output.
- Compare representative frames against preview evidence.
- Publish to Media Library only after verification.
- Store sanitized evidence artifacts.

## UI/UX Contract

### Target User / JTBD

Storyboard Review user needs trustworthy completed output and clear failure state if verification rejects the capture.

### Surface Inventory

- final output card/status area
- Media Library save state
- verification failure/retry copy
- support evidence reference when available

### Component Map

- Verification result drives completed vs failed projection.
- Media Library publish result drives saved/ready output state.
- Evidence id can be shown only as user-safe support reference.

### State Matrix

- verifying: show verification in progress.
- verification_failed: show retry/support-safe failure.
- publishing: show Library save in progress.
- completed: output verified and ready.
- saved_to_library: output verified and Library item created.

### Responsive Matrix

N/A for layout ownership. Section 01 renders these states, but this section must keep projection payload compact enough for mobile status surfaces.

### Accessibility Acceptance

N/A for direct DOM changes. Verification and Library states must be structured so Section 01 can announce success/failure accessibly.

### Copy Contract

- Never say output is ready before verification passes.
- Verification failure copy must be user-safe and actionable.
- Evidence ids are support references, not raw artifact URLs.

### Browser Evidence Required

- Browser evidence of verified completed state.
- Browser evidence of verification failure state.

## Files To Review

- `python-backend/app/tasks/presentation_render.py`
- `apps/web/server/services/hyperframesRenderService.ts`
- Media Library session/publish services
- worker artifact services
- storage upload helpers

## Files To Change

- capture worker encode/verify modules
- server verification service
- Media Library bridge
- artifact/evidence metadata types
- verification and artifact tests

## Quality Presets

`standard`:

- fast social-video output
- target CRF 23 equivalent final MP4
- Playwright recording allowed if fixture gates pass

`high`:

- sharper text output
- target CRF 18 equivalent final MP4
- must block or use lower-loss capture if Playwright WebM intermediate visibly softens Thai subtitles

Both:

- fixed requested width/height/fps
- deterministic trim duration
- output metadata records engine id, quality, attempt id, composition hash, and timeline hash

## Audio Policy

- Do not trust browser-recorded audio as final Library audio.
- Mix audio using FFmpeg from native source clips and approved audio events.
- Preserve native source audio when requested.
- Include SFX/music/voice events only from approved manifest refs.
- Probe final output for expected audio track policy.

## Verification Gates

Block completion unless:

- output exists and exceeds minimum size
- FFprobe confirms expected duration, fps, resolution, codec, and audio policy
- composition hash and timeline hash match job input
- attempt id is active and not stale
- sampled frame comparison against preview evidence passes
- Thai subtitle timing fixture passes
- evidence artifacts are redacted

Suggested parity thresholds:

- SSIM >= 0.96 for sampled frames
- pixel diff <= 3% outside compression-tolerant regions
- text-region failure if subtitles are missing, duplicated, all-at-once, unreadable, or outside cue windows

## Media Library Publish

Only after verification:

- upload/persist final MP4 output refs
- create or update Media Library item/session
- reconcile billing
- mark projection completed or saved
- expose user-safe output URL/status

Failures before verification must not create a final Library item.

## Evidence And Redaction

Evidence may include:

- preview reference frames
- captured sampled frames
- verification report
- FFprobe summary
- sanitized worker logs

Evidence must not include:

- signed URLs
- route tokens
- bearer tokens
- cookies
- local paths
- raw storage keys
- raw composition HTML unless explicit support mode allows it

## Test First

- Test standard and high encode policy mapping.
- Test FFprobe rejects wrong duration/fps/resolution/codec.
- Test missing required audio is rejected.
- Test mismatched hashes are rejected.
- Test stale attempt artifact is rejected.
- Test Thai subtitle timing fixture fails when all subtitle cues appear at once.
- Test Media Library publish is skipped on verification failure.
- Test evidence redaction removes sensitive values.
- Test support evidence access requires authorization.

## Acceptance Criteria

- Final MP4 is verified before user-visible completion.
- High quality cannot ship with visibly degraded Thai text.
- Library publish is impossible before verification success.
- Support evidence is useful but sanitized.
