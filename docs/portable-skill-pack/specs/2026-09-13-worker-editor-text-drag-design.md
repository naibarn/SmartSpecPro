# Worker editor text preview and drag repair

Approved in conversation on 2026-09-13.

- Normalize the paused playhead to integer milliseconds consistently with text creation so a newly added clip is visible immediately.
- Include text/overlay tracks by type, including custom IDs. Bind overlay coordinates to the crop frame in guide mode and the stage in actual-preview mode. Keep text above the guide dimming mask; animate inner content without replacing the positioning transform.
- Keep pointer drag placement transient until release. Show a non-interactive clip preview at the current compatible lane and time; use the same calculation for release. Snap within eight screen pixels to the playhead and clip edges. Cancellation discards the preview.
- Store optional fontWeight and fontStyle on NleClip, retain regular/upright defaults for existing projects, and expose controls in the existing modal and viewer.
- Preserve unrelated workspace changes. No dependencies or database migration needed.

Verification: paused fractional-millisecond creation, bold/italic JSON roundtrip and preview, clip window visibility, drag preview before commit, timeline regression tests, TypeScript and Vite build. Native Windows and actual video export are separate proof surfaces.

Review: scoped state changes; no continuous project persistence while dragging; no animation transform on text positioning element. Existing Astryx CLI is unavailable (module missing), so controls use the existing form markup without adding a dependency.

Final proof: 13 focused tests passed; Worker App TypeScript + Vite build passed. Chromium with mocked Tauri verified adding Bold/Italic text and visibility inside the 9:16 crop frame. Browser inspection found and fixed font/stroke/shadow scale against project canvas width. Native Windows installation, real media playback, and export were not exercised.
