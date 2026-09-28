# Worker Runtime Update Warning Reliability

## Goal

Restore a reliable visible warning when a newer render runtime is available,
including when the Worker App version cannot be read or when a manifest request
is temporarily slow.

## Design

- Run the runtime update check whenever settings and the startup check are
  ready; app-version availability must only affect the separate Worker App
  update check.
- Keep a detected runtime update visible while background refreshes run. A
  refresh may restore a persisted block, but must not overwrite an in-memory
  update warning with `false`.
- Increase the runtime manifest request timeout to tolerate the published
  manifest's metadata size and slower worker connections.
- Surface a non-silent check failure in the Worker App so the user can run the
  existing checks action and see whether the server or local runtime is the
  problem.

## Failure handling

The warning remains advisory for connectivity failures: the Worker App can
continue its normal connection flow, but the UI reports that runtime freshness
could not be verified. A confirmed runtime update keeps the existing managed
WSL/runtime-pack installation flow and readiness verification unchanged.

## Verification

- Rust unit tests for runtime version/update decisions remain green.
- Worker App TypeScript typecheck/build remains green.
- The Windows installer is rebuilt with the next patch version and copied to
  both dashboard release locations.
- Production latest-release metadata and the installer hash are rechecked.
