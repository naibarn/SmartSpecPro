# PtyXterm.tsx Comparison Analysis

## ไฟล์ใหม่ที่แนบมา (ดีกว่า)

### Performance Improvements:
1. **Write Batching with RAF** - ใช้ requestAnimationFrame batch writes ลดกระตุก
2. **WebGL Addon** - รองรับ hardware acceleration
3. **ResizeObserver** - ลื่นกว่า window.resize + timeout
4. **Queue Management** - ป้องกัน queue โตเกิน (splice เมื่อ > 5000)

### UI Improvements:
1. **Modern Theme** - รองรับ light/dark mode ตาม system preference
2. **Header Bar** - มี traffic light buttons (macOS style)
3. **Copy/Clear Buttons** - ใช้งานง่าย
4. **Backdrop Blur** - glassmorphism effect
5. **Transparent Background** - กลืนกับ UI

### Missing from New File:
1. ไม่มี ANSI color theme ครบ (black, red, green, etc.)
2. ไม่มี displayName

## ไฟล์เดิม (บางส่วนดี)

### ดี:
1. **Full ANSI Color Theme** - มีสีครบทุกสี
2. **displayName** - ดีสำหรับ debugging

### ไม่ดี:
1. ใช้ setTimeout + window.resize (ช้ากว่า ResizeObserver)
2. ไม่มี write batching (กระตุกเมื่อ output เยอะ)
3. มี console.log เยอะ (ควรลบ)

## Plan: รวมส่วนดีทั้งสอง

1. ใช้ base จากไฟล์ใหม่ (performance + UI)
2. เพิ่ม ANSI color theme จากไฟล์เดิม
3. เพิ่ม displayName
4. ลบ console.log ที่ไม่จำเป็น
