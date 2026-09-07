# Deep Plan Interview — Feature 178

No blocking business questions were required. The user asked for a follow-up specification and highlighted a discoverability gap in the existing Production UI. The existing Features 176/177 specifications and current implementation determine the technical boundaries.

## Decisions captured from the request

1. The feature is a follow-up to Features 176 and 177, not a replacement.
2. The canonical user entry point is `/drama-series/:seriesId?tab=production`.
3. The Production UI must show an audio heading even before a Production Episode card exists; the current conditional card-only placement is insufficient.
4. A group-native plan/mix must use the Production Episode final cut as its own source and must not use the first Sub-Episode as a proxy.
5. Existing member-level plans remain visible as an explicitly labelled compatibility/source view.
6. Genuine MiniMax Music 3, artifact provenance, ASR/edit-map, rights, FFmpeg mix, and post-encode QC remain mandatory.
7. Archived/read-only series must remain inspectable but mutation controls must be disabled.
8. The implementation should preserve existing unrelated work and use focused verification if full checks exceed available RAM.

## Auto-decisions

- Use a dedicated explicit group scope in the data and Worker contracts rather than making `episodeId` nullable or encoding a Production Episode number into it.
- Prefer an additive normalized group-audio projection/table when the implementation reaches schema design; retain the JSONB manifest as the display projection if that best matches existing ownership patterns.
- Reuse existing Card/Badge/Button/polling/accessibility patterns and add a dedicated group panel instead of expanding the member panel with a second scope.
- Treat missing checksums/storage keys/artifact revisions as blocked, never as a URL-only success.
- Run a self-review plan loop and record browser evidence as required/skipped explicitly.

## Decisions added during the 10-round completeness audit

9. Use the existing durable audio job kinds with a strict
   `scopeType: production_episode` discriminator; do not create parallel job
   names that bypass the current capability/timeout registry.
10. Use normalized group identity plus dedicated group analysis/plan/revision
    tables, with JSONB manifest fields retained only as a display projection.
11. Keep `verticalDramaGroupNativeMusic3` default-off for mutation/admission, but
    render the Production-tab readiness heading even when the flag is off.
12. Require the exact 176/177 skill/caption sequence, preserved timing origins,
    independent rights revocation, durable GPU attempt ledger and measured QC
    thresholds before calling the group pipeline complete.
13. Keep assembly `compositionEditMap` separate from Worker ASR `speechEditMap`;
    ASR must not depend on a speech map that it is responsible for producing.
14. Persist a pipeline-run/stage dependency projection, batch Production-tab
    readiness queries, and block baked/unknown source music unless explicit
    replacement/ducking policy is approved.
