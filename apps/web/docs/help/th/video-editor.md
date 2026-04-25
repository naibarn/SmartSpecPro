---
slug: video-editor
title: Video Editor
description: แก้ไขและประกอบวิดีโอ
icon: Film
section: content-creation
order: 80
pages: ["/video-editor"]
tags:
  - "video"
  - "editor"
  - "timeline"
  - "clips"
  - "export"
  - "help"
  - "help/th"
  - "help/media"
  - "media"
  - "video-editor"
aliases:
  - "video-editor"
  - "Video Editor"
  - "Video Editor help"
---

# Video Editor

## ภาพรวม

Video Editor ช่วยให้คุณประกอบ ตัด และส่งออกคอนเทนต์วิดีโอ ออกแบบมาสำหรับการนำ clip ที่สร้างด้วย AI มาประกอบร่วมกับวิดีโอที่อัปโหลดและเสียง

## เปิด Editor

- ไปที่ **Video Editor** ในแถบด้านข้าง
- เปิดโปรเจกต์วิดีโอที่มีอยู่หรือเริ่มโปรเจกต์ใหม่
- Clip วิดีโอที่สร้างจาก Chat จะปรากฏใน media library และสามารถลากไปวางบน timeline ได้

## ความสามารถหลัก

- **Timeline editing** — จัดเรียง clip รูปภาพ และ audio track บน timeline หลายแทร็ก
- **Trim และ cut** — ปรับขนาด clip โดยลาก edge บน timeline
- **Clip ที่สร้างด้วย AI** — นำวิดีโอที่สร้างจาก Chat เข้ามาในโปรเจกต์โดยตรง
- **Audio tracks** — เพิ่มเพลงพื้นหลังหรือ narration ที่สร้างด้วย audio skill
- **Export** — Render และดาวน์โหลดผลงานสุดท้าย

## Workflow

1. สร้าง clip วิดีโอใน Chat โดยใช้ prompt `create video:`
2. เปิด Video Editor และสร้างโปรเจกต์ใหม่
3. ลาก clip ที่สร้างแล้วจาก media library ไปวางบน timeline
4. จัดเรียงและตัด clip เพื่อสร้างลำดับที่ต้องการ
5. เพิ่ม audio track หากจำเป็น
6. คลิก **Export** เพื่อ render วิดีโอสุดท้าย

## ตัวเลือกการ Export

- คลิก **Export** ในแถบเครื่องมือเพื่อ render วิดีโอ
- รูปแบบเอาต์พุต: MP4 (H.264)
- ความละเอียดตามการตั้งค่าโปรเจกต์ (720p, 1080p)
- Export ทำงานเป็น background task — สามารถแก้ไขต่อได้ระหว่างรอ render
- ดาวน์โหลดไฟล์ที่เสร็จแล้วจากการแจ้งเตือนหรือหน้าโปรเจกต์

## Transitions และเอฟเฟกต์

- ใช้แผง **AI Draft** เพื่อสร้างคำแนะนำ transition ระหว่าง clip
- ลาก transition จากแผงไปวางบนจุดเชื่อมต่อระหว่าง clip สอง clip บน timeline
- Transition ที่รองรับ: fade, crossfade, slide, zoom

## เคล็ดลับ

- สร้าง clip หลายเวอร์ชันใน Chat ก่อนเปิด editor — การมีตัวเลือกทำให้การประกอบเร็วขึ้น
- ใช้แผง AI Draft ภายใน editor สำหรับคำแนะนำเกี่ยวกับ transition และลำดับ
- เก็บ clip แต่ละ clip ให้สั้น (5-15 วินาที) เพื่อให้จัดการ timeline ได้ง่ายขึ้น
- ดูตัวอย่างงานบ่อย ๆ ด้วย player ในตัวก่อน export

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[media-generation|สร้างรูปภาพ วิดีโอ และเสียง]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[gallery|แกลเลอรี่]]
- [[presentations|สร้าง Presentation จาก Chat]]
<!-- knowledge-graph:related:end -->
