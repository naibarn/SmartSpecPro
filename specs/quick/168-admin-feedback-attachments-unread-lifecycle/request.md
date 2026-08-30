# Request

ปรับ Feedback Hub ให้ภาพแนบเดิมใหญ่ขึ้นประมาณ 3 เท่า, ให้ admin reply แนบภาพได้หลายภาพ, แสดงภาพ reply ชัดเจนและเปิด fullscreen ได้, เพิ่ม unread queue ที่เรียง unread ไว้บนสุดและเตือนเมื่อค้างเกิน 2 ชั่วโมง, ให้ admin/user ปิดงานได้, ปิดแล้ว reply ไม่ได้, และ auto-close งานที่ไม่มี activity เกิน 5 วัน

## Repository assumptions

- Current protected attachment image and admin lightbox should be reused.
- Existing attachment limits remain the source of truth.
- `updatedAt` is the latest ticket activity marker after reply/status updates.
- User opens detail to mark read; unread is per admin.
- Closed is terminal for this feature.

## Non-goals

- No deployment, migration execution against production, or broad unrelated refactor.
- No redesign of the global notification center.
