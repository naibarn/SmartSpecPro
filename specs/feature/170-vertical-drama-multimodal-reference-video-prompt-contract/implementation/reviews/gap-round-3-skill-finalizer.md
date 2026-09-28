# Post-implementation gap review 3 — skill-first prompt and terminal finalizer

Date: 2026-08-31

Scope: actual stop-frame attachment, explicit labels, all reference modalities,
inspection honesty, retries, repair/judge paths, and the last semantic writer.

Checks:

- `verticalDramaShotMedia.test.ts` verifies STOP_FRAME_IMAGE, mixed labels,
  and metadata-only/unavailable treatment for video/audio.
- `verticalDramaVideoMotionPromptGeneration.test.ts`: passed as part of the
  focused 135-test run.
- Source audit confirms stop image is added to per-shot and bulk vision calls,
  while provider arrays retain video/audio references.
- Source audit after `terminalVideoPromptQc` found no later prompt append or
  rewrite; later work is validation, billing, transport, and persistence.

Findings and actions:

- MUST_FIX: the prompt manifest originally described non-image media as if the
  authoring model had directly inspected it. Added auditable inspection records
  and explicit `metadata_only/unavailable` wording so unseen audio/video is
  never invented or falsely cited as seen/heard.
- MUST_FIX: split speaker-switch persistence lacked the manifest field and did
  not forward it to the skill. Added the field at router and service-wrapper
  boundaries.
- NICE_TO_HAVE: native video/audio inspection adapters can later replace the
  metadata-only status without changing the bundle contract.

Result: no open MUST_FIX findings for this boundary.
