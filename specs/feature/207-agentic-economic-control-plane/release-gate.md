# Feature 207 Release Gate

สถานะ implementation ของ Feature 207 ใช้หลักฐานแยกจากการกล่าวอ้างว่า production
พร้อมแล้ว:

| Gate | สถานะ | หลักฐานที่ต้องมี |
| --- | --- | --- |
| Typed admission, money, tenant/actor authority | Pass | `economicControlPlaneTypes.ts` + focused tests |
| Forward-only persistence and balanced journal constraints | Pass | `0340_feature_207_economic_control_plane.sql` + migration contract test |
| Reserve/capture/release/settlement state machine | Pass | focused transition and settlement tests |
| Tenant-scoped read/control API | Pass | `economicControlPlane.ts` router test and auth boundary |
| Legacy compatibility | Pass (feature-off by default) | `economicCompatibilityAdapter.ts` tests |
| Provider certification | Blocked / external | verified provider receipt evidence per runtime/provider |
| Financial reconciliation dry run | Blocked / external | database reconciliation report with zero unexplained variance |
| Rollback drill | Blocked / external | recorded rollback and replay proof |

การเปิด production ต้องไม่เปลี่ยน gate ภายนอกเป็น Pass จากการมี unit test เพียง
อย่างเดียว และห้ามลบหรือแก้ไขข้อมูลจาก legacy Credits เพื่อทำให้ reconciliation
ผ่าน.
