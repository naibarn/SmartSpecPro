# Gap review round 3 — semantic role and story propagation

Scope checked: start-frame ambiguity, reference-vs-scene semantics, story source snapshot, B-roll ordering, and source-slot prompts.

Closed gaps:

- Location/shop/environment proposals are `scene_anchor`; software/product details are `reference`.
- B-roll is a separate role and cannot silently become a start-frame scene.
- Slot prompt generation repeats semantic role and evidence policy.
- `visualSourceSnapshot` can be supplied to story-generation admission and becomes the durable source fingerprint/payload.
- B-roll order, exact timecodes, fit, audio, label mode, snapshot revision, and segment revision are represented together.

Evidence: prompt expansion and B-roll integration tests, `verticalDramaVisualSourceSnapshotService.ts`, `verticalDramaStoryGenerationRuntime.ts`, and the role picker/editor components.

Result: PASS — no semantic collision gap found in the shared contract layer.
