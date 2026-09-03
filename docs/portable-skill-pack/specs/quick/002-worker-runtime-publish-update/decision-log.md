# Decision log

## Depth: standard

This is a medium cross-boundary change (server admission, Rust doctor, React
control, and release packaging) but the existing install APIs and manifest
contract are reusable, so it stays in quick-plan standard depth.

- Treat Whisper and large-v3 as mandatory release assets.
- Validate actual ZIP entries and reject placeholder signatures server-side.
- Let the Runtime & agents button force the existing installer even when the
  version comparison says current.
- Keep production deployment outside this change until the signed artifact is
  available and deployment is explicitly authorized.

## Review stabilization

- Round 1: covered source, production, UI, installer, and signing boundaries.
- Round 2: added actual archive signature inspection and mandatory Whisper
  entries to avoid manifest-only false positives.
- Round 3: added managed WSL checks and made Python contract failures affect
  the shell exit status.
- Round 4: added force-repair deduplication bypass and visible UI error state.
- Round 5: checked test fixture compatibility, platform-specific Whisper
  paths, and the no-fake-signature rule; no remaining auto-fix item.
- Round 6: final consistency check against implementation and verification
  evidence; no remaining auto-fix item.
