---
slug: desktop-host
title: Desktop Host
description: การรันบนเดสก์ท็อปแบบมี governance, การจัดการอุปกรณ์, local roots, package sync, และ desktop handoff
icon: MonitorPlay
section: features
order: 66
pages: ["/settings", "/admin/desktop-host", "/domain-admin/desktop-host", "/desktop/open"]
tags:
  - "desktop"
  - "desktop-host"
  - "managed mode"
  - "local roots"
  - "package sync"
  - "device governance"
  - "pi"
  - "agency swarm"
  - "help"
  - "help/th"
  - "help/runtime"
  - "runtime"
aliases:
  - "desktop-host"
  - "Desktop Host"
  - "Desktop Host help"
---

# Desktop Host

## ภาพรวม

Desktop Host คือพื้นผิวการรันบนเดสก์ท็อปแบบมี governance ของ SmartSpecPro โดยเว็บยังเป็น control plane ส่วนแอปเดสก์ท็อปรับหน้าที่ local runtime, local file access และการ materialize package แบบกำกับดูแลสำหรับ Pi, Agency Swarm และ workflow local ขั้นสูง

ใช้ Desktop Host เมื่อคุณต้องการ:

- local file intelligence โดยไม่บังคับอัปโหลดไฟล์ก่อน
- การรัน Pi หรือ Agency Swarm บนเดสก์ท็อปแบบอยู่ใต้ policy
- enrollment ของอุปกรณ์ที่ผูกกับตัว device และมี posture ให้ตรวจสอบได้
- signed package sync สำหรับ local skills และ agency packs
- run labels ที่บอกความจริงว่าเป็น local, hybrid, server หรือ external

## ความหมายของ "managed mode"

managed mode ทำให้การรันบนเดสก์ท็อปอยู่ใต้ policy ของระบบ แทนที่จะปล่อยให้แอปเดสก์ท็อปเป็น local shell แบบไม่จำกัด

กติกาหลักคือ:

- Web ยังเป็น control plane
- Desktop ยังเป็น execution-rich surface
- managed LLM traffic ยังต้องวิ่งผ่าน gateway-only
- local roots ใช้แทนการค้นทั้งดิสก์แบบอิสระเป็นค่าเริ่มต้น
- run ของ Pi และ Agency Swarm ยังต้องอยู่ใต้ policy, audit, และ labeling ที่ตรงความจริง

สำหรับ flow การติดตั้งและการเปิดจากหน้า Desktop Open ให้ดู [Desktop Host Managed Mode](./desktop-host-managed-mode.md)

## ป้ายกำกับการรันที่ตรงความจริง

Desktop Host ใช้ป้ายกำกับ locality 4 แบบ:

| ป้ายกำกับ | ความหมาย |
|---|---|
| `Local` | input ดิบยังอยู่บนอุปกรณ์ |
| `Hybrid` | รันบนเดสก์ท็อป แต่มีข้อมูล เครื่องมือ หรือ brokered access ข้ามไปยังระบบที่เซิร์ฟเวอร์จัดการ |
| `Server` | รันใน runtime ที่ควบคุมโดยเซิร์ฟเวอร์ |
| `External` | รันบน external worker surface เช่น OpenClaw gateway |

ป้ายเหล่านี้ต้องสะท้อนความจริง ไม่ใช่เหมารวมว่าทุกอย่างที่เริ่มจากเดสก์ท็อปเป็น local ทั้งหมด

## การตั้งค่าส่วนตัว

คุณสามารถดู posture ของ Desktop Host ของตัวเองได้จาก **Settings** เมื่อฟีเจอร์ถูกเปิดใช้

ลำดับการตั้งค่าทั่วไป:

1. ลงชื่อเข้าใช้ SmartSpecPro บนเว็บ
2. ติดตั้งและเปิดแอปเดสก์ท็อป
3. ลงทะเบียนอุปกรณ์ผ่าน desktop enrollment flow
4. อนุมัติ local root อย่างน้อย 1 จุด
5. รอให้ Desktop Host sync signed packages
6. เปิดหรือยืนยัน Agency Swarm runtime หาก tenant ของคุณใช้ desktop multi-agent execution

การ์ด bootstrap ใน Settings จะช่วยสรุปความพร้อมของลำดับนี้

## สิ่งที่แสดงในหน้า Settings

ส่วน Desktop Host ใน **Settings** และใน tenant console จะแสดง posture ปัจจุบันของเดสก์ท็อป

