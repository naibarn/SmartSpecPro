# Vertical Drama Reference-Guided Character Casting

## Goal

เพิ่มทางเลือกเฉพาะขั้นตอน Casting ของตัวละครใน Drama Series ให้ผู้ใช้แนบภาพอ้างอิงได้ แล้วให้ระบบเรียก skill `character-candidate-prompt` เพื่อสร้าง prompt สำหรับ candidate images จำนวน 1–5 ภาพ ผู้ใช้เลือกภาพหนึ่งภาพเป็น `primary_portrait` หรือสร้างชุดใหม่ได้ โดยภาพอ้างอิงเป็นเพียง guideline และผลลัพธ์ต้องเป็นบุคคลใหม่ ไม่ใช่บุคคลเดิมในภาพ

## Product behavior

- การแนบภาพอ้างอิงเป็น optional; หากไม่มีภาพ ให้ใช้ flow เดิม byte-compatible
- เมื่อมีภาพอ้างอิง ให้ส่งภาพที่แนบไว้ทั้งหมดที่ผ่าน ownership check เข้า skill สูงสุด 6 ภาพ
- UI แสดงตัวเลือกจำนวนภาพ 1–5, lock เสื้อผ้า, pose mode, camera framing และรายละเอียดเพิ่มเติมแบบ optional
- ค่าเริ่มต้นคือไม่ lock เสื้อผ้า, ท่าทางธรรมชาติ และ half-body
- รายละเอียดเพิ่มเติม เช่น ชุดนักเรียนไทย, เสื้อผ้าลำลองแนวสาวชนบท หรือท่ายืนเห็นรองเท้า ส่งเป็น `additional_instructions` โดยไม่บังคับกรอก
- skill รับข้อมูลตัวละครที่ authoritative จาก server และคืน plain-text prompt เท่านั้น
- prompt เดียวที่ได้จาก skill จะถูกใช้เป็น prompt ต้นทางของ image task แยกกันทีละ candidate จำนวนตามที่ผู้ใช้เลือก; แต่ละ task มี output 1 ภาพ ไม่สร้าง collage/grid/panel
- ภาพอ้างอิงถูกแนบกับ image task ด้วย เพื่อให้เป็น visual guidance จริง ไม่ใช่แค่ข้อมูลให้ LLM เขียน prompt
- candidate ยังเป็น draft จนกว่าผู้ใช้จะเลือก; การเลือกจะ promote เป็นภาพหลัก แต่จะไม่เขียน Character DNA จาก skill ใหม่นี้ เพราะ skill คืนเฉพาะ text prompt
- flow นี้ไม่เปลี่ยน look, character sheet, storyboard, variant/twin หรือ generation path อื่น

## Technical approach

สร้าง adapter ฝั่ง server สำหรับ skill `character-candidate-prompt` โดยใช้ skill registry, skill execution policy และ multimodal LLM fallback ที่มีอยู่แล้ว จากนั้นต่อเข้ากับ candidate batch, submission, polling และ selection ที่มีอยู่ การเรียกผ่าน chat router ไม่ใช้ เพราะไม่ควรผูก casting กับ conversation และการแก้ Visual Bible เดิมจะไม่เป็นการใช้ skill ตาม requirement

ข้อมูล reference จะส่งเข้า router เป็น asset-link IDs ไม่รับ URL จาก browser โดยตรง server จะตรวจ tenant/user/series/character ownership และ resolve provider-safe URLs เอง จากนั้นเก็บ reference IDs แบบ bounded ใน private candidate metadata เพื่อ resolve ซ้ำตอน submit image tasks

candidate metadata จะรองรับ `visualBibleSnapshot` แบบ optional เฉพาะ reference-guided casting และ selection จะเขียน `visualBible` เฉพาะ candidate เดิมที่มี snapshot เท่านั้น เมื่อไม่มี snapshot จะ promote ภาพและจบด้วยผลลัพธ์ primary portrait โดยไม่ทำลาย DNA เดิม

## Failure and safety behavior

- asset ที่ไม่ใช่ของ character/tenant ปัจจุบันถูกปฏิเสธแบบ fail-closed
- จำกัด reference สูงสุด 6 ภาพ, candidates สูงสุด 5 ภาพ, additional instructions ตาม bounded input contract
- skill output ว่างหรือเกินขนาด: ไม่สร้าง draft/image task และแสดง error ให้ retry
- skill ล้มเหลว: ไม่สร้าง candidate batch บางส่วน
- ถ้าไม่มี reference IDs ให้ route เดิมทำงานเหมือนก่อนหน้า
- reference URL ไม่ถูกเปิดเผยจาก client และต้อง resolve ใหม่ก่อน image generation

## Validation

เพิ่ม unit tests สำหรับ input builder, skill adapter, reference ownership/metadata flow, prompt-only candidate selection และ branch ที่ไม่มี reference รวมถึง UI tests สำหรับ copy, controls, disabled/loading states และ candidate count 1–5 ตรวจ `git diff --check` และรัน focused Vitest suites; browser/provider/deployment proof ต้องรายงานแยกหากไม่ได้รัน
