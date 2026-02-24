# ✅ Nginx Setup Complete - SmartSpecPro

**วันที่:** 2026-01-27
**Status:** ✅ ใช้งานได้แล้ว

---

## 🎯 สิ่งที่ติดตั้งเสร็จแล้ว:

### 1. **Nginx Reverse Proxy**
- ✅ ติดตั้ง nginx version 1.26.3
- ✅ Listen บน port 80 (HTTP) และ 443 (HTTPS)
- ✅ Redirect HTTP → HTTPS อัตโนมัติ
- ✅ Proxy requests ไปยัง SmartSpecWeb (port 3000)
- ✅ Proxy `/api/*` ไปยัง Python Backend (port 8000)

### 2. **SSL Certificate**
- ✅ สร้าง Self-Signed Certificate สำหรับ development
- ✅ รองรับ domains: smartspec.local, smartspec.localhost, localhost
- ✅ รองรับ IP: 192.168.1.118
- ✅ อายุ 365 วัน

### 3. **Security Headers**
- ✅ X-Frame-Options: SAMEORIGIN
- ✅ X-Content-Type-Options: nosniff
- ✅ X-XSS-Protection: 1; mode=block
- ✅ SSL/TLS Configuration (TLS 1.2, 1.3)

### 4. **Features**
- ✅ HTTP/2 Support
- ✅ WebSocket Support (สำหรับ real-time features)
- ✅ Gzip Compression
- ✅ File Upload สูงสุด 100MB

---

## 🌐 วิธีเข้าใช้งาน (ไม่ต้องระบุ port แล้ว!)

### จากเครื่อง Server (localhost):
```bash
# HTTP (จะ redirect ไป HTTPS อัตโนมัติ)
http://localhost

# HTTPS (แนะนำ)
https://localhost
```

### จากเครื่องอื่นใน Network:

#### **วิธีที่ 1: ใช้ IP Address** (ใช้ได้ทันที)
```
https://192.168.1.118
```

#### **วิธีที่ 2: ใช้ Domain Name** (ต้องตั้งค่า hosts file)

**Windows:**
1. เปิด Notepad **as Administrator**
2. เปิดไฟล์: `C:\Windows\System32\drivers\etc\hosts`
3. เพิ่ม:
   ```
   192.168.1.118  smartspec.local
   192.168.1.118  smartspec.localhost
   ```
4. Save (Ctrl+S)

**macOS/Linux:**
```bash
sudo nano /etc/hosts

# เพิ่ม:
192.168.1.118  smartspec.local
192.168.1.118  smartspec.localhost

# บันทึก: Ctrl+O, Enter, Ctrl+X
```

จากนั้นเปิด Browser:
```
https://smartspec.local
https://smartspec.localhost
```

---

## 🔐 Certificate Warning

เมื่อเปิดครั้งแรก Browser จะแสดง **"Your connection is not private"** หรือ **"Not Secure"**

**สาเหตุ:** ใช้ Self-Signed Certificate (ไม่ได้มาจาก Certificate Authority ที่ browser รู้จัก)

### วิธีแก้:

#### **Chrome:**
1. เมื่อเห็นหน้า "Your connection is not private"
2. คลิก **"Advanced"**
3. คลิก **"Proceed to smartspec.local (unsafe)"**

#### **Firefox:**
1. เมื่อเห็นหน้า "Warning: Potential Security Risk Ahead"
2. คลิก **"Advanced..."**
3. คลิก **"Accept the Risk and Continue"**

#### **Edge:**
1. เมื่อเห็นหน้า "Your connection isn't private"
2. คลิก **"Advanced"**
3. คลิก **"Continue to smartspec.local (unsafe)"**

**หมายเหตุ:** การข้ามคำเตือนนี้ปลอดภัยสำหรับ development เพราะเป็น server ของคุณเอง

---

## 📋 ข้อมูล Login

```
URL:      https://192.168.1.118
          หรือ https://smartspec.local

Email:    admin@smartspec.pro
Password: Admin@123!
Credits:  100,000
Role:     Admin
Plan:     ENTERPRISE
```

---

## 🔧 Nginx Configuration

### ไฟล์ตำแหน่ง:
- **Main Config:** `/etc/nginx/sites-available/smartspec`
- **Enabled Symlink:** `/etc/nginx/sites-enabled/smartspec`
- **SSL Certificate:** `/etc/ssl/certs/smartspec.crt`
- **SSL Key:** `/etc/ssl/private/smartspec.key`

### คำสั่ง Nginx:

```bash
# Restart nginx
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx

# Test configuration
sudo nginx -t

# Reload configuration (ไม่ต้อง restart)
sudo systemctl reload nginx

# View logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 🚀 Architecture

```
┌─────────────┐
│   Browser   │
│ (External)  │
└─────┬───────┘
      │ HTTPS
      │ Port 443
┌─────▼───────────────┐
│   Nginx Reverse     │
│   Proxy (Server)    │
│   192.168.1.118     │
└──┬──────────────┬───┘
   │              │
   │ HTTP:3000    │ HTTP:8000
   │              │
┌──▼──────┐   ┌──▼──────────┐
│ SmartSpec│   │ Python      │
│ Web      │   │ FastAPI     │
│ (Node.js)│   │ Backend     │
└──────────┘   └─────────────┘
       │              │
       └──────┬───────┘
              │
     ┌────────▼─────────┐
     │   PostgreSQL     │
     │   Database       │
     └──────────────────┘
