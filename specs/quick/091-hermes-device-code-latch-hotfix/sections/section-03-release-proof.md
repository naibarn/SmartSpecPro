# Section 03 - Release and production proof

Ownership:

- Worker App version manifests and installer artifact
- `apps/web/server/services/workerRegistryService.ts` and focused version tests
- Orchestra verification artifacts

Acceptance:

- Minimum desktop version is 0.1.133.
- Rust and focused web gates pass after the final edit.
- NSIS bundle is rebuilt from current source.
- Production latest/download endpoints match local size and SHA-256.
- Web health is OK.
- Live worker reports 0.1.133 before one new authorization attempt is tested.

Proof recorded 2026-07-20:

- Release: `smart-ai-hub-worker-app-0.1.133-x64-setup.exe`
- Size: `4,152,687` bytes
- SHA-256: `422632c2194ce8ff0b93205621da6557a5440846c64ab3a1cfb5819989198819`
- Production `/healthz`: OK
- Production latest/download: version, filename, size, and SHA-256 match local
  artifact.
- Remaining: the user's Windows Worker App must update from 0.1.132 to 0.1.133
  before the fresh live OAuth attempt can be proven.
