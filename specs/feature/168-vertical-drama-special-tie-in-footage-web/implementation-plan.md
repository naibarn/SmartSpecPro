# Implementation plan

1. Add versioned shared guide/story/placement contracts and fixtures.
2. Extend the Skill input adapter with prepared-footage revision, transcript, visual guide, selected character allowlist, no-dialogue mode and model snapshot.
3. Add protected procedures and durable records for upload registration, analysis status, preparation, idea runs/history, story review, nine-shot confirmation and B-roll placement/render submission.
4. Add the three-step Special Tie-in UI using existing media preview, model selector, character, source and B-roll components where possible.
5. Add stale/fingerprint, authorization, credit-context and retry handling before allowing downstream render.
6. Add browser and service regression coverage; enable behind tenant flag until a real Worker run proves the integration.

Worker implementation is specified independently in Feature 169 and must be completed before enabling the prepared-footage gate in production.
