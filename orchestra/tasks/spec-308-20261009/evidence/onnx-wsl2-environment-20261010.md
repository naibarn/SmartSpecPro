# ONNX / WSL2 environment check — 2026-10-10

- Runner environment observed: Linux `6.12.63+deb13-amd64`, x86_64; Node `v22.22.3`; pnpm `10.4.1`.
- `/proc/sys/fs/binfmt_misc/WSLInterop` is absent, and neither `wsl` nor `wsl.exe` is available. This host cannot perform WSL2 image/runtime compatibility validation.
- PR #405 already documents that ONNX Runtime 1.30.0 removes the vulnerable `global-agent@3` → `roarr` → `sprintf-js` chain, but changes a 301 MB native runtime and requires Media/Runtime + Security approval before an isolated candidate build. Its exact run `38004111980` passed 18 files / 238 compatibility tests on the existing candidate and failed the mandatory full production audit on one Moderate `sprintf-js@1.1.3` advisory.
- No package, lockfile, ONNX runtime, model, feature flag, production secret, or runtime artifact was changed or executed in this recovery. Next executable technical action after approval is an isolated authorized WSL2 compatibility build following `onnx-wsl2-compatibility-plan.md`; without WSL2, use the approved dedicated runner.
