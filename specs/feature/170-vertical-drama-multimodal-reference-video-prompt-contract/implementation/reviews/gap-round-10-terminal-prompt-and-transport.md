# Post-implementation gap review 10 — terminal prompt ownership and transport

Date: 2026-08-31

Scope: skill-first inspection, stop-frame grounding, final prompt optimization,
single-shot and split-shot persistence, MCP transport, and mixed image/video/
audio forwarding.

Findings and actions:

- MUST_FIX: MCP adaptation previously forwarded only image references and did
  not preserve first/last temporal aliases. It now forwards typed image/video/
  audio arrays plus start/stop aliases from the canonical bundle.
- MUST_FIX: motion assurance could append a safety clause after the first QC
  pass. Both single-shot and split-shot paths now run a terminal optimizer after
  all semantic prompt additions and persist exactly that output.
- MUST_FIX: Hermes image-to-video could otherwise reinterpret mixed references
  as images or drop a stop frame. It now rejects video/audio references and
  stop-frame requests before credit admission because that operation has no
  matching transport fields.
- MUST_FIX: the local Worker materialized only image frame entries while the
  new typed reference manifest could contain video/audio. It now downloads,
  checksum-verifies, and materializes every typed reference before Comfy
  execution; start/stop remain image-only.

Evidence: `mcpMediaAdapter.test.ts`, `comfyMcpAdapter.test.ts`,
`worker_loop.rs`, the video motion-prompt generation tests, the prompt skill
validator, and the focused ten-file suite (249 tests passed).

Result: no open MUST_FIX findings for this boundary. Browser and live-provider
checks remain release verification, not implementation gaps.
