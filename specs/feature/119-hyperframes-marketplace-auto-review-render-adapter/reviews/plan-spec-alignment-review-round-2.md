# Plan/Spec Alignment Review Round 2

## Verdict

The plan has been updated to close the main gaps found in the first alignment audit. It now maps the spec's detailed implementation requirements into actionable section work rather than leaving them only in `spec.md`.

## Improvements Applied

- Added explicit composition modes for Storyboard Motion Preview, Product Card Explainer, Captioned Final Composite, and Template QA Snapshot.
- Added exact platform preset IDs, rollout state, versioning, safe-area, subtitle, disclosure, thumbnail, and publishable-candidate QA requirements.
- Added exact MVP outbox job types, payload fields, idempotency key format, artifact kinds, content hashes, retention metadata, and sanitized log handling.
- Added `saved_to_library` as a worker/status projection state and UI next-action case.
- Expanded the fixture matrix to match product categories, high-risk claims, Thai text stress, media quality, subtitle/audio, platform profile, failure/recovery, and permission groups.
- Added HyperFrames-specific release gates: dependency audit, doctor, fixture render, and snapshot test.
- Added MVP policy defaults: 7-day preview retention, quota-first accounting, internal-only composition source, 9:16 first rollout, built-in templates only, high-risk review before auto queue, outbox/artifact MVP ledger, and burn-in subtitles first.

## Remaining Implementation Notes

- During code implementation, command names should be aligned with the actual `apps/web/package.json` script naming style.
- If the existing Marketplace Auto Review tables cannot represent worker/dead-letter/retention state safely, implementation must document the promotion decision before adding dedicated HyperFrames tables.
- Browser evidence remains mandatory for Product Detail, Storyboard Review, MediaStudio, Library/Media History, and Video Editor handoff.