```

### Request Flow:
1. **Client** → HTTPS Request → `https://192.168.1.118`
2. **Nginx** → SSL Termination → Decrypt HTTPS
3. **Nginx** → Proxy Pass → `http://localhost:3000` (Frontend)
4. **Nginx** → Proxy Pass → `http://localhost:8000` (API requests to `/api/*`)
5. **Backend/Frontend** → PostgreSQL Database

---

## 🧪 การทดสอบ

### Test 1: HTTP Redirect
```bash
curl -I http://192.168.1.118
# Expected: 301 Moved Permanently
# Location: https://192.168.1.118/
```

### Test 2: HTTPS Connection
```bash
curl -I -k https://192.168.1.118
# Expected: HTTP/2 200
# Server: nginx
```

### Test 3: API Backend
```bash
curl -k https://192.168.1.118/api/health
# Expected: {"status": "healthy"}
```

### Test 4: Frontend
```bash
curl -k https://192.168.1.118 | grep "SmartSpec"
# Expected: HTML with SmartSpec content
```

---

## 🔥 Firewall (ถ้ามี)

หากมี firewall ให้เปิด ports:

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload

# iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables-save
```

---

## 📊 Service Status

| Service | Status | Port | Description |
|---------|--------|------|-------------|
| **Nginx** | ✅ Running | 80, 443 | Reverse proxy + SSL |
| **SmartSpecWeb** | ✅ Running | 3000 | Frontend (Node.js) |
| **Python Backend** | ✅ Running | 8000 | API (FastAPI) |
| **PostgreSQL** | ✅ Running | 5432 | Database |
| **Redis** | ✅ Running | 6379 | Cache |

---

## ⚙️ Advanced Configuration

### เพิ่ม Rate Limiting:
แก้ไข `/etc/nginx/sites-available/smartspec`:
```nginx
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    server {
        location /api/ {
            limit_req zone=api burst=20;
            proxy_pass http://localhost:8000/;
        }
    }
}
```

### เพิ่ม Access Log แยก:
```nginx
server {
    access_log /var/log/nginx/smartspec-access.log;
    error_log /var/log/nginx/smartspec-error.log;
}
```

### เพิ่ม Custom Error Pages:
```nginx
server {
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```

---

## 🔄 Production Upgrade (อนาคต)

### 1. ใช้ Let's Encrypt (SSL Certificate ฟรี):
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 2. ตั้ง Domain Name จริง:
- ซื้อ domain (เช่น smartspec.pro)
- Point DNS A Record → 192.168.1.118 (หรือ Public IP)
- Update nginx config: `server_name smartspec.pro;`

### 3. Security Hardening:
- Enable HTTP Strict Transport Security (HSTS)
- Add Content Security Policy (CSP)
- Enable fail2ban for brute-force protection
- Setup monitoring (Prometheus, Grafana)

---

## 🐛 Troubleshooting

### ปัญหา: "502 Bad Gateway"
**สาเหตุ:** Frontend/Backend ไม่ทำงาน

**แก้ไข:**
```bash
# Check services
ps aux | grep tsx
ps aux | grep uvicorn

# Restart services
./dev-local.sh web
./dev-local.sh backend
```

---

### ปัญหา: "Connection refused"
**สาเหตุ:** nginx ไม่ทำงาน

**แก้ไข:**
```bash
sudo systemctl status nginx
sudo systemctl restart nginx
sudo nginx -t  # ตรวจสอบ config
```

---

### ปัญหา: Certificate expired
**สาเหตุ:** Self-signed cert หมดอายุ (365 วัน)

**แก้ไข:** สร้าง certificate ใหม่
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/smartspec.key \
  -out /etc/ssl/certs/smartspec.crt \
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=SmartSpec/CN=smartspec.local" \
  -addext "subjectAltName=DNS:smartspec.local,DNS:smartspec.localhost,IP:192.168.1.118"

sudo systemctl reload nginx
```

---

### ปัญหา: ไม่สามารถเข้าจากเครื่องอื่นได้
**สาเหตุ:** Firewall blocking, network issue

**แก้ไข:**
```bash
# 1. Test ping
ping 192.168.1.118

# 2. Test port 443
telnet 192.168.1.118 443

# 3. Check firewall
sudo ufw status
sudo iptables -L -n | grep 443

# 4. Check nginx listening
sudo ss -tlnp | grep nginx
```

---

## ✅ สรุป

| Item | Before | After |
|------|--------|-------|
| **URL** | `http://192.168.1.118:3000` | `https://192.168.1.118` |
| **Port** | ต้องระบุ `:3000` | ไม่ต้องระบุ (ใช้ HTTPS default 443) |
| **Security** | HTTP (ไม่ปลอดภัย) | HTTPS + SSL |
| **Certificate** | ไม่มี | Self-Signed SSL |
| **HTTP/2** | ไม่รองรับ | รองรับ |
| **Compression** | ไม่มี | Gzip enabled |

---

## 🎉 ระบบพร้อมใช้งานแล้ว!

**เข้าใช้งานได้ที่:**
```
https://192.168.1.118
หรือ
https://smartspec.local (ถ้าตั้งค่า hosts file)
```

**ข้อดีของการใช้ nginx:**
- ✅ ไม่ต้องระบุ port
- ✅ ใช้ HTTPS ปลอดภัยขึ้น
- ✅ HTTP/2 เร็วขึ้น
- ✅ Gzip ประหยัด bandwidth
- ✅ พร้อมสำหรับ production

---

**หมายเหตุ:**
- ⚠️ Certificate warning เป็นเรื่องปกติสำหรับ Self-Signed Certificate
- 🔒 สำหรับ production ควรใช้ Let's Encrypt certificate
- 📝 เปลี่ยน password default หลัง login ครั้งแรก
