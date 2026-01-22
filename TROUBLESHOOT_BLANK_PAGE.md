# แก้ปัญหาหน้าจอว่างเปล่าบน HTTPS

## อาการ
- เข้า http://smartspec.local → redirect ไป https://smartspec.local ✓
- แต่หน้า https://smartspec.local แสดงหน้าว่าง (blank page)
- ไม่มี error แสดง แต่ไม่มีอะไรขึ้น

## สาเหตุ
Browser block SSL certificate ที่ยังไม่ได้ trust ทำให้:
1. HTML โหลดได้ แต่ JavaScript/CSS ไม่ทำงาน
2. Mixed content warnings
3. CORS errors

## วิธีแก้ (ทำตามลำดับ)

### ขั้นตอนที่ 1: เปิด Browser Console

กด **F12** ดู Console tab จะเห็น errors เช่น:
```
Mixed Content: The page at 'https://smartspec.local/' was loaded over HTTPS, but requested an insecure...
```
หรือ
```
ERR_CERT_AUTHORITY_INVALID
```

### ขั้นตอนที่ 2: Trust SSL Certificate

#### วิธีที่ 1: ใช้ Certificate Manager (แนะนำที่สุด)

**Windows:**
1. กด `Windows + R`
2. พิมพ์: `certmgr.msc` → Enter
3. ไปที่: **Trusted Root Certification Authorities** → **Certificates**
4. Right-click ที่ "Certificates" → **All Tasks** → **Import...**
5. Browse ไปที่: `h:\projects\SmartSpecPro\nginx\ssl\smartspec.local.crt`
6. Next → Next → Finish
7. ควรเห็น: "The import was successful"

**ตรวจสอบ:**
- Certificate ชื่อ "smartspec.local" ควรอยู่ใน list
- Issued by: smartspec.local
- Expires: (1 year from creation)

#### วิธีที่ 2: ใน Chrome/Edge (ทำทีละ browser)

1. เปิด: `chrome://settings/certificates`
2. ไปที่ tab **Authorities**
3. คลิก **Import**
4. เลือก: `h:\projects\SmartSpecPro\nginx\ssl\smartspec.local.crt`
5. เช็ค: ☑ **Trust this certificate for identifying websites**
6. OK

#### วิธีที่ 3: ใน Firefox

1. Settings → Privacy & Security
2. Certificates → **View Certificates**
3. Tab **Authorities** → **Import**
4. เลือก certificate file
5. เช็ค: ☑ **Trust this CA to identify websites**
6. OK

### ขั้นตอนที่ 3: Clear Browser Cache

**Chrome/Edge:**
```
Ctrl + Shift + Delete
→ เลือก: Cached images and files
→ Time range: All time
→ Clear data
```

**Firefox:**
```
Ctrl + Shift + Delete
→ เลือก: Cache
→ Time range: Everything
→ Clear Now
```

### ขั้นตอนที่ 4: Restart Browser

⚠️ **สำคัญมาก**: ต้อง **ปิด browser ทั้งหมด**
- ปิดทุก window
- ตรวจสอบใน Task Manager ว่าไม่มี chrome.exe หรือ firefox.exe รันอยู่
- เปิดใหม่

### ขั้นตอนที่ 5: ทดสอบ

1. เปิด browser ใหม่
2. เข้า: `https://smartspec.local`
3. **ควรเห็น:**
   - 🔒 Lock icon สีเขียวในแถบ address
   - หน้าเว็บโหลดปกติ
   - ไม่มี SSL warning
   - JavaScript ทำงาน

4. **กด F12 ดู Console:**
   - ไม่ควรมี red errors
   - ไม่มี mixed content warnings

## การทดสอบเพิ่มเติม

### Test 1: ตรวจสอบ Certificate

```bash
# เปิด browser ไป: https://smartspec.local
# คลิกที่ lock icon → Certificate
# ควรเห็น:
Subject: CN=smartspec.local
Issuer: CN=smartspec.local
Valid: Yes (ถ้า trusted แล้ว)
```

### Test 2: Test ด้วย curl

```bash
curl -k -I https://smartspec.local
# ควรได้: HTTP/1.1 200 OK
```

### Test 3: ตรวจสอบ nginx logs

```bash
docker logs smartspec-nginx-ssl --tail 20
# ไม่ควรมี SSL errors
```

## ปัญหาที่พบบ่อย

### 1. ยัง Trust Certificate แล้วแต่ยังเห็น Warning

**สาเหตุ:** Import ผิดที่
**แก้ไข:** ต้อง import ไปที่ **Trusted Root Certification Authorities** เท่านั้น ไม่ใช่ Personal หรือ Intermediate

### 2. Firefox ทำงานแต่ Chrome ไม่ทำงาน

**สาเหตุ:** Firefox ใช้ certificate store ของตัวเอง
**แก้ไข:** ต้อง import certificate แยกใน Firefox

### 3. ยัง Mixed Content Warning

