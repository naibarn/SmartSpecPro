# Request — Feature 055 Chat Memory Retrieval Upgrade

## User Request

ปรับหน้า chat ให้รู้จักข้อมูลของตัวเองมากขึ้น โดยก่อนตอบทุกคำถามให้มีการดึงข้อมูลประกอบจาก vector / RAG / memory ที่เกี่ยวข้องก่อน แล้วค่อยสรุปข้อมูลเหล่านั้นให้ LLM ตอบกลับ เพื่อให้ระบบเข้าใจ persona memories, session chat memories, long-term memories และ vector search ร่วมกันได้ดีขึ้น

## Working Assumptions

- Chat should remain the single user-facing entry point; retrieval logic belongs on the server.
- The current chat flow already builds context before streaming, so the work is mainly policy and orchestration, not a full rewrite.
- Existing memory writeback, summarization, and streaming behavior should stay intact unless a test shows a clear regression.
- Agency / skill execution memory paths are related but should not be collapsed into the main chat flow.

## Non-Goals

- Do not add a second client-side search layer in the chat page.
- Do not replace the existing memory system wholesale.
- Do not change non-chat flows unless they share the same context assembly path.
