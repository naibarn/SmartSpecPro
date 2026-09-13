# Implementation plan

## Runtime and persistence

Add a Rust `speaker_model_manager` module. It stores an allow-listed adapter to
path mapping in app data, validates local paths, applies them to the runner
process environment, and returns redacted status. At startup and before every
probe, load this mapping. Never persist tokens; pyannote token remains an
environment secret and is only checked by the runner during execution.

## Runner contract

Extend the Python runner with `--capabilities`, emitting JSON containing the
existing per-adapter status, runtime, device, checksum, and remediation key.
The command performs no media processing and no download. Keep `--version` and
the scan contract unchanged.

## Tauri commands and admission

Register commands to get status, set/clear a model path, and run an explicit
adapter preflight. The speaker-aware submit command must call the capability
probe for the requested required stages and reject missing model/runtime with a
specific remediation key before posting to the server. Existing explicit
fallback policy remains authoritative.

## UI

Add a Runtime-route panel showing each adapter's actual state. For model-based
adapters provide a native file picker, path display, clear button, and exact
manual setup instructions. Include loading/error/empty states, accessible
labels, copy buttons, and a “Recheck” action. The panel must distinguish
runner-ready from model-ready and explain that model files are installed
separately from the runtime.

## Verification

Add Python tests for `--capabilities` and missing-model statuses, Rust unit
tests for path mapping/allow-list and preflight parsing, and React tests for
status rendering and actionable blocked states. Run focused Worker tests,
TypeScript build/typecheck, Cargo tests, and `git diff --check`.
