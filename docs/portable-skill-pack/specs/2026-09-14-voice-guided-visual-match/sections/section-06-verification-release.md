# Section 06 — Verification and Release

Run pure matcher tests, Worker App typecheck, web route/service tests, and Rust tests. Run a narrow Media Workspace browser smoke test when available; record skipped proof honestly. Add static checks that React calls only the native command, apply does not touch voice/subtitle clips, and reorder gating is pure and enforced.

After focused tests pass, increment the Worker App patch version using repository conventions, run the existing Windows release/build command, and copy the installer to both established public release locations. Verify filename, byte size, and SHA-256. Report signing/platform-test limitations and preserve unrelated dirty files.
