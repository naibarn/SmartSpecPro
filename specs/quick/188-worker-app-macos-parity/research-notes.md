# Research notes

## Research method

SocratiCode MCP ไม่ได้มี callable `codebase_status`, `codebase_search`, หรือ graph tools ใน session นี้ จึงใช้ fallback แบบจำกัดขอบเขตด้วย `rg`, targeted file reads, package scripts, tests และ live HTTP checks ตามกติกา repository

## Findings

### Shared surface

- `apps/worker-app/src/main.tsx` เป็น Tauri/React entrypoint เดียวและตรวจ OS ที่ต้นทาง
- `apps/worker-app/src/app/workerRoutes.ts` และ `WorkerAppShell.tsx` ให้ route/shell ร่วมกันสำหรับ overview, connection, media workspace, queue, ComfyUI, runtime/agents และ settings
- ดังนั้นช่องว่างหลักไม่ใช่การเขียน Dashboard แยกใหม่ แต่เป็น release/runtime/update contract และข้อความ OS-aware

### OS-specific behavior already present

- `apps/worker-app/src/main.tsx` เลือก `runtime_host_platform` บน Mac และ `managed_wsl_runtime` บน Windows
- `apps/worker-app/src-tauri/src/settings.rs` ปฏิเสธ WSL บน non-Windows และบังคับ runtime id `hyperframes-macos-arm64` บน Mac
- `apps/worker-app/src-tauri/src/commands.rs` มี Mac runtime doctor/install checks, LaunchAgent autostart และ Windows registry autostart
- native `worker_app_install_update` ยังคืน error ว่า self-update รองรับเฉพาะ Windows

### Release/update gap

- `apps/worker-app/src/versionUpdate.ts` มี `WorkerAppRelease` แต่ยังไม่มี platform, architecture หรือ installer capability
- `apps/worker-app/src/main.tsx` เรียก `/api/desktop-releases/worker-app/latest` โดยไม่ส่ง platform ในหลายจุด
- `apps/web/server/routes/desktopReleases.ts` มี Windows latest path และ Mac source ZIP path แยกกัน; ต้องเพิ่ม native Mac artifact path โดยไม่เปลี่ยน semantics เดิมของ source fallback
- `apps/web/shared/desktopReleases.ts` รองรับ `macos` และ `dmg/pkg` อยู่แล้ว แต่ contract ยังไม่พอระบุ architecture/production readiness
- `DesktopReleasePanel.tsx` แสดง Windows installer และ Mac source build instructions; ต้องเปลี่ยนเป็น native Mac download เมื่อมี release พร้อม

### Packaging/runtime gap

- `apps/worker-app/package.json` มี `release:windows`, `runtime:release:mac`, และ `source:mac` แต่ไม่มี worker-app Mac release script
- `scripts/package-macos-source.py` ทำ source ZIP และตั้งใจไม่รวม binary
- `scripts/package-macos-runtime.mjs` จำกัด target เป็น `hyperframes-macos-arm64`
- `.github/workflows/desktop-release.yml` build macOS สำหรับ `apps/tauri-shell`, ไม่ใช่ `apps/worker-app`
- `MAC_BUILD.md` และ `MAC_RUNTIME_BUILD.md` มี prerequisite/target ที่นำมาเป็น release gate ได้

### Live evidence from the audit on 2026-09-11

- `/api/desktop-releases/worker-app/latest` ตอบ 200 และชี้ไปที่ `smart-ai-hub-worker-app-0.1.325-x64-setup.exe`
- `/api/desktop-releases/worker-app/macos-source/latest` ตอบ 200 ที่ source ZIP version `0.1.296`
- `/api/workers/runtime-pack/manifest?runtimeId=hyperframes-macos-arm64` ตอบ 404 `runtime_pack_not_published`
- Hermes macOS arm64 manifest ตอบ 200 แต่เป็นคนละ runtime และไม่ใช่หลักฐานว่า HyperFrames พร้อม

## Existing verification baseline

- `npm --workspace apps/worker-app run typecheck` ผ่าน
- `npm --workspace apps/worker-app test` ผ่าน: 282 tests รวม unit/integration ที่มีอยู่
- focused desktop release Vitest ผ่านเมื่อกำหนด test-only `JWT_SECRET`
- syntax checks ของ packaging scripts และ `git diff --check` ใน scope audit ผ่าน
- ยังไม่มีหลักฐาน macOS native build/install/signing/notarization/browser smoke เพราะ runner ปัจจุบันเป็น Linux

## Implications

ต้องทำ contract ก่อน build artifact เพื่อให้ Dashboard แสดง release ได้ครบทุก OS ขณะเดียวกัน in-app updater/runtime installer เลือก target ของเครื่องปัจจุบันอย่างถูกต้อง และต้องทำ Mac runner/release identity ให้สำเร็จก่อนเรียกว่า parity พร้อมใช้งานจริง
