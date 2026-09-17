# TDD guidance

1. Add projection tests first: image prompt is exposed from image-task prompt;
   video prompt remains empty when only image prompt exists; both fields survive
   when present.
2. Add/extend pure bridge-target tests if the extension test harness can import
   the helper; otherwise verify source/build manifest contracts with a small
   Node/JSON assertion and manual event-path inspection.
3. Build the extension with Vite and inspect `dist/manifest.json` and
   `dist/assets/dragBridge.js` for Meta.ai coverage.
4. Run the focused server test, extension tests that do not invoke the prohibited
   standalone typecheck, dashboard package validation, ZIP contents, and
   `git diff --check`.

