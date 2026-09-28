# Spec 210 Release Gate

`orca.v1` อยู่ในสถานะ disabled จนกว่าจะมีหลักฐานทุกชั้น:

| Gate | สถานะใน repository | หลักฐาน production ที่ยังต้องมี |
| --- | --- | --- |
| Runner contract/readiness และ stale snapshot fail-closed | Pass | - |
| Session command sequencing, idempotency, fencing | Pass | Runner protocol integration trace |
| Job/attempt receipt mapping แยก ACK จาก effect receipt | Pass | restart/late-event trace จาก canonical Job |
| Auth/approval/economic correlation | Pass | provider launch + reserve/release audit |
| Operations projection contract | Pass | browser evidence in Spec 209 surfaces |
| Installed Orca provider/OS certification | Unverified | per-OS install, auth, cleanup, soak |
| Rollback and feature-off drill | Unverified | disable/rollback report with no orphan process |

ห้ามเปิด route จากสถานะ readiness ที่เกิดจาก client payload และห้ามใช้ ACK เป็น
หลักฐานว่า effect สำเร็จ.
