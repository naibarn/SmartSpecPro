# Request

## Original user request

ต้องทำ คือ
1. ปรับสถาปัตยกรรมให้ `team run` เรียก `skill-first`
2. เพิ่ม intent router ให้ข้อความในห้อง detect ก่อนว่า should use `chat`, `skill`, หรือ `agency`
3. มีกรณีคุยทั่วไปหรือถามข้อมูลระหว่างที่งานกำลัง process ซึ่งปัจจุบันมักไป call LLM ตรง ๆ แต่ต้องการให้ใช้ skill ตัวหนึ่งสำหรับ “พูดคุยทั่วไป” แทน เพื่อให้ model selection, policy, และความสามารถถูกควบคุมผ่าน skill system เช่นเดียวกับงานอื่น โดย skill นี้ต้องเข้าใจบริบทว่าหลัก ๆ เป็นการคุยกันระหว่างผู้ช่วยเสมือนในทีม ไม่ใช่จาก user ที่เป็นคนจริง

## Task summary

ออกแบบ solution ระดับ implementation สำหรับการเปลี่ยน team room / team run จาก direct-LLM orchestration ไปสู่ `skill-first` execution โดยมี room-level intent routing และมี fallback conversation skill สำหรับ agent-to-agent discussion

## Likely affected areas

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/promptComposer.ts`
- `apps/web/server/services/teamOrchestrationBridge.ts`
- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/server/services/roomService.ts`
- `apps/web/server/services/skillIntentClassifier.ts`
- `apps/web/server/services/skillOrchestrator.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/taskPlannerMiddleware.ts`
- `packages/skills/src/types.ts`
- `apps/web/server/services/skillRegistry.ts`
- `python-backend/app/services/team_orchestrator.py`
- new internal room intent router and new internal team-discussion skill

## Constraints

- ปกติ `chat` ต้องยังคงเคารพ model ที่ user เลือกไว้
- `skill` และ `agency` สามารถเลือก model อัตโนมัติผ่าน policy/planner ได้
- การคุยกันระหว่าง agent ในห้องต้องไม่ใช้ raw LLM path เป็นค่าเริ่มต้นอีก
- ควร reuse ระบบ skill / planner / model policy ที่มีอยู่แล้ว ไม่สร้างระบบเลือก model ชุดใหม่ซ้ำ
- ต้องรองรับทั้ง human-originated room messages และ agent-originated follow-up turns

## Assumptions from current repository

- ระบบมี `classifyIntent`, `orchestrateSkill`, `executeSkill`, และ `runPlanner` ใช้งานได้อยู่แล้ว
- `team run` ปัจจุบันยังวิ่งผ่าน `composePrompt()` + `executeAgentTurn()` เป็นหลัก
- `agency` มี router/runtime ของตัวเองอยู่แล้ว แต่ยังไม่ใช่ default path ของ room messages
- repository นี้รองรับการเพิ่ม skill metadata และ internal-only skills ได้โดยขยาย type/registry

## Explicit non-goals

- ยังไม่ redesign UI ทั้งหน้า Teams/Rooms ใน plan นี้
- ยังไม่รื้อ runtime `agency` ทั้งก้อน
- ยังไม่ลบ Python team orchestrator path ทันที แต่จะลดให้เป็น emergency fallback เท่านั้น
