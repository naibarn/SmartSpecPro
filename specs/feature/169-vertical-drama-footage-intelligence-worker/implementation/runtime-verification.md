# Runtime verification boundary

Local proof:

- `cargo check --manifest-path apps/worker-app/src-tauri/Cargo.toml` ผ่าน
- `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --lib worker_loop::tests:: -- --nocapture` ผ่าน 34 tests
- HyperFrames bundled CLI `transcribe --help` เรียกได้จาก runtime pack

ยังต้องรันใน deployment/เครื่อง Worker จริง:

- authenticated claim พร้อม active Series binding
- ffprobe/VAD บน footage จริง
- HyperFrames transcript บน runtime ที่ติดตั้งจริง
- upload/publication ผ่าน artifact storage และ playback URL
- Remotion Chromium render ของ prepared footage + AI B-roll
## Local runtime bundle verification (2026-08-30)

- bundled platform Node was found under `apps/worker-app/.runtime-release-staging/runtime-pack/node/bin/node`
- bundled HyperFrames CLI was found under `runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js`
- running the direct command `<bundled-node> <bundled-cli> transcribe --help` succeeded
- production execution, Thai model availability, and a real media transcription remain deployment/runtime evidence; the implementation does not use `npx` or install from the network
