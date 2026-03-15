# Interview Transcript: Feature 044 — Multimodal Chat Memory

## Q1: Embedding Provider

**Question:** Gemini Embedding 2 Preview ต้องใช้ API key — ตอนนี้มี Google AI API key อยู่แล้วหรือยัง? และถ้า Gemini Embedding ยังเป็น Preview แล้ว production ใช้ fallback อะไรดี?

**Answer:** มี Gemini API key แล้ว — ใช้ gemini-embedding-2-preview เป็น primary, Cloudflare bge-base + LLaVA เป็น fallback

## Q2: Vision Analysis Timing

**Question:** สำหรับ vision analysis (วิเคราะห์รูปเพื่อสร้าง caption/tags) — ต้องการให้ทำตอนไหน และละเอียดแค่ไหน?

**Answer:** Async ทันทีหลัง upload — Celery task วิเคราะห์รูปทันทีที่ upload ใช้ Gemini Flash สำหรับ caption + tags + objects

## Q3: Expected Scale

**Question:** ปริมาณรูปที่คาดว่าจะต้องจัดการ — ช่วยกำหนด storage strategy และ index tuning?

**Answer:** < 10K รูป/เดือน — Scale เล็ก pgvector single table เพียงพอ ไม่ต้อง partition

## Q4: Chat UI for Visual Memory

**Question:** สำหรับ UI ฝั่ง chat — ต้องการแสดง visual memory อย่างไรเมื่อ LLM อ้างถึงรูปเก่า?

**Answer:** Expandable image gallery — รูปที่ถูกอ้างแสดงเป็น gallery panel ด้านข้าง สามารถขยายดูได้

## Q5: Natural Language Image Reference Resolution

**Question:** การอ้างอิงรูปภาพด้วยภาษาธรรมชาติ (เช่น "รูปก่อนหน้า", "3 รูปล่าสุด", "รูปโลโก้") — ต้องการให้ resolve ด้วยวิธีไหน?

**Answer:** LLM-based resolver — ส่ง reference text + ข้อมูล recent images ให้ LLM ตัดสินว่าหมายถึงรูปไหน ยืดหยุ่นสูง รองรับภาษาไทย

## Q6: Cross-Session Image Memory

**Question:** Cross-session image memory — รูปที่ upload ใน conversation A ควรถูกจดจำและเรียกใช้ใน conversation B ได้ด้วยมั้ย?

**Answer:** ได้ — project-scoped — ถ้าอยู่ project เดียวกัน ค้นรูปข้ามได้ เหมือน entity memory ที่ทำอยู่แล้ว

## Q7: Credit Consumption

**Question:** Credit consumption — vision analysis + embedding ใช้ credit ของ user หรือเป็น system cost?

**Answer:** หักจาก user credit — คิดเป็น credit multiplier เช่น 0.5x ต่อรูป ใช้ creditService.ts ที่มีอยู่แล้ว

## Q8: NSFW/Safety Filtering

**Question:** NSFW/safety filtering — เมื่อรูปถูกตรวจพบว่าเป็น NSFW หรือไม่เหมาะสม จะจัดการอย่างไร?

**Answer:** Block + ไม่เก็บใน memory — รูป NSFW ไม่เข้าระบบ visual memory เลย แต่ยัง upload ได้ปกติ

## Q9: LLM Context Input Mode

**Question:** การส่งรูปเข้า LLM context — ตอน Phase 1 ส่งแค่ text description หรือส่ง image URL/base64 จริงด้วย (vision API)?

**Answer:** Adaptive ตาม model capability — ถ้า model รองรับ vision ส่งรูปจริง ถ้าไม่ส่ง text description แทน

## Q10: Image Deletion from Memory

**Question:** การลบรูปจาก memory — user ควรสั่งลบรูปออกจาก visual memory ได้มั้ย?

**Answer:** ได้ ทั้ง UI และ chat command — UI button หรือพิมพ์ "ลบรูปนี้ออกจาก memory" — ลบ embedding + metadata

---

## Summary of Key Decisions

| Area | Decision |
|------|----------|
| Embedding provider | Gemini Embedding 2 Preview (768-dim), fallback to Cloudflare bge-base + LLaVA |
| Vision analysis | Async via Celery immediately after upload, using Gemini 2.5 Flash |
| Scale | < 10K images/month — pgvector single table, no partitioning needed |
| Chat UI | Expandable image gallery panel when LLM references past images |
| Reference resolution | LLM-based resolver (supports Thai natural language) |
| Cross-session | Project-scoped image memory (shared within same project) |
| Credits | Deducted from user credits at ~0.5x multiplier per image |
| Safety | NSFW images blocked from visual memory entirely |
| LLM input mode | Adaptive — send actual image if model supports vision, text description otherwise |
| Deletion | User can delete via UI button or chat command |
