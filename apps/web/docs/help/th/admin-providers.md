---
slug: admin-providers
title: การจัดการ Provider
description: กำหนดค่า AI model providers
icon: Server
section: admin
order: 90
pages: ["/admin/providers", "/admin/multi-provider"]
tags: [admin, providers, models, configuration, api keys]
---

# การจัดการ Provider

## ภาพรวม

ผู้ดูแลระบบกำหนดค่าว่า AI provider และโมเดลใดที่พร้อมใช้งานสำหรับผู้ใช้ แพลตฟอร์มรองรับ LLM provider หลายตัวพร้อมกันและส่งคำขอตามความพร้อมใช้งาน ต้นทุน และสุขภาพของโมเดล

## เพิ่ม Provider

1. ไปที่ **Admin → Providers**
2. คลิก **Add Provider**
3. เลือกประเภท provider (OpenAI, Anthropic, Google, xAI และอื่นๆ)
4. ใส่ API key — จะถูกเก็บแบบเข้ารหัสและไม่เปิดเผยใน UI
5. บันทึกและการตรวจสอบสุขภาพ provider จะทำงานโดยอัตโนมัติ

## การจัดการโมเดล

แต่ละ provider เปิดเผยโมเดลหนึ่งตัวหรือมากกว่า หลังเพิ่ม provider:

- คลิก **Sync Models** เพื่อดึงรายการโมเดลล่าสุดจาก API ของ provider
- เปิด/ปิดใช้งานโมเดลแต่ละตัวสำหรับผู้ใช้
- ตั้ง **credit multiplier** ต่อโมเดลเพื่อปรับต้นทุนเทียบกับอัตราเครดิตพื้นฐาน

## Multi-Provider Routing

หน้า admin **Multi-Provider** แสดง provider ที่ active ทั้งหมดและสถานะสุขภาพปัจจุบัน router จะทำงานอัตโนมัติโดย:

- หลีกเลี่ยง provider ที่มี circuit-breaker เปิด (เกิด error ซ้ำ)
- เลือกโมเดลที่ cost-effective ที่สุดที่ตรงกับความต้องการของคำขอ
- Fallback ไปยัง provider รองเมื่อ provider หลักไม่พร้อมใช้งาน

## สุขภาพ Provider

แต่ละ provider แสดงตัวบ่งชี้สุขภาพ:

| สถานะ | ความหมาย |
|---|---|
| Healthy | คำขอสำเร็จตามปกติ |
| Degraded | ตรวจพบ error บ้าง แต่ provider ยังใช้งานได้ |
| Down | Circuit breaker เปิด — provider ถูกยกเว้นจาก routing ชั่วคราว |

ผู้ดูแลระบบสามารถรีเซ็ต circuit breaker ด้วยตนเองจากหน้ารายละเอียด provider

## หมายเหตุด้านความปลอดภัย

- API key เข้ารหัสที่ระดับ storage ด้วย AES-256-GCM
- Key ไม่ถูกส่งกลับใน API response — UI แสดงเฉพาะสถานะ "configured"
- หมุนเวียน key โดยใส่ค่าใหม่ในฟอร์มแก้ไข provider

## Media Providers

Media providers จัดการการสร้างรูปภาพ วิดีโอ และเสียง:

- ไปที่ **Admin → Media Providers** เพื่อจัดการ providers
- Providers ที่รองรับได้แก่ fal.ai, Replicate และอื่นๆ
- แต่ละ provider ต้องการ API key ที่กำหนดค่าในการตั้งค่า provider
- เปิด/ปิดใช้งาน media providers แยกกันจาก LLM providers
- แต่ละ media provider แสดงรายการโมเดลที่รองรับ (image generators, video generators, audio models)

## การจัดการโมเดล

แพลตฟอร์มมีหน้าเฉพาะสำหรับจัดการ catalog โมเดลทั้งหมดในทุกประเภท provider:

- **LLM Models** (/admin/llm-models) — ดู เปิดใช้งาน และปิดใช้งานโมเดลภาษาเฉพาะต่อ provider ตั้ง credit multiplier เพื่อปรับต้นทุนสัมพัทธ์ของแต่ละโมเดล
- **Media Models** (/admin/media-models) — จัดการโมเดลสร้างรูปภาพ วิดีโอ และเสียง เปิดใช้งานเฉพาะโมเดลที่ต้องการให้ผู้ใช้เข้าถึง
- **Model sync** — คลิก **Sync Models** บน provider ใดก็ได้เพื่อดึงรายการโมเดลล่าสุดจาก API ของ provider โมเดลใหม่จะปรากฏอัตโนมัติหลัง sync
- **Default models** — ตั้งโมเดลเริ่มต้นทั่วทั้งแพลตฟอร์มต่อหมวดหมู่ (chat, image, video, audio) ผู้ใช้ใหม่เริ่มด้วยโมเดลนี้เว้นแต่ domain admin จะ override
- **การตั้งค่าเฉพาะโมเดล** — กำหนดค่าพารามิเตอร์ต่อโมเดล เช่น ค่าเริ่มต้น temperature, ขีดจำกัด token สูงสุด และการ override ราคาสำหรับการติดตามต้นทุน
