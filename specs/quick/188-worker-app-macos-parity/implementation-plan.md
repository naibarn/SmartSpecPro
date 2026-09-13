# Implementation plan: Worker App macOS parity

## Objective

ทำให้ WorkApp for Mac ใกล้เคียง Windows มากที่สุดในระดับ production โดยให้ผู้ใช้ Mac ติดตั้งแอป native, runtime ที่ตรงเครื่อง, ตรวจสุขภาพ, เชื่อมต่อ account, ทำงาน queue/media/ComfyUI/agents และอัปเดตได้จาก flow เดียวกัน โดย Dashboard ยังคงแสดง release ของทุก OS ให้ผู้ใช้เลือกดาวน์โหลดได้

## Recommended approach

ทำแบบ contract-first และแบ่ง 5 waves ตาม dependency:

1. release/runtime identity และ platform-aware API
2. Worker App update/settings/doctor UX
3. native Mac app + HyperFrames runtime packaging และ CI
4. Dashboard download/release presentation
5. cross-platform tests, Mac verification, staged rollout

ทางเลือกที่ไม่แนะนำคือทำ UI Mac เพิ่มก่อนมี artifact จริง เพราะจะได้ parity เชิงภาพแต่ยังติดตั้งและใช้งานจริงไม่ได้; อีกทางเลือกคือ universal binary ตั้งแต่แรก ซึ่งเพิ่ม build/signing complexity โดยไม่ช่วยแก้ปัญหา runtime pack ที่ยังเป็น arm64 lane เดียว

## Wave 1 — contract and release selection

Target files/modules:

- `apps/web/shared/desktopReleases.ts`
- `apps/web/server/routes/desktopReleases.ts`
- `apps/worker-app/src/versionUpdate.ts`
- update call sites in `apps/worker-app/src/main.tsx`
- focused shared/server tests under `apps/web/shared/__tests__` and `apps/web/server/routes/__tests__`

Work:

- เพิ่ม normalized target identity เช่น platform `macos`, architecture `arm64`, artifact kind `native-installer`/`source`, channel และ update capability โดย backward-compatible กับ catalog records เดิม
- เพิ่ม optional target/architecture selection สำหรับ in-app app update และ runtime install; ส่วน Dashboard catalog ต้องคืน release ของทุก OS โดยไม่ filter ตาม browser OS
- ให้ latest/download response มี artifact metadata ที่ client validate ได้ และคง endpoint source ZIP เป็น fallback ที่ติดป้าย developer-only
- ตรวจ version matching ระหว่าง app artifact และ runtime manifest; expose release id/hash โดยไม่เปิดเผย storage key ที่ไม่ควรเปิดเผย
- รักษา auth/tenant/admin boundary ของ release catalog และ signed download URL เดิม

Acceptance:

- Dashboard แสดง Windows/macOS/Linux release ได้ครบตาม catalog
- in-app updater ของ Mac เลือกเฉพาะ Mac target ของตัวเอง และไม่ auto-install artifact ของ platform อื่น
- Windows behavior เดิมไม่เปลี่ยน
- missing Mac artifact แสดง `not_available` ที่ actionable ไม่ใช่ generic install failure

## Wave 2 — Worker App UX and native update boundary

Target files/modules:

- `apps/worker-app/src/main.tsx`
- `apps/worker-app/src-tauri/src/commands.rs`
- `apps/worker-app/src-tauri/src/settings.rs`
- `apps/worker-app/src-tauri/src/lib.rs`
- `apps/worker-app/src-tauri/tauri.conf.json`
- `apps/worker-app/src/versionUpdate.ts` tests/new pure helpers

Work:

- centralize OS/architecture detection and use it for all app update checks (currently repeated in several effects)
- replace Windows-specific copy such as “Start with Windows sign-in” with `Start at login` and platform-specific explanation; keep WSL controls Windows-only
- distinguish app update status from runtime update/doctor status
- implement Mac phase-1 update action as safe native installer handoff (open/download DMG/PKG and show next step), or enable Tauri signed updater only when signing metadata is present; never claim auto-install if it cannot be completed
- add Mac app path, permissions, quarantine/notarization diagnostics and actionable error codes where needed
- retain LaunchAgent autostart and test idempotence/status/remove without changing Windows registry behavior

Acceptance:

- Mac settings/overview never promise WSL or Windows-only behavior
- update check is platform-specific at all call sites
- app update cannot overwrite a running signed Mac app through the Windows-only path
- runtime doctor continues to require `hyperframes-macos-arm64`

## Wave 3 — native Mac release and runtime pipeline

Target files/modules:

- add `apps/worker-app/scripts/package-macos-release.mjs`
- `apps/worker-app/scripts/package-macos-runtime.mjs`
- `apps/worker-app/package.json`
- `apps/worker-app/MAC_BUILD.md`
- `apps/worker-app/MAC_RUNTIME_BUILD.md`
- add/update `.github/workflows/worker-app-macos-release.yml` (or a clearly separated matrix lane)
- runtime publish/manifest integration under `apps/web/server/routes/workerRuntime*.ts` and matching tests

Work:

