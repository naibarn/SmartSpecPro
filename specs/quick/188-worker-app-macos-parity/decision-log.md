# Decision log

## Planning depth

เลือก `promote/full-depth roadmap` แม้ใช้รูปแบบ quick-plan artifacts เพราะงานแตะ frontend, shared API contract, server release catalog, Rust/Tauri, runtime packaging, CI และ signing/notarization; การทำเป็น patch เดียวจะซ่อน dependency และ release risk

## Decisions

1. ใช้ platform-aware release catalog เป็น source of truth เดียว และ Dashboard แสดง release ของทุก OS; ใช้ target filter เฉพาะ in-app updater/runtime installer เพื่อไม่ให้ตัวแอปติดตั้ง artifact ผิด platform
2. แยก `native Mac DMG/PKG` ออกจาก `Mac source ZIP`; source ZIP เป็น developer fallback ไม่ใช่ production installer
3. เลือก Apple Silicon เป็น lane แรก เพราะ runtime ปัจจุบันบังคับ `hyperframes-macos-arm64`; ไม่ประกาศ Intel parity จนกว่าจะมี artifact/doctor/CI ที่พิสูจน์ได้
4. self-update บน Mac ระยะแรกต้อง fail closed และเปิด native installer/download ที่ถูก platform; auto-replace app จะทำหลังมี signed updater flow และ rollback semantics
5. คง UI/shared worker protocol เดิมให้มากที่สุด และแก้เฉพาะ OS wording, capability states, release/update selection และ runtime readiness
6. release ต้อง publish app artifact กับ matching HyperFrames runtime ด้วย identity/version/sha256 ที่ตรวจสอบได้; ห้ามใช้ Hermes manifest แทน HyperFrames

## Product gates still explicit

- Intel Mac: deferred, separate decision
- Signed auto-update on macOS: phase 2 after signing/notarization secrets and updater design are available
- Universal binary: not required for first Apple Silicon parity lane

## Review rounds

- Round 1: coverage — added API, native, packaging, CI, UI and live gates
- Round 2: contradiction — separated source ZIP from production DMG and separated app update from runtime update
- Round 3: security/boundary — added platform fail-closed selection, signed artifact verification, no implicit runtime/reference fallback
- Round 4: operability — added rollback, release identity, logging, and Mac runner requirements
- Round 5: obvious omissions — added accessibility/localization/browser evidence and explicit Intel/deployment gates
- Round 6: final consistency — section ownership and dependency order checked; no material issue remains for planning handoff
- Round 7: user correction — removed the requirement to hide Windows/Linux downloads from Mac users; retained only technical target matching for self-update/runtime installation
