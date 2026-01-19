# SmartSpecPro Marketplace - Production Deployment Guide

**Version**: 1.0
**Date**: 2026-01-19
**Status**: Production Ready ✅

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [System Requirements](#system-requirements)
3. [Installation Steps](#installation-steps)
4. [Database Migration](#database-migration)
5. [Configuration](#configuration)
6. [Security Hardening](#security-hardening)
7. [Monitoring Setup](#monitoring-setup)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Post-Deployment](#post-deployment)
11. [Rollback Procedure](#rollback-procedure)
12. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Security Fixes Verification

Before deploying, verify all security fixes are in place:

- ✅ Payment credit addition fixed (payment_service.py:365-376)
- ✅ Broken admin endpoint fixed (marketplace.py:447-456)
- ✅ Race conditions fixed with row locking (marketplace_service.py:341-371)
- ✅ Webhook double-processing fixed (payment_service.py:317-323)
- ✅ File URL validation implemented (marketplace.py:51-113)
- ✅ Slug validation added (marketplace.py:28, 42-49)
- ✅ Refund flow made atomic (refund_service.py:165-222)
- ✅ HTML sanitization added (marketplace.py:116-132)
- ✅ Search query limits added (marketplace.py:228)
- ✅ Performance indexes created (marketplace_template.py:125-136)
- ✅ Purchase deduplication constraint added (marketplace_template.py:208)

**Status**: All 11 security fixes complete ✅

### Code Review

- [ ] All code changes peer-reviewed
- [ ] Security audit findings addressed
- [ ] No sensitive data in code
- [ ] API keys stored in environment variables

### Testing

- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Load testing completed
- [ ] Security testing completed

---

## System Requirements

### Hardware (Minimum)

**Backend Server:**
- CPU: 4 cores
- RAM: 8GB
- Storage: 50GB SSD
- Network: 100Mbps

**Production (Recommended):**
- CPU: 8+ cores
- RAM: 16GB+
- Storage: 200GB+ SSD (NVMe preferred)
- Network: 1Gbps

### Software

**Required:**
- Python 3.11 or higher
- Node.js 18+ (for web frontend)
- SQLite 3.35+ (or PostgreSQL 14+ for production)
- Git 2.30+

**Optional:**
- Docker 24.0+ (for containerized deployment)
- Nginx 1.22+ (reverse proxy)
- Redis 7.0+ (caching)

---

## Installation Steps

### 1. Backend Setup

```bash
# Clone repository
git clone https://github.com/yourusername/SmartSpecPro.git
cd SmartSpecPro/python-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Additional dependencies
pip install stripe aiosmtplib psutil
```

### 2. Environment Configuration

Create `.env` file:

```bash
# Database
DATABASE_URL=sqlite+aiosqlite:///./data/smartspec.db
# For PostgreSQL: postgresql+asyncpg://user:pass@localhost/smartspec

# Environment
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO

# Security
SECRET_KEY=your-super-secret-key-min-32-chars
JWT_SECRET_KEY=your-jwt-secret-key-min-32-chars
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Stripe
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourdomain.com
SMTP_PASSWORD=your-app-password
ALERT_EMAIL=admin@yourdomain.com

# Monitoring (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK

# Storage
TEMPLATE_STORAGE_PROVIDER=cloudflare_r2
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET=smartspec-templates
```

### 3. Frontend Setup (Desktop App)

```bash
cd ../desktop-app

# Install dependencies
npm install
# or
pnpm install

# Build for production
npm run build
# or
pnpm build
```

### 4. Web Frontend Setup

```bash
cd ../SmartSpecWeb

# Install dependencies
npm install

# Build for production
npm run build

# Start production server
npm start
```

---

## Database Migration

### Step 1: Initialize Database

```bash
cd python-backend

# Create database tables
python init_marketplace_db.py
```

### Step 2: Run Security Updates Migration

```bash
# Run migration
python migrations/001_marketplace_security_updates.py upgrade

# Verify migration
python migrations/001_marketplace_security_updates.py status
```

### Expected Output:

```
INFO: Starting marketplace security updates migration...
INFO: Creating performance indexes on marketplace_templates...
INFO: Performance indexes created successfully
INFO: Adding unique constraint to template_purchases...
INFO: No duplicate purchases found
INFO: Unique constraint added successfully
INFO: Migration completed successfully!
```

### Step 3: Verify Database Schema

```bash
# Connect to database
sqlite3 data/smartspec.db

# Check indexes
.indexes marketplace_templates
# Should see:
# idx_template_status_category
# idx_template_featured_status
# idx_template_creator_status
# idx_template_creator_revenue
# idx_template_purchase_count
# idx_template_rating
# idx_template_status_submitted

# Check unique constraint
.schema template_purchases
# Should see:
# CONSTRAINT uq_purchase_buyer_template UNIQUE (buyer_id, template_id)

# Exit
.quit
```

---

## Configuration

### Backend Configuration

Edit `python-backend/app/core/config.py` for production settings:

```python
class Settings(BaseSettings):
    # Production settings
    ENVIRONMENT: str = "production"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Security
    ALLOWED_HOSTS: List[str] = ["yourdomain.com"]

    # CORS
    CORS_ORIGINS: List[str] = [
        "https://yourdomain.com",
        "https://www.yourdomain.com"
    ]

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60
```

### Nginx Configuration

Create `/etc/nginx/sites-available/smartspec`:

```nginx
upstream backend {
    server 127.0.0.1:8080;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Backend API
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files
    location / {
        root /var/www/smartspec/web;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # Health check
    location /health {
        proxy_pass http://backend;
        access_log off;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/smartspec /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Security Hardening

### 1. File Permissions

```bash
# Backend
chmod 700 python-backend/data
chmod 600 python-backend/.env
chmod 644 python-backend/data/smartspec.db

# Logs
mkdir -p /var/log/smartspec
chmod 755 /var/log/smartspec
```

### 2. Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH
sudo ufw enable

# Or iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### 3. Process Management

Create systemd service `/etc/systemd/system/smartspec-backend.service`:

```ini
[Unit]
Description=SmartSpecPro Backend API
After=network.target

[Service]
Type=simple
User=smartspec
Group=smartspec
WorkingDirectory=/opt/smartspec/python-backend
Environment="PATH=/opt/smartspec/python-backend/venv/bin"
ExecStart=/opt/smartspec/python-backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 4
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/smartspec/python-backend/data /var/log/smartspec

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable smartspec-backend
sudo systemctl start smartspec-backend
sudo systemctl status smartspec-backend
```

---

## Monitoring Setup

### 1. Health Checks

Setup automated health monitoring:

```bash
# Add to crontab
crontab -e

# Add line:
*/5 * * * * curl -f https://yourdomain.com/api/v1/health || echo "Health check failed" | mail -s "SmartSpec Down" admin@yourdomain.com
```

### 2. Log Rotation

Create `/etc/logrotate.d/smartspec`:

```
/var/log/smartspec/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 smartspec smartspec
    sharedscripts
    postrotate
        systemctl reload smartspec-backend > /dev/null 2>&1 || true
    endscript
}
```

### 3. Metrics Collection

The system automatically tracks metrics via `app/monitoring/marketplace_metrics.py`.

Access metrics at:
- Public health: `https://yourdomain.com/api/v1/health`
- Detailed health (admin): `https://yourdomain.com/api/v1/health/detailed`
- Prometheus metrics (admin): `https://yourdomain.com/api/v1/metrics`

### 4. Alert Configuration

Alerts are configured in `app/monitoring/alerts.py`. Configure webhook URLs in `.env`:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK
ALERT_EMAIL=admin@yourdomain.com
```

Default alerts:
- **High error rate** (>5%): Email + Slack
- **Slow response time** (>2s): Slack
- **High concurrent load** (>100): Slack
- **Revenue anomaly**: Email + Slack (Critical)

---

## Testing

### Run Unit Tests

```bash
cd python-backend

# Run all tests
pytest tests/unit/ -v

# Run security tests
pytest tests/unit/test_marketplace_security.py -v
```

### Run Integration Tests

```bash
# Run integration tests
pytest tests/integration/test_marketplace_flow.py -v --asyncio-mode=auto

# Expected output:
# test_successful_purchase PASSED
# test_duplicate_purchase_prevention PASSED
# test_insufficient_credits PASSED
# test_concurrent_purchases_race_condition PASSED
# test_add_review PASSED
# test_review_without_purchase PASSED
# test_url_validation PASSED
# test_slug_validation PASSED
# test_revenue_integrity_check PASSED
```

### Load Testing

```bash
# Install locust
pip install locust

# Create locustfile.py
cat > locustfile.py << 'EOF'
from locust import HttpUser, task, between

class MarketplaceUser(HttpUser):
    wait_time = between(1, 3)

    @task
    def browse_templates(self):
        self.client.get("/api/v1/marketplace/templates")

    @task
    def view_template(self):
        self.client.get("/api/v1/marketplace/templates/test-template")
EOF

# Run load test
locust -f locustfile.py --host=https://yourdomain.com

# Target: 100+ concurrent users with <2s response time
```

---

## Deployment

### Option 1: Manual Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Activate environment
cd python-backend
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run migrations
python migrations/001_marketplace_security_updates.py upgrade

# 5. Restart service
sudo systemctl restart smartspec-backend

# 6. Verify
curl https://yourdomain.com/api/v1/health
```

### Option 2: Docker Deployment

```bash
# Build image
docker build -t smartspec-backend:latest -f Dockerfile.prod .

# Run container
docker run -d \
  --name smartspec-backend \
  --restart unless-stopped \
  -p 8080:8080 \
  -v ./data:/app/data \
  -v ./logs:/app/logs \
  --env-file .env \
  smartspec-backend:latest

# Check status
docker logs -f smartspec-backend
```

### Option 3: Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./python-backend
      dockerfile: Dockerfile.prod
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    env_file:
      - ./python-backend/.env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - ./web:/usr/share/nginx/html:ro
    depends_on:
      - backend
    restart: unless-stopped
```

Deploy:

```bash
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f
```

---

## Post-Deployment

### 1. Smoke Tests

```bash
# Health check
curl https://yourdomain.com/api/v1/health

# Expected:
# {"status":"healthy","timestamp":"2026-01-19T...","checks":{...}}

# Browse templates
curl https://yourdomain.com/api/v1/marketplace/templates

# Template detail
curl https://yourdomain.com/api/v1/marketplace/templates/test-template
```

### 2. Monitor First 48 Hours

Check logs regularly:

```bash
# System logs
sudo journalctl -u smartspec-backend -f

# Application logs
tail -f /var/log/smartspec/app.log

# Nginx access logs
tail -f /var/log/nginx/access.log

# Nginx error logs
tail -f /var/log/nginx/error.log
```

### 3. Performance Monitoring

Access admin metrics (requires superuser auth):

```bash
# Detailed health
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://yourdomain.com/api/v1/health/detailed

# Metrics
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://yourdomain.com/api/v1/metrics
```

### 4. Database Backup

Setup automated backups:

```bash
# Add to crontab
0 2 * * * sqlite3 /opt/smartspec/python-backend/data/smartspec.db ".backup /backups/smartspec-$(date +\%Y\%m\%d).db"

# Keep last 30 days
0 3 * * * find /backups -name "smartspec-*.db" -mtime +30 -delete
```

---

## Rollback Procedure

If deployment fails:

### Step 1: Stop Services

```bash
sudo systemctl stop smartspec-backend
```

### Step 2: Rollback Code

```bash
git log --oneline  # Find previous commit
git reset --hard PREVIOUS_COMMIT_HASH
```

### Step 3: Rollback Database

```bash
# Restore from backup
cp /backups/smartspec-20260118.db data/smartspec.db

# Or run migration downgrade
python migrations/001_marketplace_security_updates.py downgrade
```

### Step 4: Restart Services

```bash
sudo systemctl start smartspec-backend
sudo systemctl status smartspec-backend
```

### Step 5: Verify

```bash
curl https://yourdomain.com/api/v1/health
```

---

## Troubleshooting

### Issue: Backend won't start

**Symptoms**: Service fails to start, error in logs

**Solutions**:
1. Check dependencies: `pip list`
2. Check .env file exists and has correct values
3. Check database file permissions
4. Check port 8080 is not in use: `netstat -tlnp | grep 8080`

### Issue: High error rate

**Symptoms**: `/api/v1/health` shows degraded status

**Solutions**:
1. Check logs for specific errors
2. Verify database connectivity
3. Check Stripe API status
4. Verify external service connectivity

### Issue: Slow response times

**Symptoms**: Response times >2 seconds

**Solutions**:
1. Check database indexes: Run `EXPLAIN QUERY PLAN` on slow queries
2. Check concurrent load
3. Increase workers: Edit systemd service `--workers 8`
4. Add database connection pooling

### Issue: Purchase failures

**Symptoms**: Users reporting failed purchases

**Solutions**:
1. Check credit balances
2. Verify Stripe integration
3. Check for race conditions (should be fixed)
4. Review transaction logs

### Issue: Webhook failures

**Symptoms**: Webhooks not processing

**Solutions**:
1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Check webhook endpoint is accessible
3. Review Stripe webhook logs
4. Verify row locking is working (no duplicates)

---

## Support

For issues or questions:

- **Documentation**: `/docs` directory
- **Security Issues**: security@yourdomain.com
- **Technical Support**: support@yourdomain.com

---

## Deployment Checklist

Final checklist before going live:

- [ ] All security fixes verified
- [ ] Environment variables configured
- [ ] Database migrated successfully
- [ ] SSL certificates installed
- [ ] Firewall configured
- [ ] Monitoring setup complete
- [ ] Alerts configured
- [ ] Backups automated
- [ ] Load testing passed
- [ ] Smoke tests passed
- [ ] Rollback procedure tested
- [ ] Team trained on monitoring
- [ ] Documentation updated

---

**Deployment Status**: ✅ READY FOR PRODUCTION

**Next Steps**: Execute deployment during maintenance window with team on standby for first 48 hours of monitoring.

**Good luck! 🚀**
