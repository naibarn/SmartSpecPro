# Decision Log

## D1 — Adapter around the named skill

Use a dedicated server adapter for `character-candidate-prompt` and reuse the existing candidate lifecycle. This satisfies the explicit skill requirement and avoids chat/conversation coupling.

## D2 — All attached references, bounded

Use all selected character reference assets, capped at 6 by the skill contract. The server resolves and validates them; the browser sends only asset-link IDs.

## D3 — Prompt-only candidate mode

Make candidate DNA snapshot optional only for the new reference-guided mode. Selecting such a candidate promotes the image without writing `visualBible`; existing candidates with snapshots retain the old atomic DNA-lock behavior.

## D4 — No text parsing into multiple prompts

Treat the plain-text result as one canonical prompt and run one image task per candidate with output count 1. This is deterministic, avoids fragile delimiter parsing, and still fulfills the skill's separate-image/no-collage contract.

## D5 — No migration

Reference IDs, mode marker and options fit existing JSON metadata. Additive optional metadata avoids a schema migration and keeps rollback simple.

## D6 — Planning depth

Standard quick-plan: the work crosses UI, router, skill runtime, media references and candidate persistence, but stays inside one vertical-drama feature and does not require a new table or external service.
