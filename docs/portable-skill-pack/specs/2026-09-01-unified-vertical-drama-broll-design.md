# Unified Vertical Drama B-roll Design

## Goal

Use one B-roll workflow for normal episodes and special tie-in episodes. The
B-roll section is always visible on every storyboard shot, may be used for an
advertisement or supporting media even when the story does not mention it, and
supports both still images and video footage.

## Data flow

`getEpisodeBroll` is the single read projection for the storyboard. It merges
eligible media from the series visual source pack with the footage selected in a
special tie-in idea. The selected footage is exposed as an owner-scoped direct
video source; it does not replace the generated scene or character references.
Both episode kinds use the same `VerticalDramaShotBrollPanel` and the same
`verticalDramaShotBrollBindings` table.

Normal episodes continue to use their existing source-pack entries. Tie-in
episodes additionally expose their persisted selected footage. Source-pack
rights, tenant, user, storage, checksum, and snapshot checks remain enforced.

## Placement contract

Each binding keeps its existing shot/order and source timing contract, and adds
a persisted transform: `x`, `y`, `width`, `height` as canvas percentages,
`rotationDeg`, and `opacity`. The UI edits these values with bounded numeric
controls and fit mode. Video source in/out and still display duration remain
editable. Assembly carries the transform into the Remotion layer, which keeps
the base generated shot at z-index 0 and B-roll above it as an additive layer.

## UX

Every shot displays an empty B-roll panel with an add control. A selected
binding shows a media preview, media type, source/timeline controls, transform
controls, replace, and remove actions. Video options are expanded from ready
segments when available; selected tie-in footage is also selectable as a
direct video source. Fullscreen preview remains optional, never the only view.

## Failure and compatibility

Legacy bindings without transform use safe defaults. Existing normal episode
scene/image/reference behavior is unchanged. A B-roll edit invalidates the
compiled-video marker but preserves the old playable asset for recovery. If a
source is no longer available, the UI shows it as unavailable and the server
rejects the binding without deleting unrelated assets.

## Migration and verification

Add one nullable JSONB transform column with a backward-compatible default;
no data rewrite is required. Verify shared UI behavior, image/video source
projection, transform validation, assembly-to-Remotion propagation, and normal
episode regression with focused tests. Do not run the repository-wide check
because the project environment has insufficient RAM for that command.