ส่วนสำคัญที่ควรเห็น:

- อุปกรณ์ที่ enrol อยู่และสถานะสุขภาพ
- เวลา last seen
- posture ของ proof-of-possession และ attestation
- สถานะ package sync
- workspace profile และ network class ปัจจุบัน
- rollout gates
- run labels ล่าสุด
- posture ของ local file parser
- local roots และ action ที่ทำได้

## Device posture

อุปกรณ์แต่ละตัวสามารถรายงานข้อมูลเช่น:

- display name และ machine name
- health: online, offline, unhealthy หรือ disabled
- เวลา last seen
- workspace profile ที่กำลังใช้อยู่
- storage protection mode
- attestation mode
- package cache paths
- package sync state ปัจจุบัน
- local roots ที่กำหนดไว้บนเครื่องนั้น

attestation mode อาจต่างกันตามแพลตฟอร์ม โดย rollout ปัจจุบัน Desktop Host สามารถรายงาน posture แบบ software-backed, OS-protected, OS-keychain, OS-attested หรือ hardware-attested ตามความสามารถของอุปกรณ์และ deployment

## Rollout gates

หาก gate ที่จำเป็นยังไม่ครบ ควรถือว่า rollout ของ Desktop Host ยังไม่พร้อม

แผง rollout gate จะติดตาม:

- ความพร้อมของ device binding
- การบังคับ signed packages
- การตรวจสอบ signed updates
- การใช้ managed file roots เป็นค่าเริ่มต้น
- Pi startup แบบ gateway-only
- Agency Swarm startup แบบ gateway-only
- ความพร้อมของ offboarding cleanup

ถ้า gate ไหนยังไม่ผ่าน อย่าถือว่า desktop execution อยู่ในสถานะ managed แบบสมบูรณ์

## Local roots

local roots คือโฟลเดอร์ที่ผู้ใช้อนุมัติให้ Desktop Host ใช้สำหรับ indexing หรือ governed file access

action ที่ทำได้จากหน้า governance:

- **Reindex root** เพื่อรีเฟรช metadata และ search state
- **Purge derived store** เพื่อลบ preview, index หรือ derived analysis ของ root นั้น
- **Revoke root** เพื่อลบ root นั้นออกจาก managed access บนอุปกรณ์

แนวทางที่แนะนำ:

- อนุมัติเฉพาะ root ที่เล็กที่สุดแต่เพียงพอกับงาน
- แยก root ตามทีม แผนก หรือโปรเจกต์ที่อ่อนไหว
- ถอน root ที่ไม่ใช้งานแล้ว แทนการปล่อยสิทธิ์กว้างค้างไว้

## Package sync และ trust classes

Desktop Host สามารถ sync signed packages ลงเครื่องเพื่อใช้กับ managed local execution

trust classes ของ package:

| Trust class | ความหมาย |
|---|---|
| `built_in_verified` | แพ็กเกจที่แพลตฟอร์มจัดให้และยืนยันแล้ว |
| `org_verified` | แพ็กเกจที่องค์กรของคุณเซ็นและอนุมัติ |
| `local_unverified` | แพ็กเกจ local ที่ยังไม่ควรถูกถือว่า trusted สำหรับ managed use โดยอัตโนมัติ |
| `project_local` | แพ็กเกจที่ผูกกับโปรเจกต์หรือ workflow เฉพาะ |

package state อาจเป็น `trusted`, `restricted`, `quarantined`, `blocked`, `revoked`, `requires_review` และ `incompatible`

ใน managed mode เส้นทางหลักควรเป็น signed packages ส่วน `local_unverified` ควรถูกมองว่าเป็นกรณีพิเศษที่ต้องระวัง

## Workspace และ network posture

Desktop Host จะรายงาน workspace profile ที่มีผลจริงบนอุปกรณ์ เพื่ออธิบายว่าระบบกำลังเปิด local runtime แบบใด

profile ที่พบบ่อย:

- `standard_managed`
- `advanced_local`
- `indexing_worker`
- `connector_helper`
- `pi_sidecar_managed`
- `agency_swarm_managed`

network posture อาจเป็น:

- `gateway_only`
- `server_only`
- `approved_connectors_only`
- `approved_public_web`
- `unrestricted_advanced_local`

ถ้าต้องการ governance ที่เข้ม ควรใช้ `gateway_only` และ managed writeback modes เป็นค่าเริ่มต้น

