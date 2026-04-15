# Unified Slip Parser Skill - Complete

แพ็กนี้เป็นเวอร์ชันที่ใส่ทั้ง **specific parsers** และ **generic parsers** แล้ว

## มีอะไรเพิ่มจากเวอร์ชันก่อน
- parser router
- parser registry
- specific parsers สำหรับ KTB / BAY / SCB / TTB / TrueMoney / Paotang
- generic fallback parsers:
  - generic parser
  - generic bank parser
  - generic wallet parser
  - generic gov app parser
- CLI สำหรับลอง parse input json ทันที

## บทบาทของแต่ละส่วน
- `detectors.py` = ตรวจว่า slip นี้ออกโดยใคร และเป็น transaction แบบไหน
- `router.py` = เลือกว่า should use parser ตัวไหน
- `parsers/*.py` = ดึง field ตามลักษณะของ issuer แต่ละค่าย
- `extractors.py` = ฟังก์ชันกลางสำหรับ regex / line parsing / amount / date / reference
- `normalizers.py` = normalize ข้อความ, วันที่ไทย, ค่าเงิน, compatibility mapping

## รองรับการทำงานแบบ auto
1. ถ้ามีทั้ง OCR + image -> ใช้ multimodal heuristic
2. ถ้ามี OCR อย่างเดียว -> ใช้ text detection
3. ถ้ามี image อย่างเดียว -> ใช้ filename + dominant color heuristic
4. ถ้าระบุ issuer ไม่ชัด -> ใช้ generic parser ตาม issuer_type ที่คาดเดาได้
5. ถ้ายังไม่ชัด -> ใช้ `GenericSlipParser`

## ข้อจำกัดที่ควรรู้
- image-only extraction แบบไม่มี OCR จะดึง field ได้จำกัด
- issuer detection จากภาพล้วนในแพ็กนี้เป็น heuristic, ยังไม่ใช่ deep vision model
- แนะนำให้มี OCR หรือ short_caption เสมอถ้าต้องการ extraction ละเอียด

## Quick start

### Parse from JSON
```bash
python -m unified_slip_parser.cli --input examples/ktb_bill_payment.input.json
```

### Parse from inline OCR
```bash
python -m unified_slip_parser.cli --ocr "Krungthai กรุงไทย จ่ายบิลสำเร็จ รหัสอ้างอิง C20250505512519614446 ..."
```

### Output
จะได้ JSON รูปแบบเดียวกันทุก issuer