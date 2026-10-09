# Windows Runner review build 0.2.27 — 2026-10-09

## Build provenance

- GitHub Actions workflow: [Runner desktop review build #37922802870](https://github.com/naibarn/SmartSpecPro/actions/runs/37922802870)
- Artifact ID: `11612928361`
- Artifact: `smartaihub-runner-windows-x64-0.2.27-unsigned-review`
- Installer: `SmartAIHub Runner_0.2.27_x64-setup.exe`
- Source ref and commit: `a709ec4084243386848785bd276f53445c7d36b8`
- Installer SHA-256: `0ca9ea4af942ff3e0f1f162e4033f659493f3b67f1a2a313281123577a1f2755`
- Manifest signing status: `unsigned-review`
- Checks: Runner release admin/UI/API checks passed; Windows installer build and artifact upload passed. Local download matched `SHA256SUMS`.

The source commit contains the integrated HTTP 409 reconnect handling (`14e705d`), session refresh/continuity repair (`ea286e0`), manual refresh retry (`51d2e57`), and Codex login-status probe PR #401 (`5ce718f`). The review workflow uploaded an Actions artifact only; it did not publish a trusted release.

## Acceptance boundary

This proves candidate source provenance and build integrity only. It does not prove installation on the Windows host, operator acceptance, browser reauthorization, persistent session continuity, Control Plane acknowledgement, fresh capability publication, Codex policy readiness, workspace/source binding, or protected dispatch. The installed Windows version and current deployed SmartAIHub backend SHA remain unknown to this session.

## Next operator action

The authorized Windows/Runner owner should review and approve installation of this exact unsigned candidate if appropriate. After installation, capture the installed version and local source/build provenance, use the supported browser reconnect flow once, then collect sanitized Runner `status`, `doctor`, `capabilities`, and one explicit `rescan` result. Read back the matching live session and acknowledged capability snapshot through the authenticated Control Plane. Keep Windows smoke testing separate from WSL2/Debian acceptance. Do not dispatch a protected DevelopmentRun.
