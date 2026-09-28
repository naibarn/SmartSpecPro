# Section 01 — Safety Detector and Evidence Contract

## Goal

ทำให้การตัดสิน policy ใช้ evidence ของ story intent ที่ถูก field และไม่ตีความ substring ไทยข้ามขอบคำเป็น dangerous content

## Changes

1. สร้าง typed safety segments: authored synopsis/dialogue/action, generated prompt, metadata, policy instructions
2. รวม marker/rule registry และ boundary-aware matcher ไว้ใน `verticalDramaStorySafety.ts`
3. ทุก high-risk finding ต้องมี source, field path, shot, matched rule, confidence, detector version และ bounded evidence
4. แยก `policy_blocked` กับ `detector_uncertain`; uncertainty ยังหยุด media แต่เปิด review path
5. audit callsites ให้ไม่ scan raw full prompt หรือ duplicated metadata เป็น authority โดยไม่จำเป็น

## Invariants

- genuine high-risk story ยัง block
- benign Thai word joins เช่น `ประกาศพัก` ไม่ block
- metadata ไม่สามารถเพิ่ม severity เองโดยไม่มี authored support
- input และ evidence มี size/retention limit

## Proof

Unit, property, callsite coverage และ incident replay ต้องผ่านก่อน phase ถัดไป; ห้ามใช้ provider ใน proof
