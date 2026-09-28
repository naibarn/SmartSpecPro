# TDD Guidance

## Test-first order

1. Add schema tests for valid/invalid composition ids, bounded props, seed,
   quality, event markers and backward-compatible old documents.
2. Add registry parity tests for metadata ids, server builders, app/render scene
   registries and duplicated schema files.
3. Add pure deterministic tests for particle positions, graph links, event frame
   projection, quality caps and safe-area bounds. Same seed must produce the same
   output; different seeds must produce visibly different but bounded output.
4. Add builder tests proving one visual-system layer is emitted, no arbitrary code or
   unbounded arrays are accepted, and existing templates remain unchanged.
5. Add compiler tests for absolute frame offset, cue/event behavior, continuous systems
   not being sliced unexpectedly, and caption/audio timing parity.
6. Add Motion Director/skill contract tests for registry-only ids, fallback behavior,
   candidate persistence and non-destructive application.
7. Add renderer tests for Player-compatible composition props, unknown registry ids,
   missing Three capability and non-black fallback/error behavior.
8. Add browser tests for preset selection, real Player playback/scrubbing, fullscreen,
   loading/error/empty states, keyboard operation and narrow layout.
9. Run render smoke at preview/final quality for each visual family and compare selected
   frame metadata/screenshots; do not rely on TypeScript tests alone.

## Focused commands

From `apps/web`:

```bash
npm test -- shared/videoIntelligence server/services/__tests__/videoProjectCompiler.test.ts
npm test -- server/services/__tests__/videoProjectMotionDirector.test.ts
npm test -- shared/remotion/__tests__/layerTemplateSchemasSync.test.ts shared/remotion/__tests__/genericTemplateCompositionSync.test.ts
npm run typecheck
npm run remotion:parity-test
npm run video-intelligence:render-smoke
```

Add exact new test paths to these commands rather than running the entire dirty-repo
suite as the only evidence. Record baseline full-suite failures separately if they are
unrelated.

## Render acceptance fixture

Create one deterministic fixture with:

- a Thai narration/caption cue sequence;
- one particle beat, one graph beat and one title event;
- fixed seed and brand colors;
- preview quality and final quality inputs;
- an optional glowing sphere fixture once the runtime GL path is enabled.

Assert composition id, dimensions, fps, cue/event frames, asset manifest and final
output metadata. Visual screenshot comparison should allow quality-density differences
but reject layout, timing, blank/black output and subtitle drift.

## Failure cases to cover

- unknown composition or scene id;
- negative/oversized particle, node, link or event counts;
- malformed chart facts or labels containing unsafe markup;
- out-of-range event times and overlapping invalid duration;
- missing narration/caption cues;
- stale runtime contract or unsupported worker capability;
- Player preview load failure;
- Three.js rendering without `angle` configuration;
- existing project documents with no new fields.
