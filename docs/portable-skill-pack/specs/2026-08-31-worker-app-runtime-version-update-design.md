# Worker App Runtime Version Update Design

Date: 2026-08-31
Status: Design approved direction pending implementation

## Goal

Rebuild the Windows Worker App as the next patch release and make runtime
freshness dependable. The app must discover the latest published runtime from
the server, show the installed/latest versions clearly, allow the user to
update manually, and provide a force-repair path for exceptional cases.

The current development release is runtime `2026.08.31.1` for
`hyperframes-wsl2`. The current Worker App source/package version is `0.1.196`;
the next Windows app build will be `0.1.197`.

## Product behavior

1. On startup, check the Worker App release and runtime release independently.
2. Recheck runtime freshness every five minutes while the app is open.
3. `Run runtime checks` performs an immediate full check.
4. When the runtime is missing, older, has a different runtime profile hash, or
   cannot be proven current, show a visible warning in Overview and a primary
   action in `Runtime & agents`.
5. `Update now` downloads and installs the latest published runtime.
6. `Force repair` always re-downloads/reinstalls the selected latest runtime,
   even when version and hash appear current.
7. A runtime update must not delete or reset the saved Worker App connection.
8. Render job claims remain paused while freshness is unknown or stale; an
   already-running job is not interrupted by a periodic check.
9. A successful install is accepted only after size, SHA-256, manifest/profile,
   platform, signature/readiness, and doctor checks pass.
10. If the server is temporarily unavailable, show retry/recovery state and
    keep the last known details, but do not claim that the runtime is current.

Automatic checking is allowed; automatic installation is user-driven. This
avoids interrupting a worker during an active job while still making stale
runtime state impossible to miss.

## Runtime freshness contract

The server's published, valid, stable runtime release is authoritative. The
Worker App compares both:

- semantic runtime version; and
- runtime profile hash (and archive hash for installation integrity).

This catches a republished artifact whose version string did not change. The
check response will expose current/latest version, profile hash, channel,
check timestamp, and a machine-readable reason such as `missing`, `older`,
`profile_mismatch`, `current`, or `verification_failed`.

The existing release endpoint and signed archive URL remain the transport
contract. No private key is placed in the Worker App. The server stores only
the Ed25519 public verification key; signing remains a build/release concern.

## Update flow

```text
check server manifest
        |
        +-- current version + profile hash -> show current
        |
        +-- missing/older/profile mismatch -> show Update now
        |
        +-- user presses Update now / Force repair
                |
                +-- download to resumable .download file
                +-- verify exact byte count + archive SHA-256
                +-- extract into isolated staging directory
                +-- verify installed manifest/profile + runtime doctor
                +-- atomically replace runtime directories
                +-- recheck server/current state
                +-- unblock render only after all checks pass
```

The old runtime remains available until staging validation succeeds. Failed
downloads, corrupt archives, extraction errors, and failed doctor checks leave
the old runtime intact and surface a retryable error. Force repair may replace
an apparently healthy runtime only after the new copy passes the same gates.

## UI changes

The `Runtime & agents` page is the single control surface for runtime updates.
It will contain:

- a status card: `Installed`, `Latest`, `Channel`, `Last checked`, and reason;
- `Run runtime checks` for an immediate check;
- `Update now` when a newer or mismatched runtime is detected;
- `Force repair` for manual recovery even when current;
- progress/status text for checking, downloading, verifying, installing,
  succeeded, failed, and offline states;
- a short explanation that the connection and private key are unaffected.

Buttons will have labels, disabled/loading states, keyboard focus, and error
messages suitable for a worker that may be minimized behind other windows.

## Implementation boundaries

- React: periodic check, status model, explicit user actions, and accessible
  update states.
- Rust/Tauri: typed force-install command, resumable download, integrity gates,
  staging/atomic replacement, and post-install verification.
- Server: continue resolving latest published release from the durable release
  catalog; preserve signed archive and hash fields.
- Release tooling: bump Worker App to `0.1.197`, keep runtime `2026.08.31.1`,
  and produce the Windows build. macOS is not built in this environment.

## Verification

- Unit tests for version/profile comparison and update reasons.
- React tests for periodic checking, update button, force repair, loading/error,
  and no-connection-reset behavior.
- Rust tests for force flag, resumable download, failed validation preserving
  the old runtime, and successful atomic install.
- Existing runtime manifest/doctor and server release route tests.
- Windows Worker App frontend/Tauri build or, if the host cannot build Windows,
  a clearly recorded build limitation with the exact Windows CI command.
- Confirm the published development release remains discoverable through the
  live manifest endpoint after the app rebuild.

## Trade-offs

Polling every five minutes is simpler and more reliable than adding a push
channel, with up to five minutes of detection latency. User-driven installation
avoids interrupting active work, while fail-closed render admission prevents
unknown or stale runtimes from processing new render jobs. A single signed ZIP
per platform keeps the existing installer contract and avoids split-file
assembly failures.
