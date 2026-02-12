# Document Management UI Improvements

## Summary
ปรับปรุงหน้า Document Management ให้มีปุ่มยุบ/ขยาย panel ที่สวยงามและใช้งานง่ายขึ้น

## Changes Made

### 1. **Left Panel (Library)** - ปรับปรุงแล้ว ✅

#### Expanded State:
- เพิ่ม transition animation (duration-300)
- ปุ่มยุบใช้ `ChevronsLeft` icon แทน `PanelLeftClose`
- เพิ่ม hover effect และ transition-colors

#### Collapsed State:
- ปุ่มขยายใหญ่ขึ้น (12x12)
- ใช้ gradient background (sky-50 to white)
- เพิ่ม shadow-lg และ hover effects
- ใช้ `ChevronsRight` icon สีฟ้า
- เพิ่ม scale animation เมื่อ hover (hover:scale-105)

### 2. **Center Panel (Editor)** - ปรับปรุงแล้ว ✅

#### Expanded State:
- เพิ่ม transition animation
- ปรับปุ่มควบคุม panel ซ้าย/ขวาให้ชัดเจนขึ้น
- ใช้ `ChevronsLeft` สำหรับยุบ Library (ซ้าย)
- ใช้ `ChevronsRight` สำหรับยุบ Preview (ขวา)
- Badge "Unsaved changes" ใช้ rounded-full แทน rounded
- เพิ่ม hover:bg-slate-100 และ transition-colors

#### Collapsed State (ใหม่!):
- **เพิ่มปุ่มขยาย** เมื่อ panel ถูกยุบ (ก่อนหน้านี้ไม่มี)
- ปุ่มใช้ `FileText` icon
- Gradient background (slate-50)
- Shadow และ hover effects เหมือน panels อื่น
- Center panel จะใช้พื้นที่เต็มเมื่อถูกยุบ

### 3. **Right Panel (Markdown Preview)** - ปรับปรุงแล้ว ✅

#### Expanded State:
- เพิ่ม transition animation
- ปุ่มยุบใช้ `ChevronsRight` แทน `PanelRightClose`
- เพิ่ม hover effect
- ปุ่มขยาย Editor (เมื่อ Editor ถูกยุบ) ใช้ `ChevronsLeft` icon ขนาดใหญ่ขึ้น

#### Collapsed State:
- ปุ่มขยายใหญ่ขึ้น (12x12)
- ใช้ gradient background (cyan-50 to white)
- เพิ่ม shadow-lg และ hover effects
- ใช้ `ChevronsLeft` icon สีฟ้าเข้ม
- เพิ่ม scale animation เมื่อ hover

### 4. **Header Controls** - ปรับปรุงแล้ว ✅

- **ลบปุ่ม toggle ออกจาก header** (Hide Library / Show Library, Hide MD Preview / Show MD Preview)
- ตอนนี้ควบคุม panels ผ่านปุ่มใน panels เองทั้งหมด
- Header เหลือแต่ปุ่ม Upload และ New Document เท่านั้น

## Visual Improvements

### Color Scheme:
- **Left Panel (Library)**: Sky blue gradient (sky-200 border, sky-50/600 colors)
- **Center Panel (Editor)**: Slate gray (neutral)
- **Right Panel (Preview)**: Cyan gradient (cyan-200 border, cyan-50/600 colors)

### Consistency:
- ทุก panel ใช้ rounded-2xl หรือ rounded-3xl
- ทุก panel มี transition-all duration-300
- ปุ่มยุบทั้งหมดใช้ Chevrons icons (Left/Right)
- ปุ่มขยายทั้งหมดใช้ขนาด 12x12 พร้อม gradient และ shadow

### Animations:
- Smooth transitions (300ms) เมื่อยุบ/ขยาย
- Hover scale effect (hover:scale-105) บนปุ่มขยาย
- Shadow transitions (shadow-lg → shadow-xl)

## Functionality

