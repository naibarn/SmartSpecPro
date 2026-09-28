---
slug: grok-via-hermes-monitoring
title: การติดตาม Grok ผ่าน Hermes
description: วิธีอ่าน readiness, heartbeat, version, capability, queue และ diagnostics ของ Hermes Media Worker
icon: Activity
section: admin
order: 90
pages: ["/admin/monitoring"]
tags:
  - "grok"
  - "hermes media worker"
  - "monitoring"
  - "heartbeat"
  - "diagnostics"
  - "help"
  - "help/th"
aliases:
  - "ติดตาม grok media"
  - "สุขภาพ hermes media"
  - "hermes worker diagnostics"
---

# การติดตาม Grok ผ่าน Hermes

ไปที่ **Admin > Monitoring > Claw Workers** แล้วกด **คู่มือ Grok Media**
การ์ดเดียวกันมี runtime หลายประเภท ปุ่ม **คู่มือ Hermes** อธิบาย
Hermes Agent Gateway ส่วนหัวข้อนี้อธิบาย Grok media worker

## ค่าที่ต้องตรวจ

- **Online / last seen:** control plane ได้รับ heartbeat ล่าสุดจาก worker
- **Readiness:** รวมสถานะ pairing, enabled, version และ worker status
- **Version:** ต้องผ่านค่าขั้นต่ำที่ Admin Settings กำหนด
- **Strategy / scope:** บอกว่าเป็น central host worker หรือ Worker App ส่วนตัว
- **Capabilities:** image generation, จำนวนภาพอ้างอิงของ image edit และ video
  generation ต้องตรงกับ operation ที่เรียก
- **Doctor/diagnostics:** ใช้หาปัญหา runtime pack, executable, profile หรือ network

สถานะ Online อย่างเดียวไม่ได้ยืนยันว่าบัญชี Grok authorized หรือมี entitlement
ให้ตรวจ connection card ที่ Settings ด้วย

## วงจรของงาน

1. Media workflow อ่าน authorized connection และ sharing scope ปัจจุบันจากฐานข้อมูล
2. Admission ตรวจ platform, tenant, scope, quota, queue และ capability
3. มอบงานให้ central host worker หรือ Worker App ส่วนตัวที่เลือก
4. Heartbeat และ progress อัปเดตงานจนสำเร็จหรือล้มเหลว
5. ตรวจผลลัพธ์ก่อนส่งกลับ workflow ที่เรียก

## วินิจฉัยตามอาการ

### Token หมดอายุทั้งที่ reconnect แล้ว

ตรวจว่า workflow อ่าน connection ปัจจุบันจากฐานข้อมูล ไม่ใช่ task snapshot เก่า
ทดสอบ connection ปัจจุบันแล้ว retry หาก record ใหม่ยังต้อง authorization
ให้ reconnect ผ่าน xAI device authorization

### Worker Online แต่ไม่ Ready

ตรวจ pairing, Shared worker ID, minimum version, runtime pack และ doctor output
โหมด private ต้องตรวจว่า Worker App เป็นของ user และ workspace ปัจจุบันด้วย

### งานเข้า Queue แต่ไม่เริ่ม

ตรวจ heartbeat, queue/concurrency limits, submission window ของ user/tenant,
daily quota และ scope ที่ต้องการว่าเปิดอยู่

### สร้างภาพได้แต่สร้างวิดีโอไม่ได้

ตรวจ platform video switch และ video capability/entitlement ของ connection
สิทธิ์สร้างภาพไม่ได้หมายความว่ามีสิทธิ์สร้างวิดีโอ

### ผลลัพธ์หายหรือไม่ถูกต้อง

ตรวจ job error และ diagnostics สำหรับ provider timeout, reference หมดอายุ,
invalid output หรือ Worker App ถูกปิด การ retry โดยไม่แก้ worker Offline
จะได้ผลเดิม

## ข้อมูลสำหรับส่งต่อปัญหา

บันทึก trace/job ID, tenant, connection scope (ห้ามใส่ credential), worker ID,
version, heartbeat ล่าสุด, operation และ sanitized error code ห้ามใส่ device
code, cookie, refresh token หรือ profile file ใน incident report

## คู่มือที่เกี่ยวข้อง

- [[grok-via-hermes-connections|การเชื่อมต่อ Grok ผ่าน Hermes]]
- [[grok-via-hermes-admin|การดูแล Grok ผ่าน Hermes]]
- [[grok-via-hermes-worker-app|Worker App สำหรับ Grok ผ่าน Hermes]]
- [[hermes-workers|Hermes Workers (Agent Gateway)]]

