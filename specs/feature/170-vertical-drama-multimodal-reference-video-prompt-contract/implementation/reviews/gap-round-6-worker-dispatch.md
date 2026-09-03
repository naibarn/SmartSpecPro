# Post-implementation gap review 6 — worker dispatch and actual asset truth

Date: 2026-08-31

Scope: worker payload creation, stop-frame transport, reference asset lookup,
tenant ownership, ready-state validation, and retry compatibility.

Findings and actions:

- MUST_FIX: the worker path could silently lose a stop frame or erase a
  reference when a joined media row was missing. It now reads reference links
  independently, resolves every asset through a tenant-scoped ready query, and
  fails closed for missing or unsupported media.
- MUST_FIX: approved start-frame mutation accepted prompt-only or non-image
  state. It now requires a real ready image asset.

Evidence: `verticalDramaEpisodes.ts`, `verticalDramaShotReferences.ts`, the
Comfy adapter contract tests, and feature-170 shared contract tests.

Result: no open MUST_FIX findings for this boundary.
