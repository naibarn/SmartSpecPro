# Decision log

## Depth

`micro`: two existing React surfaces and focused component/page regression coverage; no DB/API contract change.

## Decisions

- Add a centered start-mode chooser in the series detail page before opening the large editor dialog.
- Pass `initialMode: "fresh" | "resume"` into the editor.
- Enable idea-history query and hydration only for resume mode. `initialInput` continues to override mode for edit flow.
- Fresh mode clears local editor state and does not delete history, preserving explicit recovery.
- Reuse current Dialog/Button visual vocabulary and semantic tokens/classes.

## Review risk

- Avoid accidentally opening both dialogs at once.
- Avoid stale cached query data being applied after switching modes.
- Ensure close/reopen returns to the chooser, not directly to the editor.
