# Orchestra Decisions

[2026-05-28T04:37:00Z] DECISION: Use direct conductor implementation in standard light mode.
Context: The task was implementation-ready and bounded to an existing read-only API plus extension UI.
Alternatives considered: Sub-agent dispatch; skipped because Codex standard light mode does not require delegation for this bounded medium task.

[2026-05-28T04:37:00Z] DECISION: Use browser-standard drag payloads instead of extension-private payloads.
Context: The user needs to drag media into another browser page/window.
Alternatives considered: Custom JSON drag payload only; rejected because external pages cannot consume extension-private MIME types.
