# Implementation Spec: Feature 012 AddTextClip (T1 Only)

- date: 2026-02-15
- source spec: `specs/feature/012-AddTextClip/spec.md`
- supporting inputs: `research-notes.md`, `interview-notes.md`

## 1) Scope and Boundaries

This implementation covers Text Clip behavior on `T1` only:
1. add/edit/delete text clips
2. text style + transform editing
3. keyframe workflow for transforms
4. timeline interaction and overlap behavior
5. preview/render parity for supported text capabilities
6. persistence and validation compatibility

Out of scope:
1. razor/ripple/global timeline behavior changes
2. non-text feature refactors unrelated to T1 text clips
3. tenant/auth architecture changes

## 2) Confirmed Product Decisions

1. Canonical render path is **Subtitle/ASS (libass)**.
2. `drawtext` is an optional fast-path and must be used only when conversion is **100% equivalent** to canonical output; otherwise fallback to ASS.
3. Font policy is fixed whitelist bundled with renderer; preview must load the same font set via `@font-face`.
4. Overlapping clips on `T1` are allowed.
5. Canonical z-order for overlapping text clips is clip array order within the track.
6. Keyframe model supports segment-level easing plus per-property easing override at data-model level (UI may expose only segment easing first).
7. Strict parity policy: editor UI should expose only text capabilities that renderer can guarantee.

## 3) Current Gaps to Close

1. project validation currently rejects `text` tracks.
2. preview path does not render text clips.
3. render job contract does not carry full text style/keyframe semantics.
4. worker render path ignores subtitle/text clips.
5. test coverage is missing for text-specific parity and compatibility flows.

## 4) Functional Requirements for v1

## 4.1 Text Clip Lifecycle (T1)

1. Add Text action creates clip on `T1`; create `T1` automatically for legacy projects missing it.
2. Default clip values:
   - text: `Your Text Here`
   - duration: `5.0s`
   - centered transform
   - style defaults from supported capability set
3. clip operations: select, move, trim, delete.
4. timeline label shows safe truncated text snippet.

## 4.2 Style + Transform Controls

Supported fields in canonical payload:
1. content/layout: `text`, `textAlign`, `lineHeight`, `letterSpacing`
2. typography: `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `underline`
3. colors/effects: `color`, `backgroundColor`, `effect`, `effectColor`
4. transform: `x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`, `flipX`, `flipY`

Controls unavailable in canonical render capability must not be selectable in strict-parity mode.

## 4.3 Keyframes

1. Add/update/delete keyframes on current playhead.
2. No duplicate marker at same timestamp.
3. Keyframe selection seeks to marker time and enters edit context.
4. Transform updates modify selected keyframe in-place.
5. Interpolation is automatic between adjacent keyframes.
6. Easing model:
   - required segment default easing
   - optional per-property easing override persisted in data model
   - fallback to segment easing when override absent

## 4.4 Overlap and Ordering

1. T1 clip overlaps are allowed.
2. compositing order is deterministic by track clip array order.
3. parity requirement applies to ordering in preview and final render.

## 5) Data Contracts

## 5.1 Frontend Project Model

Text clip payload requires:
1. `textConfig` with style/layout fields used by supported renderer capability
2. base transform
3. transform keyframes, each with clip-local time and easing metadata

Keyframe shape (logical):
1. `time` normalized to `[0..1]` in clip duration
2. transform values
3. `easing` segment default
4. optional `propertyEasing` map for per-property overrides

## 5.2 Render Job Contract

1. Preserve text-specific payload through `projectToTimeline` without dropping style/keyframe semantics.
2. Preserve text track identity when converting timeline back to project representation.
3. Include deterministic layer/compositing order value derived from clip array order.
4. Carry font identifier referencing whitelist entry, not arbitrary runtime system font names.

## 5.3 Validation and Defaulting

1. accept track type `text`.
2. validate required text fields, numerical ranges, and keyframe time bounds.
3. default missing optional fields safely for backward compatibility.
4. reject malformed keyframes/payloads before save/render enqueue.

## 6) Rendering Architecture Requirements

1. Canonical burn-in path generates ASS events/styles from text clip payloads.
2. Worker uses libass subtitle rendering path as source of truth.
3. `drawtext` fast-path eligibility is explicit and conservative:
   - enabled only when all semantics map 1:1
   - disabled automatically when any unsupported feature appears
   - fallback to canonical ASS path is mandatory
4. Resulting frame output for same timestamp must match preview semantics for supported capability set.

## 7) Preview Requirements

1. preview renderer consumes same canonical text payload fields used by backend conversion.
2. font loading is deterministic (shared bundled fonts via `@font-face`).
3. clip overlap ordering follows clip array order exactly.
4. keyframe interpolation in preview follows same easing rules as render path.

## 8) Compatibility and Migration Behavior

1. No DB schema migration required (project JSON field already stores payload).
2. legacy projects without text clips continue to load unchanged.
3. legacy/missing optional text fields default safely on load.
4. render path remains backward-compatible for non-text tracks.

## 9) Security and Isolation

1. Existing user ownership controls on project CRUD remain authoritative.
2. text payload parsing must avoid shell command injection patterns in FFmpeg filter generation (escape and encode text safely).
3. font selection limited to whitelist entries to prevent unsafe file path injection.

## 10) Test Requirements

1. unit tests for text validation/defaulting and keyframe schema behavior.
2. component tests for TextClip editor and timeline label/order behavior.
3. preview tests for transform/easing interpolation and overlap z-order.
4. contract tests for project->timeline conversion preserving text semantics.
5. backend worker tests for ASS generation, fast-path gating, and fallback correctness.
6. parity tests for representative timestamps comparing preview-derived expectations vs rendered outputs.

## 11) Acceptance Criteria

1. User can author text clip on `T1` and see deterministic preview.
2. Saved project reload preserves all text config + keyframes.
3. render output includes text clips with expected style/transform at tested timestamps.
4. overlap ordering in render equals timeline clip array order.
5. unsupported style/effect options are not exposed in strict parity mode.
6. drawtext path never activates for partial mappings and always falls back safely.