## การ disable อุปกรณ์และ offboarding

แอดมินและ domain admin สามารถ disable desktop device จากหน้า governance ได้

การ disable มีไว้เพื่อ:

- กันไม่ให้อุปกรณ์ผ่าน managed execution gates หลัง policy refresh รอบถัดไป
- นัดหมาย cleanup ของ package cache และ local materialization ที่ถูกกำกับดูแล
- รองรับ offboarding หรือ incident response โดยไม่ต้องรอผู้ใช้ทำเอง

ควรใช้ disable เมื่อ:

- เครื่องสูญหาย
- ผู้รับเหมาหรือพนักงานออกจากงาน
- อุปกรณ์ไม่ผ่าน compliance
- ต้องหยุด local execution ทันทีระหว่างรอตรวจสอบ

## Desktop handoff จากเว็บ

บางหน้าจะส่งงานจากเว็บไปเปิดต่อในแอปเดสก์ท็อป คุณอาจเห็น action เช่น:

- **Open in Desktop**
- **View on Web**
- launch link สำหรับ runs, projects, skills หรือ agencies

ถ้าหน้า handoff เปิดขึ้นมาแล้วแอปเดสก์ท็อปไม่เด้ง ให้ดูคำแนะนำใน [Desktop Host Managed Mode](./desktop-host-managed-mode.md)

## Desktop releases

ตัวติดตั้งของ Desktop Host ถูกเผยแพร่ผ่าน flow ของ Desktop Releases

- ผู้ใช้ทั่วไปดาวน์โหลดตัวติดตั้งที่เผยแพร่ล่าสุดได้จาก release panel บน dashboard
- แอดมินอัปโหลด เผยแพร่ ยกเลิกเผยแพร่ หรือลบ installer ได้จากหน้า desktop governance

ดูขั้นตอนเต็มใน [Desktop Releases](./desktop-releases.md)

## ข้อควรทราบด้านความปลอดภัย

- device enrollment ควรอิง proof-of-possession
- ใน managed rollout ควรเปิด signed package verification ตลอด
- signed update verification ควรถูกบังคับใช้งาน
- local roots ควรเป็นแบบ explicit และเพิกถอนได้
- device ที่ถูก disable ต้องไม่ผ่าน managed execution หลัง refresh
- desktop runs ต้องคง truthful labels ไว้ ไม่ควรถูกรีแบรนด์เป็น local ทั้งหมดโดยอัตโนมัติ

## การแก้ปัญหาเบื้องต้น

### ไม่เห็น Desktop Host ใน Settings

- ตรวจว่า tenant feature flag ถูกเปิดแล้ว
- ตรวจว่า role และ rollout ของ tenant อนุญาต Desktop Host

### อุปกรณ์ขึ้น offline หรือ unhealthy

- เปิดแอปเดสก์ท็อปเพื่อให้เชื่อมต่อใหม่
- ตรวจว่าการ refresh policy สำเร็จ
- ถ้าอุปกรณ์ถูก disable แล้ว จะยังถูกบล็อกอยู่จนกว่าจะถูกเปิดใหม่จาก governance

### Package sync ยังไม่ ready

- ตรวจว่า tenant เปิด signed package sync แล้ว
- รอรอบ sync ถัดไปหลังลงทะเบียนอุปกรณ์
- ตรวจว่าแพ็กเกจไม่ได้อยู่ในสถานะ quarantined, incompatible หรือ requires review

### local root ยังไม่เจอไฟล์ที่ต้องการ

- สั่ง reindex root
- ตรวจว่าโฟลเดอร์ยังอยู่บนอุปกรณ์จริง
- ถ้า consent หรือ policy เปลี่ยน ให้ revoke แล้วเพิ่ม root ใหม่

### Desktop handoff เปิดแอปไม่สำเร็จ

- ลองเปิด launch link ใหม่จากหน้า handoff
- ตรวจว่าแอปเดสก์ท็อปถูกติดตั้งแล้ว
- ใช้ release portal หรือคู่มือติดตั้งถ้าต้องการตัวติดตั้งใหม่

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[browser-session|Browser Session]]
- [[cli|CLI (Kilo)]]
- [[desktop-host-managed-mode|Desktop Host Managed Mode]]
- [[desktop-releases|Desktop Releases]]
- [[docker-sandbox|Docker Sandbox]]
<!-- knowledge-graph:related:end -->
