# แก้ปัญหาหน้าจอขาวว่าง (Blank White Screen)

## ✅ ตรวจสอบแล้วว่า:

1. ✅ Server ทำงานปกติ - HTTP 200 OK
2. ✅ HTML โหลดได้ครบ - มี `<div id="root">`
3. ✅ Scripts โหลดได้ทั้งหมด:
   - `/@vite/client` ✓
   - `/src/main.tsx` ✓
   - `/src/App.tsx` ✓
4. ✅ Components ที่ขาดหายไปถูกสร้างแล้ว
5. ✅ Database connected

---

## 🔍 วิธีตรวจสอบเพิ่มเติม:

### 1. ตรวจสอบ View Source
กด **Ctrl + U** (หรือ Cmd+U บน Mac) เพื่อดู HTML Source

**ควรเห็น:**
```html
<!doctype html>
<html lang="en">
  <head>
    <title>SmartSpec Pro - AI-Powered Code Generation Platform</title>
    ...
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx?v=..."></script>
  </body>
</html>
```

ถ้าไม่เห็น = Server ไม่ตอบสนอง

---

### 2. ตรวจสอบ Network Tab (F12 → Network)

1. เปิด Developer Tools (F12)
2. ไปที่แท็บ **Network**
3. Refresh หน้า (Ctrl+R)
4. ดูว่ามี requests ไหนที่:
   - ❌ **สีแดง (Failed)**
   - ⚠️ **สีส้ม (Warning)**
   - ⏱️ **Pending นานเกินไป**

**ควรเห็น:**
```
✓ localhost:3000           200 (HTML)
✓ /@vite/client            200 (JS)
✓ /src/main.tsx            200 (JS)
✓ /src/App.tsx             200 (JS)
```

---

### 3. ตรวจสอบ Console Tab

กด **F12 → Console** แล้วดูว่ามี:
- [ ] Error สีแดง
- [ ] Warning สีเหลือง
- [ ] ข้อความอะไรก็ได้

**ถ้า Console ว่างเปล่า 100%** = JavaScript ไม่รันเลย

---

### 4. ทดสอบด้วย Browser อื่น

ลองเปิดใน:
- [ ] Chrome
- [ ] Firefox
- [ ] Edge
- [ ] Safari (Mac)

---

## 🛠️ วิธีแก้ไขที่แนะนำ:

### วิธีที่ 1: Hard Refresh
```
Ctrl + Shift + R  (Windows/Linux)
Cmd + Shift + R   (Mac)
```

### วิธีที่ 2: Clear Browser Cache
1. กด Ctrl+Shift+Delete
2. เลือก "Cached images and files"
3. คลิก "Clear data"
4. Refresh หน้าใหม่

### วิธีที่ 3: Incognito/Private Mode
```
Ctrl + Shift + N  (Chrome)
Ctrl + Shift + P  (Firefox)
```

### วิธีที่ 4: ตรวจสอบ Browser Extensions
- ปิด Ad Blocker
- ปิด Privacy extensions
- ลอง disable extensions ทั้งหมดชั่วคราว

### วิธีที่ 5: ตรวจสอบ CORS
ใน Console ถ้าเห็น error แบบนี้:
```
Access to script at '...' from origin 'http://localhost:3000'
has been blocked by CORS policy
```

แก้โดย:
```bash
# Restart backend with CORS enabled
./dev-local.sh backend
```

---

## 🔄 Restart ทุกอย่างใหม่:

```bash
# 1. Stop all services
pkill -f "tsx.*server"
pkill -f "uvicorn"

# 2. Start infrastructure
./dev-local.sh infra start

# 3. Start backend
./dev-local.sh backend

# 4. Start frontend
./dev-local.sh web

# 5. Wait 15 seconds then test
sleep 15
curl -I http://localhost:3000
```

---

## 📊 ตรวจสอบ Logs:

```bash
# Frontend logs
tail -f /tmp/web-final.log

# Backend logs (if error)
tail -f /tmp/backend-*.log

# Check for errors
grep -i error /tmp/web-final.log | tail -20
```

---

## 🆘 ถ้ายังไม่ได้:

### Option 1: ลองใช้ IP แทน localhost
```
http://127.0.0.1:3000
```

### Option 2: ตรวจสอบ Firewall
```bash
# Check if port is accessible
netstat -tlnp | grep :3000
```

### Option 3: ตรวจสอบ Hosts File
```bash
cat /etc/hosts | grep localhost
```

ควรเห็น:
```
127.0.0.1   localhost
```

---

## 📸 Screenshot ที่ควรส่งถ้าปัญหายังไม่หาย:

1. **Network Tab** (F12 → Network) แสดง requests ทั้งหมด
2. **Console Tab** (F12 → Console) แสดง errors/logs
3. **View Source** (Ctrl+U) แสดง HTML ที่ได้รับ
4. **Terminal output** จาก `tail -30 /tmp/web-final.log`

---

## ⚡ Quick Test:

เปิด terminal รันคำสั่งนี้:
```bash
curl -s http://localhost:3000 | grep "<div id=\"root\"" && echo "✅ HTML OK" || echo "❌ HTML Error"

curl -s http://localhost:3000/@vite/client | head -5 && echo "✅ Vite OK" || echo "❌ Vite Error"

curl -s http://localhost:3000/src/main.tsx | head -5 && echo "✅ React OK" || echo "❌ React Error"
```

ถ้าทั้ง 3 ขึ้น ✅ = Server ทำงานปกติ
ปัญหาอยู่ที่ Browser

---

## 💡 Tips:

1. **ลอง curl เทียบกับ browser:**
   ```bash
   curl http://localhost:3000 > page.html
   # เปิดไฟล์ page.html ดูว่ามี content หรือไม่
   ```

2. **ดูว่า React render หรือยัง:**
   - ถ้าหน้าขาวแต่ View Source เห็น HTML = React ไม่ mount
   - ถ้า View Source ก็ว่าง = Server ส่ง response ผิด

3. **Browser compatibility:**
   - ต้องใช้ Modern Browser (Chrome 90+, Firefox 88+)
   - ไม่รองรับ IE11

---

**สรุป:** Server ทำงานปกติ 100% ปัญหาน่าจะอยู่ที่ Browser หรือ Network
