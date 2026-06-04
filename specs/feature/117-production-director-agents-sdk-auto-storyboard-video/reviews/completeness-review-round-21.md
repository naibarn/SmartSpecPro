# Completeness Review Round 21

Date: 2026-05-31
Scope: recurring presenter, hand model, synthetic character, face continuity, voice continuity, lip-sync, and native-audio character drift.

## Result

The plan already had `CharacterContinuityLock`, face continuity QA, shot-frame vision QA, and targeted repair. Round 21 makes the prevention layer stronger by adding `CharacterIdentityAssetPack`, analogous to `ProductReferenceAssetPack`, so recurring people and voices are prepared, consent-checked, scoped, and fallback-ready before provider spend.

## Findings Fixed

1. Character continuity had QA locks but not an upstream asset pack.
   - Added `CharacterIdentityAssetPack`.
   - It records source kind, consent status, reference image/video/voice refs, blocked refs, continuity descriptors, provider-use policy, QA thresholds, fallback plan, and pack status.

2. Recurring human/voice generation needed safer defaults.
   - Product-only, hands-only, single-shot, generic-person, and separate-TTS fallbacks are now explicit.
   - No-face and hands-only plans must block later face reveals.
   - Native-audio and lip-sync strategies must respect the pack's allowed voice/face scope.

3. Provider dispatch needed pre-spend character identity gates.
   - Person/voice-dependent provider calls cannot use raw marketplace screenshots, reviewer/customer/profile images, private seller faces, failed generated people, or vague "same person" prompts.
   - Missing consent, conflicting refs, celebrity-like refs, minors, privacy-blocked refs, or low-quality references block or fallback before reservation/submit.

4. Resume, finalization, and UI needed explicit identity blocker behavior.
   - Added `character_identity_blocked` timeline state.
   - Render, Library finalization, thumbnails, and publishable packages must trace recurring person/voice media back to the approved pack and allowed scope.

## Residual Risk

- Implementation must choose continuity descriptor storage, consent policy mapping, face/voice QA thresholds, and default fallback behavior carefully. These are now tracked in the Orchestra backlog.

## Validation Target

- Section manifest still complete.
- UI contract includes the new blocker state.
- Placeholder, stale node-canvas status, whitespace, and diff checks remain clean.
