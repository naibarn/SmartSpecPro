# SPEC-293 Local Workspace Acceptance Workflow — 2026-10-27

- Integrated source: `1d4ab37795bd299eeafb52e406d0c9b9f14f84bb` (follow-up `dd7727ff10cc90cb9417709c5452ba3c746b0162`)
- Local Linux verification: Runner crate full suite at `dd7727ff`: `218 passed, 0 failed, 2 ignored`; desktop workspace binding `4/4`; session-host integration `8/8`. The final report-sanitization follow-up at `1d4ab377` passed the focused acceptance workflow test. Desktop Tauri `cargo check` passed at `dd7727ff`. RunnerReleasePanel and runnerControl focused Vitest checks passed `33/33` at `dd7727ff`.
- Windows device acceptance: **NOT VERIFIED**. This environment has no authenticated enrolled Windows session and did not execute the installed Desktop Runner.

## Integrated local workflow

- Runner Desktop now exposes **ตรวจรับ Workspace Isolation**. It uses a unique temporary root and a separate temporary registry/data root; it never reads or changes the installed workspace registry, active jobs, saved connection, or user project data. Scratch data is removed after generating the report.
- The workflow runs the existing SPEC-293 registry operations for root registration, Project A/B creation, registry reopen identity, existing directory import and preservation, lexical traversal refusal, isolated run workspace registration, sanitized workspace projection, legacy registry loading/migration, interrupted provisioning recovery with file preservation, and two simultaneous SPEC-224 candidate writes where one must lose with `SPEC224_CAS_CONFLICT`. It uses scratch-only fixtures and does not request a DevelopmentRun or alter SPEC-224 dispatch/settlement/Final Verify authority.
- On Windows, it creates a temporary junction and confirms import rejection. If junction creation is unavailable, the report says `NOT_TESTED` with a reason code. On non-Windows builds, junction acceptance is explicitly `NOT_TESTED`.
- The JSON report contains hashed Runner/device references, Desktop/Runner versions, executable SHA-256, embedded source SHA when available, environment and timestamp, sanitized publication state/revision/ack/error code, workspace/run receipts, per-case results, and explicit untested live Task Control/server policy facts. It excludes absolute paths, credentials, and session data. Local scratch projection does not prove server Task Control delivery.
- The approved Desktop release workflow now embeds the exact checked-out source SHA in the binary. Older installed binaries may report `sourceShaStatus=not_embedded_in_this_build`; the executable SHA remains available.

## Capability readiness detail

The owner Runner API read model now returns capability entries with implementation, availability, policy decision, and reason codes, plus snapshot publication/current/revision state. The owner UI distinguishes a missing or stale snapshot and shows `pending`, `allowed`, or `denied` separately from availability. Empty or pending policy records are not presented as denied; missing reason codes receive a state-derived actionable code. No capability is granted by this change.

## Remaining local-device operation

On the enrolled Windows Desktop Runner, update using the approved Desktop release workflow, open the Runner UI and click **ตรวจรับ Workspace Isolation**, then provide the JSON report through the existing authorized handoff/transport. The report must show the actual installed executable/source identity and Windows junction result. Separately verify live Task Control projection and the authorized SPEC-224 consumer flow. Preserve overall Windows Runner acceptance as **NOT VERIFIED** until that device evidence is observed and recorded.
