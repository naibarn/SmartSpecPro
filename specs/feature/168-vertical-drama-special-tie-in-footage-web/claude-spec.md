# Synthesized specification — Feature 168

สร้าง flow Special Tie-in แบบ footage-first ใน `SpecialTieInEpisodeDialog`: upload วิดีโอจริงเข้า managed media, ให้ Worker วิเคราะห์/ถอดเสียง/เตรียม footage, ให้ Skill สร้างเรื่องละคร Tie-in ภาษาไทยที่อ่านเข้าใจง่ายจำนวน 3 แนวคิด, ให้ผู้ใช้แก้เรื่องและบทพูด/ท่าทางก่อนกดยืนยันสร้าง 9 ช็อต, แล้วจึงวาง AI B-roll ตาม millisecond timeline และส่ง Worker render โดยไม่แก้ source เดิม

ขอบเขต Web/Server คือ UI, protected preview/fullscreen, resumable upload, Worker job/status projection, versioned Web–Worker contract, Marketplace Tie-in Skill, selected-character/DNA grounding, dialogue/no-dialogue validation, model selectors (LLM/image/video) ที่ค้นหาและ scroll ได้พร้อม recommended default, history ที่ไม่ hydrate ideas เป็น current หลัง refresh, story review gate, slot requests, authorization, stale protection, credit ledger และ audit

กติกาสำคัญ: `no_dialogue` ไม่สร้าง dialogueLines ใหม่แต่ยังเลือกคง/mute เสียง footage เดิมได้; selected character IDs เป็น allowlist จาก Server; product claims ต้องมาจาก snapshot/customer journey; partial guide ต้องแสดงคำเตือนและรับทราบ; render route ส่ง `footage_broll_render` ไปยัง Worker ที่ใช้ Remotion GenericTemplate; ทุกงานหนักอยู่นอก Server request; source และ derived revisions immutable/versioned

ข้อกำหนดร่วม: `special_tie_in_footage_v2`, `vd-footage-guide-v1`, canonical integer milliseconds, event sequence/replay ผ่าน authenticated Worker control plane, DB/job ledger เป็น source of truth, idempotent credits/reservation release, tenant-scoped protected media และ additive migration ที่อ่าน legacy records ได้
