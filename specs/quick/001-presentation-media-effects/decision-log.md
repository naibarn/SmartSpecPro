# Decision Log

## Planning Depth

- Chosen depth: `standard`
- Reason:
  - The feature is medium-sized and cross-cuts shared contracts, React authoring UI, slideshow preview, and Node export logic.
  - It does not currently justify full `deep-plan` because it can stay inside the existing TypeScript/Node architecture without a new backend subsystem.

## Key Product/Technical Decisions

### 1. Scope v1 to media elements only

Only `image` and `video` elements receive motion properties in this plan. Text, rect, and line animations are deferred.

### 2. Use a preset-based motion contract

Adopt a small optional object such as `mediaMotion` on image/video elements rather than adding many one-off booleans or freeform keyframes.

Recommended shape:

- `preset`: enum
- `intensity`: normalized numeric strength
- `easing`: limited enum, defaulted

Rationale:

- Backward compatible
- Easy to author in the property panel
- Easy to test
- Simple to replay in slideshow preview and export render HTML

### 3. Keep base crop and motion separate

Existing fields (`imageZoom`, `videoZoom`, focus X/Y, fit mode) remain the static base frame. Motion applies as an additional time-based transform layer.

For `video`, that transform layer must sit over the live media element so playback time keeps advancing while the viewport is zooming/panning.

### 4. Drive motion from slideshow progress, not pure CSS animation

Preview already supports pause/resume. To preserve correct timing semantics, motion should be derived from slide progress (`0..1`) so preview and export can use the same conceptual model.

### 5. Reuse the current dynamic MP4 capture path

Do not introduce a new Python export mode in v1. Instead:

- treat media-motion slides as requiring the existing dynamic record path
- keep using the existing render-spec compatibility flag `hasDynamicVideo` for now, even though its meaning becomes "dynamic capture required"

This specifically preserves the user's requirement that video effects run while the clip itself is still playing.

This is slightly imperfect naming, but it is the lowest-risk compatibility choice.

### 6. Degrade static exports explicitly

`png`, `jpg`, and `pdf` should render the base frame without motion and emit a warning through the existing export warning contract.

## Rejected / Deferred Alternatives

### Freeform per-element keyframes

Rejected for v1 because it would require a timeline UX, validation rules, much larger schema changes, and deeper export/runtime work.

### Always animate the edit canvas

Deferred because the edit canvas is interaction-heavy. Persistent animation would interfere with selection, drag, resize, and focus behaviors.

### Rename `hasDynamicVideo` immediately

Deferred because that would expand scope across Node, Python, tests, and compatibility gates with little user-visible benefit.
