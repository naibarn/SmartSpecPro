# Feature 125 Interview Transcript

## Q1. What is the primary product goal for this feature?

User-provided direction: the final output must look like Storyboard Review Live preview. The current worker render can lose animations and show subtitles all at once, while preview timing is correct. The new path should prioritize visible parity with preview.

## Q2. Should this replace the existing Render Final Composite path?

User-provided direction: no. The existing worker render appears to have been built as an alternative, but it is slow and currently diverges. The new Presentation-style browser capture should be added beside the existing render action.

## Q3. Should capture run on the server or in the client browser?

User-provided direction: choose the suitable solution. Server execution is acceptable because GPU is not currently enabled and Presentation capture already works without GPU. Client-side capture is attractive if it can run reliably and reduce server load, but quality must match preview.

Decision: MVP runs server-side in a dedicated capture worker. Client-side capture remains experimental/local until server verification, upload, codec, tab lifecycle, and security constraints are solved.

## Q4. How should quality be exposed?

User-provided direction: add adjustable Presentation-style browser capture with `standard` and `high` quality.

Decision: expose a compact quality selector near the new capture action. `standard` targets speed and social-video output; `high` targets text sharpness and final output.

## Auto-Decisions

- Button label: `Capture Final Composite`; Thai copy: `Capture ตาม Preview`.
- Internal engine id: `preview_match_browser_capture`.
- The existing `Render Final Composite` action remains unchanged and continues to mean HyperFrames/worker render.
- Browser capture must not capture Storyboard Review controls, toolbar, video player controls, browser chrome, or debug panels.
- Live preview and capture must use a shared `PreviewMatchCompositionPayload` or byte-equivalent projection.
- `subtitleCues` must remain structured through every boundary. Joined text is display metadata only.
- Server verification is required before Media Library publish.
- MVP should not trust client MediaRecorder output as final Library output.
- Long captures must not run inside Express/tRPC request handlers.
- Evidence artifacts must be sanitized before support/operator access.
