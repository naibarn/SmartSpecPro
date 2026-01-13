# SmartSpec Pro - Nginx Reverse Proxy Guide

คู่มือการใช้งาน Nginx Reverse Proxy สำหรับโปรเจกต์ SmartSpecPro

## สารบัญ

1. [ภาพรวม](#ภาพรวม)
2. [โครงสร้างไฟล์](#โครงสร้างไฟล์)
3. [การใช้งาน](#การใช้งาน)
4. [Routing Configuration](#routing-configuration)
5. [การตั้งค่า HTTPS](#การตั้งค่า-https)
6. [Performance Tuning](#performance-tuning)
7. [Troubleshooting](#troubleshooting)

---

## ภาพรวม

Nginx ทำหน้าที่เป็น **Reverse Proxy** และ **Load Balancer** สำหรับ SmartSpec Pro โดยรวม services ทั้งหมดเข้าด้วยกันผ่าน port 80/443 เดียว

### Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Internet/Client                │
                    └─────────────────────┬───────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │           Nginx Reverse Proxy               │
                    │              Port 80/443                    │
                    └─────────────────────┬───────────────────────┘
                                          │
          ┌───────────────┬───────────────┼───────────────┬───────────────┐
          │               │               │               │               │
          ▼               ▼               ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
    │SmartSpec  │   │  Python   │   │  Docker   │   │  Control  │   │   tRPC    │
    │   Web     │   │  Backend  │   │  Status   │   │   Plane   │   │ Endpoints │
    │   :3000   │   │   :8000   │   │   :3001   │   │   :7070   │   │   :3000   │
    └───────────┘   └───────────┘   └───────────┘   └───────────┘   └───────────┘
         /              /api/          /docker/        /control/        /trpc/
```

### URL Mapping

| URL Path | Target Service | Port | Description |
|----------|---------------|------|-------------|
| `/` | SmartSpec Web | 3000 | Main web application |
| `/api/*` | Python Backend | 8000 | REST API (FastAPI) |
| `/docker/*` | Docker Status | 3001 | Container monitoring |
| `/control/*` | Control Plane | 7070 | System control |
| `/trpc/*` | SmartSpec Web | 3000 | tRPC endpoints |

---

## โครงสร้างไฟล์

```
nginx/
├── Dockerfile              # Nginx Docker image
├── nginx.conf              # Main configuration
├── generate-ssl.sh         # SSL certificate generator
├── conf.d/
│   ├── default.conf        # HTTP server config
│   └── ssl.conf.example    # HTTPS config template
└── ssl/
    ├── smartspec.crt       # SSL certificate (generated)
    └── smartspec.key       # SSL private key (generated)
```

---

## การใช้งาน

### Quick Start

```bash
# Start all services with Nginx
docker-compose -f docker-compose.nginx.yml up -d

# Check status
docker-compose -f docker-compose.nginx.yml ps

# View Nginx logs
docker-compose -f docker-compose.nginx.yml logs -f nginx
```

### Access Points

หลังจาก start แล้ว สามารถเข้าถึงได้ที่:

- **Main Application**: http://localhost/
- **API Documentation**: http://localhost/api/docs
- **Docker Status**: http://localhost/docker/
- **Health Check**: http://localhost/nginx-health

### Build Nginx Image

```bash
# Build only Nginx
docker-compose -f docker-compose.nginx.yml build nginx

# Build with no cache
docker-compose -f docker-compose.nginx.yml build --no-cache nginx
```

---

## Routing Configuration

### เพิ่ม Route ใหม่

แก้ไขไฟล์ `nginx/conf.d/default.conf`:

```nginx
# Example: Add new service
location /newservice/ {
    rewrite ^/newservice/(.*) /$1 break;
    proxy_pass http://new-service:port;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### WebSocket Support

สำหรับ services ที่ใช้ WebSocket:

```nginx
location /ws/ {
    proxy_pass http://websocket-service:port;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
}
```

---

## การตั้งค่า HTTPS

### 1. Generate Self-Signed Certificates (Development)

```bash
cd nginx
./generate-ssl.sh smartspec.local
```

### 2. Enable SSL Configuration

```bash
# Rename SSL config
mv nginx/conf.d/ssl.conf.example nginx/conf.d/ssl.conf
```

### 3. Update docker-compose.nginx.yml

```yaml
nginx:
  ports:
    - "80:80"
    - "443:443"  # Uncomment this line
```

### 4. Restart Nginx

```bash
docker-compose -f docker-compose.nginx.yml restart nginx
```

### Using Let's Encrypt (Production)

```bash
# Install certbot
apt-get install certbot

# Generate certificate
certbot certonly --standalone -d yourdomain.com

# Copy certificates
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/smartspec.crt
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/smartspec.key
```

---

## Performance Tuning

### Worker Processes

ใน `nginx.conf`:

```nginx
worker_processes auto;  # ใช้ตาม CPU cores
worker_connections 1024;
```

### Caching

```nginx
# Enable proxy cache
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=smartspec_cache:10m max_size=1g;

location /static/ {
    proxy_cache smartspec_cache;
    proxy_cache_valid 200 7d;
    proxy_cache_use_stale error timeout updating;
}
```

### Gzip Compression

```nginx
gzip on;
gzip_vary on;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript;
```

### Rate Limiting

```nginx
# Define zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

# Apply to location
location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
}
```

---

## Troubleshooting

### ปัญหาที่พบบ่อย

#### 1. 502 Bad Gateway

```bash
# Check if upstream services are running
docker-compose -f docker-compose.nginx.yml ps

# Check Nginx error logs
docker-compose -f docker-compose.nginx.yml logs nginx

# Verify upstream connectivity
docker exec smartspec-nginx curl -I http://smartspec-web:3000
```

#### 2. 504 Gateway Timeout

เพิ่ม timeout ใน configuration:

```nginx
proxy_connect_timeout 120s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
```

#### 3. WebSocket Connection Failed

ตรวจสอบ headers:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

#### 4. SSL Certificate Issues

```bash
# Verify certificate
openssl x509 -in nginx/ssl/smartspec.crt -text -noout

# Check certificate expiry
openssl x509 -enddate -noout -in nginx/ssl/smartspec.crt
```

### Useful Commands

```bash
# Test Nginx configuration
docker exec smartspec-nginx nginx -t

# Reload configuration without restart
docker exec smartspec-nginx nginx -s reload

# View real-time access logs
docker exec smartspec-nginx tail -f /var/log/nginx/access.log

# View error logs
docker exec smartspec-nginx tail -f /var/log/nginx/error.log
```

### Health Check Endpoints

| Endpoint | Description |
|----------|-------------|
| `/nginx-health` | Nginx health |
| `/api/health` | Python Backend health |
| `/health` | SmartSpec Web health |

---

## Security Best Practices

### 1. Hide Server Version

```nginx
server_tokens off;
```

### 2. Security Headers

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### 3. Rate Limiting

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
```

### 4. SSL/TLS Configuration

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:50m;
```

---

## License

MIT License - SmartSpec Team
