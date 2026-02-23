[2026-02-23T08:49:10Z] DECISION: Classified feature as medium scope and implemented in waves without introducing a new table.
  Context: User requested using the same versioning system as Document Management.
  Alternatives considered: new presentation_versions table (rejected to keep shared system).

[2026-02-23T08:50:35Z] DECISION: Reused `library_content_versions` with contentType `presentation_slide_snapshot_v1` for Presentation save history.
  Context: Existing shared storage/version pipeline already exists in Document Management.
  Alternatives considered: separate presentation-only storage layer (rejected as duplicate).

[2026-02-23T08:54:20Z] DECISION: Implemented restore through presentation-specific procedure while still reading shared versions.
  Context: `library.restoreVersion` currently restores markdown chunks, not presentation slide payloads.
  Alternatives considered: force restore via library router directly (rejected due content-type mismatch behavior).

[2026-02-23T16:02:00Z] DECISION: Grouped Presentation saved versions by slide inside the editor sidebar.
  Context: Follow-up request asked for clearer version browsing and slide-level organization.
  Alternatives considered: flat chronological list (rejected due poor scanability for multi-slide decks).

[2026-02-23T16:03:00Z] DECISION: Added selected-version diff preview summary before restore.
  Context: Follow-up request required previewing older content before rollback.
  Alternatives considered: restore directly from list (rejected to reduce accidental restores and improve confidence).

[2026-02-23T16:04:00Z] DECISION: Enforced restore confirmation via AlertDialog action.
  Context: Restore is destructive at slide level and should require explicit user intent.
  Alternatives considered: no confirmation or native `window.confirm` (rejected to keep consistent UI behavior and testability).
