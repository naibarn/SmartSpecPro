# Interview Transcript — Feature 055: Chat Memory Vector RAG

## Q1: Fact Extraction Frequency

**Q:** ระบบ fact extraction ควรทำงานเมื่อไหร่? ทุก message pair (แม่นยำแต่แพง LLM cost) หรือ batch ทุก 5-10 messages (ประหยัดกว่า)?

**A:** ทุก message pair — Extract facts ทันทีหลังทุกคู่ user+assistant ไม่มี delay, facts พร้อมใช้ทันที

## Q2: Conversation Deletion Policy

**Q:** เมื่อ user ลบ conversation ควร cascade ลบ archive files จาก disk ทันทีหรือเก็บไว้ตาม retention period?

**A:** เก็บ 7 วันก่อนลบ — Soft delete: เก็บ 7 วันให้ recover ได้ แล้วค่อย hard delete

## Q3: Cross-Conversation Search

**Q:** Cross-conversation search: ควรให้ Level 2 (chunks) ค้นข้าม conversations ใน project เดียวกันได้ไหม?

**A:** ค้นข้าม conversations ใน project — ถ้าอยู่ project เดียวกัน ค้น chunks จากทุก conversation ได้ (context กว้างขึ้น)

## Q4: Memory Panel UI

**Q:** ผู้ใช้ควรเห็น extracted facts (scoped_memories) ใน MemoryPanel ที่มีอยู่หรือไม่?

**A:** แสดงรวมกัน — Entity memories เดิม + extracted facts แสดงรวมใน list เดียว แยกด้วย badge [auto] vs [manual]

## Q5: High-Importance Fact Handling

**Q:** เมื่อ fact extraction ได้ fact ที่ importance >= 7 ควรแจ้ง user ให้ confirm หรือ auto-save เลย?

**A:** Auto-save ทั้งหมด — ทุก fact auto-save โดยไม่ถาม user ดู/ลบ/แก้ไขได้ทีหลังใน Memory Panel

---

## Auto-Decisions (Technical — decided from codebase research)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| BullMQ queue pattern | Lazy init + `redis.duplicate()` + DLQ | Matches existing `deliveryQueue.ts` pattern |
| Scheduler | BullMQ repeatable jobs (not Cloud Tasks) | Simpler for periodic cleanup; Cloud Tasks is overkill |
| Test approach | Vitest + mocked Drizzle ORM | Matches `memoryPersonaRouting.test.ts` pattern |
| Worker startup | Same process as web server | Matches existing BullMQ workers |
| Secondary buildChatContext | In `contextBuilder.ts` — does NOT need same update | Already has scoped memory via `retrieveForPrompt()` for agency flows |
| Migration number | 0111 (next after 0110_narrow_wallflower.sql) | Sequential from `_journal.json` |
| Python auth pattern | `verify_internal_token` + `/api/internal/` path | Matches `internal_provider.py` + Nginx deny pattern |
| Archive encryption | Per-record IV via existing `crypto.ts encrypt()` | Matches existing AES-256-GCM pattern |
