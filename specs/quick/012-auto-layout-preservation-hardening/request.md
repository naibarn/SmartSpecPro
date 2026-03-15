## Request

ทำให้ Auto Layout ทำงานสัมพันธ์กับ Draft with AI และ slide รุ่น component/block-based โดยป้องกันภาพหาย, block หาย, วิดีโอหาย, ข้อความหาย และยังคงคุณภาพ layout ที่ดูดี

## Task Summary

Auto Layout (`relayoutExistingSlide`) ต้องรองรับ slide content รุ่นใหม่ที่อาจมี:
- `components` + `fallbackElements`
- หลาย media source (image/video)
- AI recipe metadata จาก Draft with AI
- preserved user-added media/graphics

## Constraints

- ห้ามทำให้ `Draft with AI` regression กลับไปพังเรื่อง schema validation
- ต้องรักษา behavior เดิมของ component recipes ที่มี test coverage อยู่แล้ว
- เน้น no-silent-drop: ถ้า preserve ไม่ได้ ต้องมี fallback/warning ที่ deterministic

## Assumptions

- เป้าหมายแรกคือรักษา content fidelity ระหว่าง Auto Layout ไม่ใช่ redesign pipeline ทั้งระบบ
- การ preserve แบบ visual fallback ยอมรับได้ถ้ายังไม่สามารถรักษา first-class component editability ได้ครบทุกเคส

