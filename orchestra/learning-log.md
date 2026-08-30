# Loop learning log

## Active run

- route: data-first debug with inline implementation
- discovery limitation: SocratiCode transport/tools unavailable; shell fallback required
- worktree: heavily dirty; owned paths must remain narrowly scoped
- current stop reason: in progress

## Evidence and gap review

- DB: series 57 has five rows. IDs 204/205 have valid canonical DNA, three portrait assets each, and completed media tasks. IDs 206/207/208 have story descriptions only, no canonical DNA, no character assets, and no media tasks.
- Audit: series-57 character generation events exist for character IDs 204 and 205 only; no prompt-generation failure is logged for 206-208. This supports an unstarted/rejected-before-submit lifecycle, not silent DNA loss.
- Root cause: first-portrait candidate mode required an age profile; 206-208 have no age fact and were rejected before the single visual-bible prompt path could create DNA.
- Prevention: server-side canonical DNA check and regression coverage; candidate mode is now optional and safely falls back to the single prompt path. No placeholder DNA or paid backfill was written to real data.
- Verification gap: no browser/live provider/deployment run. The existing full customInstruction router suite is baseline-red from unrelated stale fixtures (implicit model fallback and snapshot character-key mismatch). Full TypeScript check is also baseline-red across unrelated dirty files; the edited paths had no reported type errors. The new fallback test passes independently.
