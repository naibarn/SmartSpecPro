# Spec 046 — Virtual Admin Agent: Interview Transcript

## Interview Answers (User Decisions)

### Q1: Chat Interface
**Decision: Dedicated admin chat**
- สร้าง chat interface เฉพาะสำหรับคุยกับ System Guardian
- Admin สามารถถามสถานะ, สั่ง action, ดู history ผ่าน chat
- Impact: เพิ่ม complexity ~4h แต่ UX ดีกว่ามาก

### Q2: Auto-fix Scope
**Decision: Per-tenant opt-in**
- แต่ละ tenant เปิด/ปิด auto-fix ได้ใน settings
- Default: off (ปลอดภัย)
- Admin เปิดเมื่อพร้อม

### Q3: Credit Budget Enforcement
**Decision: Soft limit + hard limit**
- Warning at 100 credits (soft limit) → notification
- Hard stop at -50 credits → block new LLM/media requests
- Buffer ช่วยให้ in-flight tasks ไม่ fail กลางคัน

### Q4: Feedback Visibility
**Decision: Own tickets only**
- User เห็นแค่ tickets ของตัวเอง + admin responses
- Admin เห็นทั้งหมดของ tenant
- Domain admin เห็นทุก tenant

### Q5: Approval TTL
**Decision: 4h for critical, 24h for others**
- CRITICAL: 4h → re-alert ทุก 2h ถ้าไม่มีใคร respond
- ERROR: 24h → re-alert once then archive
- WARNING: 24h → auto-archive

### Q6: Watchdog
**Decision: Watchdog timer + systemd**
- Internal watchdog ทุก 5 นาที (stuck sensor, memory leak, connection leak)
- systemd `Restart=on-failure` เป็น safety net
- External `/health` endpoint สำหรับ uptime monitoring

### Q7: MVP Scope
**Decision: All in one phase (39h)**
- Ship ทุกอย่างพร้อมกัน: Guardian + Feedback + Admin Chat
- ไม่แยก phase — build ครบแล้ว deploy ทีเดียว

---

## Auto-Decisions (Technical — ไม่ถาม user)

1. **tRPC router pattern**: ใช้ `adminProcedure` สำหรับ guardian endpoints, `protectedProcedure` สำหรับ feedback submit — matches existing codebase
2. **Background job pattern**: ใช้ `setTimeout/setInterval` เหมือน `pendingApprovalAlert.ts` — ไม่ต้อง BullMQ
3. **SSE implementation**: ใช้ Redis pub/sub + Express SSE เหมือน `publicEventsApi.ts` pattern
4. **DB schema**: ใช้ Drizzle `pgTable` + `pgEnum` เหมือน existing tables
5. **Notification**: ใช้ existing `createNotification()` + `emailService` — ไม่สร้างใหม่
6. **Testing**: Vitest with mock context pattern เหมือน `auth.logout.test.ts`
7. **Audit logging**: ใช้ existing `auditLogger.log()` with new event types
8. **System user JWT**: Generate at startup via `jose` library (same as existing JWT)
9. **Dedicated admin chat**: ใช้ existing chat infrastructure (`conversations` table + tRPC chat router) + system user as participant
10. **Credit enforcement**: Hook into existing `creditService.ts` balance check
