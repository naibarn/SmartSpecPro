# Sections

| Section | Focus | Primary outcome |
|---|---|---|
| [01-safety-detector.md](./01-safety-detector.md) | Detector and evidence contract | ลด false positive โดยยัง fail-closed |
| [02-candidate-recovery.md](./02-candidate-recovery.md) | Candidate repair and billing | review ได้, ไม่สร้าง media/คิดเครดิตจาก candidate ที่ไม่ผ่าน |
| [03-job-lifecycle.md](./03-job-lifecycle.md) | Checkpoint, stall, restart | resume ได้จริงและไม่ duplicate |
| [04-ui-observability.md](./04-ui-observability.md) | UI state and telemetry | ผู้ใช้/ops เห็นสถานะจริงและแก้ได้ |
| [05-deployment-verification.md](./05-deployment-verification.md) | Rollout and proof | restart/deploy ไม่ทิ้งงานค้างเงียบ |

ลำดับลงมือ: 01 -> 02 -> 03 -> 04 -> 05 โดย phase 01/02 เป็น P0 ก่อนเปิด media generation ที่เกี่ยวข้องใน production
