# Section 01 — Contract and Installation

**Requirements:** R37-01, R37-02 foundation
**Objective:** Refresh the installed Codex/Runner evidence and extract the exact client contract before protocol implementation.

**Owned scope:** Read-only checks of installed binaries/service; Rust source inspection; Platform test fixtures and a concise evidence note. Do not edit `apps/runner-app` or active service/configuration.

**Prerequisites:** R03.7 spec and current source revisions identified.

**Deliverable:** Fresh redacted Codex probe (isolated temporary workspace), binary/version evidence, and fixtures for pairing, proof headers, capability, command, event and receipt shapes.

**Completion predicate:** Existing binaries are reused, legacy service is still active/unmodified, and contract fixtures trace to Rust structs/serializers.

**Verification/evidence (2026-11-16):**
- `/usr/local/bin/codex`, `codex-cli 0.165.0`; installed Runner `/home/dev/.local/bin/smartaihub-runner`, `0.2.44-dev.1`, contracts `sah-runner-v1` / `sah-runner-connect-v2`.
- `smartaihub-runner verify codex` returned authentication `ready`, version/task probes `passed`; fresh isolated probe evidence ref `runner-task-probe:sha256:7192a5620e8ac9d832f35a17e6bdf763956b910e0b861e404bd1f4dece59c2e6`.
- `smartaihub-runner.service` is active as user `dev`, ExecStart is the installed binary's `run` command. No service/config/credential/data-root changes were made.
- Rust source contract was inspected at `apps/runner-app/src/{connection.rs,device_proof.rs,protocol.rs,control_channel.rs,transport.rs}`. Platform device-proof implementation added at `apps/saas-core/src/runner/deviceProof.ts`; focused Vitest: 4/4 passed.
- Public `https://aimarkethubs.com/livez` currently returns the SmartSIHub shell HTML; local Core health is provided on the protected DEV runtime. Active Core release source remains `92f309e1043c47a5710528aca118c9d557520f39`.

**Section status:** Installation/probe evidence and proof primitive are complete. Server-side pairing, durable proof replay protection and runner job transport are not implemented yet and remain Section 02/03 work; this section does not imply protocol compatibility or enrollment.

**Fallback/blocker strategy:** If account/probe fails, preserve diagnostic without login changes and continue source-contract implementation; hand off only the exact model/account dependency.

**Dependencies:** None. **Acceptance:** Does not imply enrollment or execution.