- build `aarch64-apple-darwin` Worker App and produce DMG first; add PKG only if enterprise deployment needs it
- package native dependencies explicitly: Node/sidecars, ffmpeg/ffprobe, Chrome for Testing, Sharp darwin arm64/libvips, Remotion assets, Hermes integration as applicable
- publish `hyperframes-macos-arm64` runtime pack with manifest, checksum/signature, version, platform and release provenance
- enforce artifact naming and platform validation so Mac release script cannot copy Windows files or source ZIP into native slot
- add GitHub macOS runner build, cache, artifact upload, release catalog publish/finalize, and optional notarization after codesign
- use immutable release identity and retention/rollback rules; a failed Mac publish must not mark latest as ready

Release gates:

- `npm --workspace apps/worker-app run typecheck`
- frontend build and Rust tests on macOS runner
- `tauri build --target aarch64-apple-darwin`
- `codesign --verify --deep --strict` and DMG mount/install check
- runtime manifest validation, SHA256/signature verification, native Mach-O checks and no forbidden Windows/Linux binaries
- authenticated endpoint check: native Mac release is 200/allowed and source ZIP remains separately labeled

## Wave 4 — Dashboard parity and copy

Target files/modules:

- `apps/web/client/src/features/desktop-releases/DesktopReleasePanel.tsx`
- `apps/web/client/src/features/desktop-releases/WorkerRuntimeReleasePanel.tsx`
- dashboard locale files under `apps/web/client/src/locales/{th,en}`
- release panel/server/shared tests

Work:

- load the complete release catalog and render Windows/macOS/Linux cards without hiding other platforms
- show native Mac DMG as the primary Mac option when published; show source ZIP only under developer/manual fallback, while keeping Windows and Linux options visible
- display version, architecture, installer format, checksum/trust status where appropriate, and separate app/runtime readiness
- keep layout responsive, keyboard accessible, and consistent with Windows card; provide loading, no-release, stale, failed, and unsupported-architecture states
- remove copy that implies Mac users must compile source for normal installation

UI/UX Contract:

- Target user/job: Mac user wants to install or update Worker App and make it ready to process jobs without knowing runtime internals
- Surface inventory: Dashboard desktop release panel, Worker Runtime release panel, Worker App Settings/Overview update state
- Component map: existing release cards/buttons/badges plus a shared target resolver and status copy helper; no parallel Mac-only page
- State matrix: loading, native-ready, source-only, no-release, wrong-architecture, update-available, update-failed, runtime-not-published, runtime-ready
- Responsive: preserve current stacked mobile layout; long file names and error copy wrap without horizontal scrolling
- Accessibility: buttons/links have explicit labels, status uses live-region semantics where existing pattern supports it, focus remains visible, color is not the only state signal
- Copy: Thai and English labels for “macOS Apple Silicon”, “Native installer”, “Developer source”, “Runtime not published”, and next action; locale fallback follows existing dashboard namespace
- Browser evidence: authenticated screenshot/smoke for Windows and Mac target fixtures, plus no-release and source-only fixtures; no production download required

Acceptance:

- all OS release cards remain visible and independently downloadable
- same primary install flow shape on Windows and Mac
- Mac card does not call source build the normal path when DMG is ready
- current Windows card and download URL remain unchanged

## Wave 5 — verification and rollout

Test layers:

- shared/server unit tests for complete catalog visibility, optional target resolver for self-update, latest selection, artifact kind, backward-compatible legacy records, and fail-closed invalid platform
- Worker App unit tests for OS/architecture URL selection, update action branching, error mapping, autostart labels and runtime readiness
- Rust tests for pure release URL validation, Mac/Windows update policy, LaunchAgent idempotence helpers and runtime target checks
- packaging dry-run tests and CI artifact inspection
- macOS runner integration: install DMG on Apple Silicon, launch app, sign-in, connection health, heartbeat/claim, runtime doctor/install/update, queue state and one non-paid local media smoke
- browser smoke with mocked release catalog for both platforms; distinguish focused proof from deployment proof

Rollout:

1. publish contract/UI behind availability determined by actual catalog artifacts
2. publish Mac runtime and DMG at a version aligned with the Worker App package
3. verify authenticated latest endpoints and runtime manifest before showing download publicly
4. pilot with internal Apple Silicon user, monitor install/update/runtime failures
5. promote stable; retain prior Mac artifact and runtime for rollback

## Risks and mitigations

- Signing/notarization unavailable: ship truthful manual DMG handoff only; do not expose auto-update
- Runtime too large or build-host constrained: build/publish runtime separately with immutable manifest and resumable download; do not bundle an unverified fallback
- Apple Silicon-only demand expands: add Intel lane as a separate runtime/artifact identity, not by relabeling arm64
- API compatibility: add optional fields and preserve old Windows response shape during transition
- Dirty worktree: edit only the ownership paths above and validate focused diffs before any publish

## Definition of done

The work is complete only when a real Apple Silicon Mac can install the native release, get an allowed `hyperframes-macos-arm64` runtime, pass doctor/connection/queue smoke, use the same Worker App capabilities as Windows, see all OS releases in Dashboard, and update or safely hand off to the correct Mac installer. Windows regression tests and release selection must remain green.

## Execution status

Repository implementation is complete for the target-aware release contract,
native Mac update handoff, DMG packager/CI workflow, Dashboard presentation, and
Thai/English manuals. Focused tests and Worker App checks pass. The remaining
items in the definition of done are release-owner gates that require an Apple
Silicon macOS runner and published artifacts: native build, signing,
notarization, `hyperframes-macos-arm64` publication, clean-machine install, and
authenticated queue/render smoke.
