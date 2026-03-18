---
slug: webhooks
title: Webhooks และการเชื่อมต่อ
description: ตั้งค่า webhooks เพื่อเชื่อมต่อ SmartAI Hub กับบริการภายนอก
icon: Webhook
section: advanced
order: 76
pages: ["/webhook-triggers"]
tags: [webhooks, integrations, triggers, api, external, automation, events]
---

# Webhooks และการเชื่อมต่อ

## Webhooks คืออะไร?

Webhooks คือ HTTP callback ที่ SmartAI Hub ส่งไปยัง URL ที่คุณเลือกเมื่อเกิด event เฉพาะบนแพลตฟอร์ม ช่วยให้คุณเชื่อมต่อ SmartAI Hub กับบริการภายนอก — Slack, Zapier, backend ของคุณเอง, CRM — โดยไม่ต้องคอย poll แพลตฟอร์มเพื่อรับการอัปเดต

เมื่อ event เกิดขึ้น SmartAI Hub ส่ง POST request พร้อม JSON payload ไปยัง endpoint ของคุณ บริการของคุณรับและตอบสนองตามที่ต้องการ

## การตั้งค่า webhook

1. ไปที่ **/webhook-triggers** (หรือ **Settings → Webhooks**)
2. คลิก **Add Webhook**
3. ใส่ **Endpoint URL** — URL แบบ HTTPS ที่จะรับ events
4. เลือก **events** ที่ต้องการ subscribe (ดูรายการด้านล่าง)
5. ใส่ **secret** — string ที่ใช้ลงนาม payload เพื่อให้เซิร์ฟเวอร์ของคุณตรวจสอบว่ามาจาก SmartAI Hub
6. คลิก **Save** เพื่อเปิดใช้งาน webhook

## Event ที่สามารถ trigger ได้

| Event | เมื่อใดที่เกิดขึ้น |
|---|---|
| `message.created` | มีข้อความ chat ใหม่ถูกสร้างในการสนทนาใดก็ตาม |
| `media.completed` | งานสร้างสื่อ (รูปภาพ วิดีโอ เสียง) เสร็จสมบูรณ์ |
| `media.failed` | งานสร้างสื่อล้มเหลว |
| `agency.finished` | agency run เสร็จสิ้นและ preview พร้อมแล้ว |
| `presentation.exported` | presentation ถูก export เป็น PDF หรือวิดีโอ |
| `user.created` | ผู้ใช้ใหม่ลงทะเบียนบนแพลตฟอร์ม |
| `credits.low` | ยอดเครดิตของผู้ใช้ต่ำกว่าเกณฑ์ที่กำหนด |

## รูปแบบ payload ของ webhook

ทุก webhook request มี JSON body:

```json
{
  "event": "media.completed",
  "timestamp": "2026-03-18T10:30:00Z",
  "webhookId": "wh_abc123",
  "data": {
    "taskId": "task_xyz789",
    "userId": "usr_456",
    "mediaType": "image",
    "outputUrl": "https://..."
  }
}
```

รูปแบบ object `data` แตกต่างกันตามประเภท event

## การทดสอบ webhooks

ใช้ปุ่ม **Send Test** ถัดจาก webhook ที่ active เพื่อส่ง payload ตัวอย่างทันที มีประโยชน์สำหรับ:

- ตรวจสอบว่า endpoint URL ของคุณเข้าถึงได้
- ตรวจสอบว่าเซิร์ฟเวอร์ของคุณ parse payload ได้อย่างถูกต้อง
- ยืนยันว่าการตรวจสอบ signature ทำงานได้

การทดสอบจะ fire synthetic event สำหรับแต่ละประเภทที่ subscribe ไว้

## การจัดการ webhooks

จากรายการ Webhook คุณสามารถ:

- **Edit** — อัปเดต URL, secret หรือ events ที่ subscribe ไว้
- **Disable / Enable** — หยุดการส่งชั่วคราวโดยไม่ลบ webhook
- **View delivery log** — ดูความพยายามส่งล่าสุด, response codes และเวลาตอบสนอง
- **Delete** — ลบ webhook ถาวร

## ความปลอดภัย — webhook secrets

SmartAI Hub ลงนามทุก webhook request โดยใช้ HMAC-SHA256 พร้อม secret ของคุณ Signature รวมอยู่ใน header `X-SmartAI-Signature` ของ request

เพื่อตรวจสอบ request บนเซิร์ฟเวอร์ของคุณ:

1. คำนวณ `HMAC-SHA256(secret, raw_request_body)`
2. เปรียบเทียบกับค่าใน `X-SmartAI-Signature`
3. ปฏิเสธ request หากไม่ตรงกัน

**อย่าข้ามการตรวจสอบ signature** — หากไม่มี ใครก็ตามที่ค้นพบ URL endpoint ของคุณสามารถส่ง events ปลอมได้

## นโยบายการลองซ้ำ

หาก endpoint ของคุณส่งคืน HTTP status ที่ไม่ใช่ 2xx หรือไม่ตอบสนองภายใน 10 วินาที SmartAI Hub จะลองซ้ำโดยอัตโนมัติ:

- ลองซ้ำครั้งที่ 1: หลังจาก 1 นาที
- ลองซ้ำครั้งที่ 2: หลังจาก 5 นาที
- ลองซ้ำครั้งที่ 3: หลังจาก 30 นาที

หลังจากลองซ้ำ 3 ครั้งล้มเหลว การส่งจะถูกทำเครื่องหมายว่าล้มเหลวใน delivery log Webhook ยังคง active สำหรับ events ในอนาคต

## Use Cases

- **การแจ้งเตือน Slack** — โพสต์ข้อความในช่อง Slack เมื่อ agency run หรือการ export สื่อเสร็จสิ้น
- **อัปเดต CRM** — อัปเดต record ผู้ติดต่อเมื่อผู้ใช้ส่งข้อความประเภทเฉพาะ
- **Pipeline triggers** — เรียกใช้ CI/CD pipeline หรืองานประมวลผลข้อมูลเมื่อ presentation ถูก export
- **การแจ้งเตือนเครดิต** — ส่งอีเมลหรือ SMS เมื่อยอดเครดิตของผู้ใช้ต่ำ
