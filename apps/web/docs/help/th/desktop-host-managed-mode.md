---
slug: desktop-host-managed-mode
title: Desktop Host Managed Mode
description: คู่มือติดตั้ง เปิดใช้งาน และทำความเข้าใจ managed desktop mode ของ SmartSpecPro Desktop Host
icon: MonitorPlay
section: features
order: 68
pages: ["/desktop/open"]
tags:
  - "desktop"
  - "desktop-host"
  - "managed mode"
  - "install"
  - "launch"
  - "handoff"
  - "help"
  - "help/th"
  - "help/runtime"
  - "runtime"
  - "desktop-host-managed-mode"
aliases:
  - "desktop-host-managed-mode"
  - "Desktop Host Managed Mode"
  - "Desktop Host Managed Mode help"
---

# Desktop Host Managed Mode

## หน้านี้ใช้สำหรับอะไร

คู่มือนี้เป็นเอกสารอ้างอิงแบบรวดเร็วสำหรับการติดตั้งและเปิดใช้งาน Desktop Host แบบ managed mode

ควรเปิดหน้านี้เมื่อ:

- หน้า **Open in Desktop** ปรากฏขึ้น
- แอปเดสก์ท็อปไม่เปิดให้อัตโนมัติ
- คุณต้องการเข้าใจว่า managed mode ต่างจาก local app แบบอิสระอย่างไร

ถ้าต้องการคู่มือ governance แบบเต็ม ให้ดู [Desktop Host](./desktop-host.md)

## เริ่มต้นอย่างรวดเร็ว

1. ติดตั้ง desktop build ล่าสุดที่เผยแพร่ไว้ใน release portal
2. ลงชื่อเข้าใช้ด้วยบัญชี SmartSpecPro เดียวกับที่ใช้บนเว็บ
3. รอให้ device enrollment และ policy refresh เสร็จ
4. อนุมัติ local roots ที่ workflow ต้องใช้
5. ลองกด launch link หรือ **Open in Desktop** อีกครั้ง

ถ้ายังต้องการตัวติดตั้ง ให้ดู [Desktop Releases](./desktop-releases.md)

## ความหมายของ managed mode

managed mode ทำให้การรันบนเดสก์ท็อปอยู่ภายใน trust model ของ SmartSpecPro

แปลว่า:

- web ยังเป็น control plane
- desktop ยังเป็น local execution surface
- managed LLM traffic ยังเป็น gateway-only
- local roots ใช้แทนการค้นทั้งดิสก์แบบไม่จำกัดเป็นค่าเริ่มต้น
- run ของ Pi และ Agency Swarm ยังต้องตาม policy, audit และ truthful run labeling

managed mode จึงตั้งใจให้ต่างจาก local shell ที่ไม่ถูกกำกับดูแล

## ป้ายกำกับการรันที่ตรงความจริง

คุณอาจเห็นป้ายเหล่านี้ใน Desktop Host และ run history ที่เกี่ยวข้อง:

| ป้ายกำกับ | ความหมาย |
|---|---|
| `Local` | input ดิบยังอยู่บนอุปกรณ์ |
| `Hybrid` | รันบนเดสก์ท็อป แต่มีข้อมูลหรือเครื่องมือบางส่วนข้ามไปยังระบบที่เซิร์ฟเวอร์จัดการ |
| `Server` | รันใน runtime ที่เซิร์ฟเวอร์ควบคุม |
| `External` | รันบน external worker surface |

## การเปิดจากเว็บแอป

desktop handoff links สามารถส่ง run, project, skill หรือ agency จากเว็บไปเปิดต่อในแอปเดสก์ท็อปได้

flow ทั่วไปคือ:

1. เริ่มงานจากบนเว็บ
2. กด **Open in Desktop**
3. เบราว์เซอร์จะเปิดหน้า launch และพยายามเปิดแอปเดสก์ท็อป
4. ถ้าแอปถูกติดตั้งและลงทะเบียนแล้ว งานจะถูกรับช่วงต่อใน Desktop Host

ถ้าการเปิดอัตโนมัติไม่สำเร็จ ให้คัดลอก launch link แล้วลองใหม่หลังจากติดตั้งหรือเปิดแอปด้วยตัวเองก่อน

## สิ่งที่ต้องพร้อมก่อนจะถือว่า desktop runs เป็น managed จริง

rollout คาดหวังให้ gate เหล่านี้ผ่านครบ:

- device binding แบบ proof-of-possession
- signed package verification
- signed update verification
- managed local roots เป็นค่าเริ่มต้น
- Pi startup แบบ gateway-only
- Agency Swarm startup แบบ gateway-only
- offboarding cleanup readiness

ถ้า gate เหล่านี้ยังไม่พร้อม การรันบนเดสก์ท็อปอาจยังอยู่ในสถานะ preview หรือ partial governance

## สิ่งที่ควรเห็นในหน้า Settings

เมื่อแอปเดสก์ท็อป enrol แล้ว หน้า Settings ควรแสดง:

- อุปกรณ์ที่ enrol อยู่
- health และเวลา last seen
- attestation และ storage posture
- package sync state
- workspace profile ปัจจุบัน
- local roots
- rollout gates

ถ้าไม่เห็นส่วนเหล่านี้ อาจเป็นเพราะ tenant ยังไม่ได้เปิด Desktop Host

## การแก้ปัญหาเบื้องต้น

### แอปเดสก์ท็อปไม่เปิด

- ลอง launch link อีกครั้ง
- ตรวจว่าได้ติดตั้งแอปเดสก์ท็อปแล้ว
- เปิดแอปเดสก์ท็อปเองหนึ่งครั้งก่อน แล้วจึงลอง handoff ใหม่

### แอปเปิดแล้ว แต่ run ไม่ต่อ

- ตรวจว่าล็อกอินด้วยบัญชีเดียวกับที่ใช้งานบนเว็บ
- รอให้ policy refresh และ enrollment เสร็จ
- ตรวจว่า local roots ที่จำเป็นถูกอนุมัติแล้ว

### องค์กรของฉันต้องการให้ desktop runs อยู่ใต้ governance ตลอด

ให้ใช้เฉพาะ installer ที่เผยแพร่แล้ว และเปิด managed mode ไว้เสมอ ไม่ควรพึ่ง localhost compatibility path เก่าสำหรับการใช้งานระยะยาวแบบ managed

## คู่มือที่เกี่ยวข้อง

- [Desktop Host](./desktop-host.md)
- [Desktop Releases](./desktop-releases.md)

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[desktop-host|Desktop Host]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[browser-session|Browser Session]]
- [[cli|CLI (Kilo)]]
- [[desktop-releases|Desktop Releases]]
- [[docker-sandbox|Docker Sandbox]]
<!-- knowledge-graph:related:end -->