### Panel States:
1. **ทั้งสาม panels เปิด**: Layout ปกติ (Library | Editor | Preview)
2. **Library ยุบ**: Editor และ Preview ใช้พื้นที่เต็ม
3. **Preview ยุบ**: Library และ Editor ใช้พื้นที่เต็ม
4. **Editor ยุบ**: Library และ Preview ใช้พื้นที่เต็ม
5. **ทั้งสาม panels ยุบ**: แสดงแต่ปุ่มขยายทั้งสาม

### Space Management:
- เมื่อยุบ side panels → Center panel ขยายเต็มพื้นที่
- เมื่อยุบ center panel → Side panels แบ่งพื้นที่กัน
- Responsive: มือถือแสดงแนวตั้ง, Desktop แสดงแนวนอน

## User Experience

### Before:
- ปุ่ม toggle กระจายอยู่ทั้ง header และ panels
- ไม่มีปุ่มขยาย Editor เมื่อถูกยุบ
- Icons ไม่สอดคล้องกัน (PanelLeft/Right vs Chevrons)
- ไม่มี visual feedback ชัดเจน

### After:
- ปุ่มควบคุมอยู่ใน panels ทั้งหมด (ไม่มีใน header)
- **ทุก panel มีปุ่มขยาย** เมื่อถูกยุบ
- Icons สอดคล้องกัน (Chevrons สำหรับทิศทาง)
- Visual feedback ชัดเจน (gradients, shadows, animations)
- ใช้งานง่าย - เห็นปุ่มได้ชัดเจนทุกครั้ง

## Technical Details

### State Variables:
- `isLibraryPanelOpen` - Left panel state
- `isEditorPanelCollapsed` - Center panel state (inverted logic)
- `isMarkdownPreviewPanelOpen` - Right panel state

### Icons Used:
- `ChevronsLeft` - ยุบไปซ้าย / ขยายจากขวา
- `ChevronsRight` - ยุบไปขวา / ขยายจากซ้าย
- `FileText` - Icon สำหรับ Editor panel

### CSS Classes:
```tsx
// Collapsed button style
className="h-12 w-12 rounded-2xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"

// Panel transition
className="... transition-all duration-300"

// Header button
className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors"
```

## Testing Checklist

- [x] Left panel ยุบ/ขยายได้
- [x] Center panel ยุบ/ขยายได้
- [x] Right panel ยุบ/ขยายได้
- [x] ปุ่มขยายแสดงเมื่อ panel ยุบ
- [x] Center panel ใช้พื้นที่เต็มเมื่อ side panels ยุบ
- [x] Animations นุ่มนวล
- [x] Icons สอดคล้องกัน
- [x] Hover effects ทำงาน
- [ ] ทดสอบบน mobile (responsive)
- [ ] ทดสอบ accessibility (keyboard navigation)

## Next Steps (Optional)

1. เพิ่ม keyboard shortcuts (Ctrl+B สำหรับ Library, Ctrl+P สำหรับ Preview)
2. จำสถานะ panels ใน localStorage
3. เพิ่ม tooltips ที่ละเอียดขึ้น
4. เพิ่ม animation เมื่อ resize panels
5. Support drag-to-resize panels

## Files Modified

- `apps/web/client/src/pages/DocumentManagement.tsx`
  - Updated left panel collapse button (line ~819)
  - Updated left panel expand button (line ~873-884)
  - Updated center panel controls (line ~892-943)
  - **Added center panel collapsed state** (line ~1044-1052) - ใหม่!
  - Updated right panel header (line ~1049-1079)
  - Updated right panel expand button (line ~1095-1106)
  - Removed header toggle buttons (line ~690-714)

## Result

✅ **หน้า Document Management ตอนนี้มี:**
- ปุ่มยุบ/ขยายที่สวยงามและใช้งานง่าย
- ทุก panel สามารถยุบ/ขยายได้อย่างอิสระ
- Center panel ใช้พื้นที่เต็มได้เมื่อยุบ side panels
- UI สอดคล้องและมี visual feedback ชัดเจน
- Smooth animations ทุกจุด
