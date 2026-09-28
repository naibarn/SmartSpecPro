# Vertical Drama manual video upload

## Goal

หลังผู้ใช้ upload วิดีโอสำเร็จ ระบบต้องบันทึกไฟล์เป็น durable media asset และผูกกับคลิปให้เสร็จในขั้นตอนเดียว โดยไม่เรียก post-upload identity QC อัตโนมัติ

## Design

- เพิ่มการลงทะเบียนไฟล์ของ media-jobs upload/import ใน `media_assets` และคืน `mediaAssetId` ให้ client
- ให้หน้า Vertical Drama บันทึก `videoUrl`, `mediaAssetId` และ `source: "upload"` ผ่าน mutation แบบ atomic
- ลบเฉพาะ auto-QC จาก manual upload; ปุ่ม QC แบบกดเองและ generated-video QC เดิมยังคงทำงาน
- ทำให้การเขียนผล QC อ่าน row ล่าสุดและ merge เฉพาะ `identityQc` ของคลิปเดิม เพื่อไม่ทับ upload ใหม่จากข้อมูลค้าง
- ไม่ลบคลิปที่ผู้ใช้ upload เองเมื่อมีการเปลี่ยน start frame

## Compatibility

ฟิลด์ `assetId` เดิมของ upload endpoint ยังคงเป็น string storage identifier; เพิ่ม `mediaAssetId` เป็นฟิลด์ใหม่แบบ optional จึงไม่ทำให้ client เดิมเสียหาย

## Verification

รัน focused tests ของ WebAssetResolver, upload persistence และ Vertical Drama video asset assembly พร้อมตรวจ diff/TypeScript ที่เกี่ยวข้อง
