# Plan Uplift

Date: 2026-02-12
Target: `implementation-plan.md`

## Recommended Uplifts

### U1
- Severity: high
- Impact: high-impact
- Gap: ยังไม่มี explicit acceptance ต่อการห้ามเพิ่ม unsafe directives (`@ts-ignore`, `eslint-disable`) แบบไม่ตรวจสอบ
- Rationale: งานแก้ TypeScript ขนาดใหญ่มีความเสี่ยงซ่อน debt ด้วยการปิดเตือน
- Concrete plan delta:
  - เพิ่ม policy gate: fail ถ้าพบ `@ts-ignore` ใหม่ที่ไม่มี annotation justification
  - เพิ่ม review checklist สำหรับ `any` ใหม่ทุกจุด

### U2
- Severity: high
- Impact: high-impact
- Gap: ยังไม่มี rollback playbook เฉพาะกรณี single-batch merge แล้วพบ production regression
- Rationale: ผู้ใช้เลือก rollout แบบก้อนเดียว ทำให้ blast radius สูง
- Concrete plan delta:
  - เพิ่ม rollback sequence (revert commit + redeploy + smoke check)
  - กำหนด owner/on-call และเวลาตอบสนองสูงสุด

### U3
- Severity: medium
- Impact: high-impact
- Gap: แผนยังไม่ล็อก “error budget per phase” ก่อน move ต่อ
- Rationale: ลดโอกาสข้าม phase ทั้งที่ root-cause ยังไม่ถูกปิดจริง
- Concrete plan delta:
  - เพิ่ม numeric gate เช่น TS2307/TS2305 ต้องลดถึง threshold หลัง Phase 1
  - ต้อง sign-off ก่อนเริ่ม strict cleanup

### U4
- Severity: medium
- Impact: low-impact
- Gap: ไม่มี machine-readable report artifact สำหรับเปรียบเทียบ before/after ใน CI
- Rationale: ทำให้ตรวจ regression ยากในรอบถัดไป
- Concrete plan delta:
  - เพิ่ม script สรุป error counts เป็น JSON
  - เก็บ artifact ใน CI หรือ workspace report folder

### U5
- Severity: medium
- Impact: low-impact
- Gap: ยังไม่ระบุ explicit test subset command list สำหรับ sensitive suites
- Rationale: ลดความคลุมเครือในการรัน regression tests
- Concrete plan delta:
  - เพิ่มรายการคำสั่ง test แบบ deterministic สำหรับ library/media/tenant/security

### U6
- Severity: low
- Impact: low-impact
- Gap: ไม่ได้กำหนด worklog mapping ระหว่างไฟล์ที่แก้กับ error code category
- Rationale: ยากต่อการ trace ว่าแต่ละแก้ปิด error กลุ่มไหน
- Concrete plan delta:
  - เพิ่ม remediation matrix (file cluster -> error categories -> validation result)

## Smart-auto note
- According to `decision_mode=smart_auto`, low-impact items can be auto-applied.
- High-impact items should be explicitly confirmed.
