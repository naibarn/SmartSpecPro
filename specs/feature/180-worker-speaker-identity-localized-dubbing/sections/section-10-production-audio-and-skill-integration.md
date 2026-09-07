# Section 10 — Production Audio and Skill Integration

Read `../contracts-v2.md` before implementation. Depends on: 05, 06, Feature 178.

## Implementation and proof

- Ownership targets: verticalDramaAudioPipelineCoordinator.ts, verticalDramaAudioScoring.ts, production assembly/mix projections and Worker media_pipeline integration. Preserve 178 exact Music3 identity and 179 composed edit map.
- Connect authored dialogue and localized cues through UtteranceRef; narration works without fake shot or Series IDs.
- Add optional versioned dialogue-delivery-director skill bundle under apps/web/skills; reuse existing localizer/reviewer and 178 emotion planning. Stamp server execution provenance and validate outputs as untrusted proposals.
- Compose dialogue/music/SFX/ambience separately using references to 178 plans/takes. Native-dialogue mode must remain available; replacement needs explicit source audio policy.
- Implement dependency invalidation for text, voice, edit/time transform, group revision and rights; same-timing voice changes reuse eligible music but rerun mix/QC.
- Tests: standalone/authored bypass scan/translation, skill privacy rejection, canonical text preservation, exact Music3 identity, overlapping cues, source-dialogue duplication, group stale/rights propagation, FFmpeg/Remotion parity.
- Exit: approved dialogue stem and genuine 178 music artifacts form one final mix with lineage and measured QC; fixtures are not production proof.

## User-facing acceptance

Use existing Thai-primary component patterns and the responsive/accessibility matrix in `spec.md`. Show ready, unavailable, running, partial, canceled, error and success with exact provider/target and repair action. No hidden generation or fallback. Test keyboard navigation, privacy/cost disclosures and persisted state on navigation.