**สาเหตุ:** ยังมี HTTP config ทำงานอยู่
**ตรวจสอบ:**
```bash
docker exec smartspec-nginx-ssl sh -c "ls /etc/nginx/conf.d/"
# ควรเห็นเฉพาะ:
# - ssl.conf
# - docker-subdomain-ssl.conf
# ไฟล์อื่นควร .disabled
```

### 4. Page ยังว่างหลัง Trust Certificate

**แก้ไข:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh: `Ctrl + F5`
3. ลอง incognito/private window
4. ตรวจสอบ Console errors (F12)

### 5. ERR_SSL_PROTOCOL_ERROR

**สาเหตุ:** nginx ไม่ listen port 443 หรือ SSL config ผิด
**แก้ไข:**
```bash
# เช็ค nginx status
docker ps | grep nginx

# เช็ค nginx logs
docker logs smartspec-nginx-ssl

# Test config
docker exec smartspec-nginx-ssl nginx -t
```

## Verification Checklist

ใช้ checklist นี้เพื่อตรวจสอบว่าทุกอย่างถูกต้อง:

- [ ] Certificate imported ใน Trusted Root CA
- [ ] Browser restarted (ปิดทุก window)
- [ ] Cache cleared
- [ ] เข้า https://smartspec.local เห็น lock icon 🔒
- [ ] ไม่มี SSL warning
- [ ] หน้าเว็บโหลดเต็ม (ไม่ว่าง)
- [ ] Console (F12) ไม่มี red errors
- [ ] Images/CSS/JS โหลดครบ
- [ ] Login ได้
- [ ] ไปที่ https://docker.smartspec.local ได้

## Still Not Working?

ถ้ายังไม่ได้หลังทำทุกขั้นตอน:

### Debug Steps:

1. **ดู Console Errors:**
   ```
   F12 → Console tab
   Screenshot errors และดูว่ามี:
   - Certificate errors?
   - Mixed content?
   - CORS errors?
   - JavaScript errors?
   ```

2. **ดู Network Tab:**
   ```
   F12 → Network tab → Refresh page
   ดูว่าไฟล์ไหน:
   - Failed to load (red)?
   - Blocked?
   - 403/404 errors?
   ```

3. **Test ใน Incognito Mode:**
   ```
   Ctrl + Shift + N (Chrome)
   Ctrl + Shift + P (Firefox)

   ถ้าทำงานใน incognito แสดงว่าปัญหาอยู่ที่:
   - Browser cache
   - Extensions
   - Old certificates
   ```

4. **Test Browser อื่น:**
   - ถ้า Chrome ไม่ได้ ลอง Firefox
   - ถ้า Firefox ไม่ได้ ลอง Edge
   - ถ้าทุก browser ไม่ได้ → ปัญหาอยู่ที่ nginx/backend

5. **Check nginx logs:**
   ```bash
   docker logs smartspec-nginx-ssl -f
   # Refresh browser page
   # ดู requests ที่เข้ามา
   ```

6. **Check backend logs:**
   ```bash
   docker logs smartspec-web -f
   # ดู errors จาก Vite dev server
   ```

## Quick Fix: Bypass SSL Validation (Development Only)

⚠️ **ใช้เฉพาะ development เท่านั้น!**

ถ้าต้องการใช้งานด่วนโดยไม่ trust certificate:

**Chrome:**
```
เปิด: https://smartspec.local
เห็น warning → คลิก "Advanced"
→ คลิก "Proceed to smartspec.local (unsafe)"
```

**Firefox:**
```
เปิด: https://smartspec.local
เห็น warning → คลิก "Advanced"
→ คลิก "Accept the Risk and Continue"
```

⚠️ **หมายเหตุ:** วิธีนี้ต้องทำทุกครั้งที่เปิด browser ใหม่ แนะนำให้ trust certificate แทน

## Alternative: ใช้ HTTP (ไม่แนะนำ)

ถ้าไม่อยากจัดการ HTTPS สามารถกลับไปใช้ HTTP:

```bash
# Enable HTTP configs
mv nginx/conf.d/default.conf.disabled nginx/conf.d/default.conf
mv nginx/conf.d/docker-subdomain.conf.disabled nginx/conf.d/docker-subdomain.conf

# Disable SSL configs
mv nginx/conf.d/ssl.conf nginx/conf.d/ssl.conf.disabled
mv nginx/conf.d/docker-subdomain-ssl.conf nginx/conf.d/docker-subdomain-ssl.conf.disabled

# Restart nginx
docker restart smartspec-nginx-ssl
```

⚠️ **ข้อเสีย:** ยังเจอ login loop เหมือนเดิม เพราะ cookies ไม่ทำงานกับ HTTP

## Contact & Resources

- [SSL_SETUP_GUIDE.md](SSL_SETUP_GUIDE.md) - Complete SSL guide
- [NEXT_STEPS.md](NEXT_STEPS.md) - Setup instructions
- [HTTPS_QUICK_START.md](HTTPS_QUICK_START.md) - Quick reference
