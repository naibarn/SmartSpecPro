# Request

แก้ปัญหาช็อต Vertical Drama ที่มี caller ทางโทรศัพท์: caller ที่มีบทพูดต้อง
แสดงเป็น virtual screen ของมือถือแนวตั้งและเห็นใบหน้าคนพูดตลอดช็อต หากมีหลาย
caller ให้แยกเป็นหลาย virtual screen เพื่อให้ video model แยกภาพและเสียงได้ชัดเจน

## Repository assumptions

- `screenCallerCharacterRefs` / `screen_caller_refs` are the authoritative
  remote-caller assignments.
- Dialogue speaker order is available from deep-drafted shot dialogue lines at
  start-frame planning and from the video prompt inputs at motion-prompt time.
- Shared pure logic is preferred so image and video prompt paths cannot drift.
- The repository is intentionally dirty; unrelated changes must remain untouched.

## Non-goals

- No database migration or UI redesign.
- No inference that promotes a character to caller from synopsis text alone.
- No changes to callers without dialogue unless required to preserve existing
  screen-caller compatibility.
