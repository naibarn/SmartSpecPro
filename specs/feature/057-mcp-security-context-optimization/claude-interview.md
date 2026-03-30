# Interview Transcript — Feature 057

## Q1: Security Fix Scope
**Q:** Wave 1 Security Fixes มี 42 vulnerabilities — ต้องการ fix ทั้งหมดใน scope นี้ หรือเฉพาะ CRITICAL+HIGH?
**A:** CRITICAL+HIGH only — Fix 16 CRITICAL + 46 HIGH. MEDIUM/LOW ทำทีหลัง.

## Q2: stdio Transport Isolation
**Q:** สำหรับ stdio transport (Phase 2) — ต้องการระดับ isolation แค่ไหน?
**A:** OpenSandbox container — Run stdio MCP servers ใน Docker container ผ่าน OpenSandbox infrastructure ที่มีอยู่แล้ว. ปลอดภัยที่สุด.

## Q3: Context Summarization Model
**Q:** Context summarization model — ใช้ model อะไรสำหรับ compress agency context?
**A:** ใช้ระบบเลือก LLM อัตโนมัติตามระบบที่มีอยู่ ที่ enabled อยู่ตาม priority — ไม่ hardcode model เฉพาะ ใช้ dynamic provider selection ตาม existing LLM routing system.

## Q4: Wave 3 Scope
**Q:** MCP expansion (Wave 3) — ต้องการ scope แค่ไหนใน deep-plan นี้?
**A:** All 3 waves — Plan ทั้ง 3 waves ในครั้งเดียว (Security + Context + MCP Expansion ทั้ง 6 phases). ครบถ้วนแต่ plan จะใหญ่.

## Design Decisions Summary

1. **Fix scope:** CRITICAL + HIGH only (62 items) — MEDIUM/LOW deferred
2. **stdio isolation:** OpenSandbox Docker containers — reuse existing infrastructure
3. **Summarization model:** Dynamic LLM selection via existing provider priority system — no hardcoded model
4. **Plan scope:** All 3 waves including full MCP expansion (6 phases)
