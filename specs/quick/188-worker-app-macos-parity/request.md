# Worker App macOS parity

## Original request

วางแผนปรับปรุง WorkApp for Mac ให้หน้า Dashboard และความสามารถหลักใกล้เคียงกับ WorkApp for Windows มากที่สุด

## Task summary

ทำให้ WorkApp บน macOS (เป้าหมายแรกคือ Apple Silicon / arm64) มีประสบการณ์และความสามารถในการติดตั้ง ใช้งาน runtime ตรวจสอบระบบ อัปเดต และดาวน์โหลด release ใกล้เคียง Windows โดยคงความแตกต่างที่เป็นข้อจำกัดของ OS เช่น WSL2

## Current context

- React/Tauri UI ใช้ code path เดียวกันผ่าน `apps/worker-app/src/main.tsx` และ `WorkerAppShell`
- macOS มี native runtime profile และ LaunchAgent autostart อยู่แล้ว
- Windows มี EXE/MSI release และ self-update path
- Dashboard/API มี platform catalog schema แต่ Worker App in-app update endpoint ปัจจุบันเลือก release แบบ Windows เป็นหลัก
- macOS production endpoint ปัจจุบันเป็น source ZIP; `hyperframes-macos-arm64` runtime manifest ยังไม่ published

## Assumptions

- รอบแรกเน้น macOS Apple Silicon (`hyperframes-macos-arm64`); Intel Mac เป็นงานแยกเมื่อมี runtime และ CI lane ที่ยืนยันแล้ว
- parity หมายถึง functional parity ของ Worker App และ runtime ไม่ใช่การทำให้ WSL2 หรือ OS-specific internals เหมือนกัน
- Dashboard สามารถแสดงและให้ดาวน์โหลด release ของทุก OS ได้; การเลือก target เฉพาะ OS ใช้เฉพาะตอน app/runtime อัปเดตตัวเอง
- ใช้ release version เดียวกันต่อรอบเมื่อทำได้ และห้ามให้ตัวแอป fallback ไปใช้ artifact ของอีก platform
- ไม่แก้ไฟล์ฟีเจอร์อื่นที่มี dirty work อยู่แล้ว

## Non-goals

- ไม่เพิ่ม WSL2 บน macOS
- ไม่เปิด local-only execution หรือ upload reference โดย implicit
- ไม่ย้าย backend worker protocol ที่ใช้งานได้อยู่แล้ว
- ไม่ deploy, sign, notarize หรือแก้ข้อมูล production ในขั้นวางแผน

## Success direction

ผู้ใช้ Mac ต้องติดตั้งแอป native ได้, ติดตั้ง runtime ที่ถูกต้องได้, เปิด app แล้วผ่าน doctor/connection/queue/heartbeat และใช้ Worker App surface เดียวกับ Windows โดย Dashboard ยังคงแสดง release ของทุก OS และข้อความ/error ที่เกี่ยวกับการทำงานสื่อสารตาม OS อย่างถูกต้อง
