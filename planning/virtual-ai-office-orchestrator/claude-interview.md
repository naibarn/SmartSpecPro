# Interview Transcript — Virtual AI Office Orchestrator

## Q1: Implementation Scope
**Q:** Spec นี้ใหญ่มาก (3939 lines, 26 sections + 046 integration) — ต้องการ implement ทั้งหมดใน deep-plan นี้ หรือเลือกเฉพาะ phases?

**A:** ทั้งหมด Phase 1-7 — ต้องการ plan ครบทุก phase รวม inter-agent communication, automation, autonomous sessions, localization, rate limiting, data migration, testing

## Q2: Team Builder UI Strategy
**Q:** ต้องการสร้าง team builder UI ใหม่ หรือ extend จาก Agency Builder ที่มีอยู่?

**A:** Extend Agency Builder — reuse ReactFlow + existing node types + add team-specific overlay เพื่อลด effort และรักษา UX consistency

## Q3: Brainstorm Migration Strategy
**Q:** Brainstorm migration — ต้องการ backward compatibility แค่ไหน?

**A:** Hard cutover — ลบ brainstorm เก่าทิ้งเลย เปลี่ยนเป็น team presets ทั้งหมด

## Q4: Memory Retrieval Strategy
**Q:** Scoped memory — เริ่มด้วย keyword/recency หรือ vector search ตั้งแต่ต้น?

**A:** Hybrid (keyword + vector) — ต้องการทั้งสอง approach พร้อมกัน ใช้ pgvector หรือ Python embedding service

## Q5: Agent Turn Order Strategy
**Q:** Autonomous team sessions — default turn order strategy?

**A:** Lead-Directed — lead agent ตัดสินใจว่าใครพูดต่อ, flexible สำหรับ team workflows

## Q6: 046 Feedback Intake System
**Q:** 046 Feedback Intake System (Sections 26-27) — รวมเข้าใน deep-plan นี้?

**A:** แยกเป็น plan ของ 046 — focus deep-plan นี้เฉพาะ orchestrator

---

## Auto-Decisions (Technical — decided by architect)

1. **API framework:** tRPC for all new endpoints (matches existing routers in apps/web/server/routers/)
2. **ORM:** Drizzle ORM with pgTable for all new tables (matches drizzle/schema.ts)
3. **Testing:** Vitest for TypeScript tests, pytest for Python tests (matches existing setup)
4. **Real-time streaming:** SSE (Server-Sent Events) for run monitoring (matches existing agency chat SSE)
5. **Communication flows:** Extend `agencyCommunicationFlows` table pattern for team communication graph
6. **State caching:** Redis for active run state, PostgreSQL for persistence (matches existing queue system)
7. **File structure:** New files under existing directories (server/services/, server/routers/, client/src/components/, client/src/pages/)
8. **Python backend:** FastAPI async endpoints + Celery tasks for team orchestration (matches existing agency_orchestrator.py pattern)
9. **UI components:** Radix UI + Tailwind + CVA variants (matches existing component patterns)
10. **Schema migration:** Drizzle-kit generate + migrate (follows CLAUDE.md Database Safety Protocol)
11. **Memory embeddings:** Python service with pgvector extension for hybrid retrieval
12. **Team→Agency mapping:** 1:1 mapping (assistant_teams.agencyId → agencies.id) per spec Section 16.3
