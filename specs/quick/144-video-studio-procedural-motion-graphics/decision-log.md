# Decision Log

## Planning depth

**Decision: standard quick-plan.** This is a cross-package, renderer, skill and UI
change, but it can be staged behind the existing registry and does not require a new
service or a new database domain. Promote to full deep-plan if the performance spike
shows that a new rendering backend, GPU service or a new persisted beat schema is
needed.

## Recommended approach

Use a registry-driven declarative procedural layer for 2D systems and extend the
existing vetted `scene3d` registry for 3D systems.

### Alternative A — extend `motionGraphic`

Add particle counts, nodes, glow, paths, camera and 3D options to the existing
primitive. Rejected: the schema becomes a large ambiguous union, props become hard to
validate, and the primitive still cannot express a coherent multi-element visual
system.

### Alternative B — render every particle/node as a normal layer

Rejected: it consumes the 40-layer budget, makes timeline editing misleading, and
creates large documents and slow preview/rendering.

### Alternative C — external image/video generation for every motion

Rejected for this requirement: it is expensive, less deterministic, difficult to sync
to narration, and prevents editing of text/data/timing. It remains an optional source
of media assets for photorealistic content, not the procedural motion engine.

## Contract decision

Reuse `MotionTemplateRegistry` and `MotionCandidate` as the user/skill selection
surface. Extend the metadata kind to distinguish `layer_pack` from `procedural`.
The concrete procedural builders return one `motionComposition` layer for 2D systems
or one vetted `scene3d` layer for 3D systems. Do not add a second candidate system.

The initial implementation does not add a new database-level `visualBeatPlan` field.
The skill emits normalized beat/event data and the selected candidate stores the
validated event payload inside its composition `templateParams`; a future beat
inspector can promote this to a first-class field without changing the renderer
contract.

## Timing decision

Use TTS-aligned caption cues for hard timing. Add optional semantic beat markers to
template params or the compiled scene context so a continuous particle/network system
can respond to phrase emphasis without being destroyed and restarted at every cue.
Keep `scene` sync as the default for continuous systems and expose caption/event sync
only when the composition declares it supports restart/keyframe behavior.

## Quality decision

Preview and final use the same formulas, seed, layout and event times. Preview may
lower particle count and resolution through a renderer-provided quality mode, but it
must not change timing or composition geometry. A parity frame test and a real render
smoke test are release gates.

## Release decision

Adding a new `motionComposition` layer variant or changing scene props requires the
existing cross-package schema sync check, worker contract/version update, fixtures,
runtime compatibility verification and a worker claim/retry proof. A new `scene3d`
id also requires both registry copies and server-rendering GL validation.

## Self-review record

Five review passes were completed before handoff:

1. **Completeness:** covered architecture, semantic alignment, UI, tests, worker and
   rollout rather than only the visual renderer.
2. **Consistency:** removed the ambiguous second candidate path and made
   `motionComposition` plus `scene3d` registry behavior explicit.
3. **Security:** added closed ids, strict bounded props, seed/count caps, no arbitrary
   code, no renderer network calls and existing asset/checksum gates.
4. **Integration:** added compiler, router, schema-sync, Player/Worker parity and
   runtime claim/retry evidence to the affected surface.
5. **Usability/performance:** separated continuous/event/restart timing, preview/final
   quality behavior, basic controls, fallback states and a benchmark gate for SVG,
   canvas and Three.js choices.
