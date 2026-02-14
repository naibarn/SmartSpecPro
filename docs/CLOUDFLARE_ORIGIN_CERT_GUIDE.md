# Cloudflare Origin Certificate Installation Guide

## Problem
Cloudflare returns 502 error because the origin server uses a self-signed SSL certificate.

## Solution
Install a Cloudflare Origin Certificate on your server.

## Steps

### 1. Generate Origin Certificate in Cloudflare Dashboard

1. Go to: https://dash.cloudflare.com
2. Select domain: `smartaihub.app`
3. Navigate to: **SSL/TLS** → **Origin Server**
4. Click: **Create Certificate**
5. Settings:
   - Private key type: RSA (2048)
   - Hostnames: `smartaihub.app`, `*.smartaihub.app`
   - Certificate Validity: 15 years
6. Click: **Create**
7. **IMPORTANT**: Copy both:
   - Origin Certificate (PEM format)
   - Private Key

### 2. Install Certificate on Server

SSH to your server and run:

```bash
cd /home/dev/projects/SmartSpecPro

# Create certificate files
cat > nginx/ssl/smartaihub.app.crt << 'EOF'
[PASTE ORIGIN CERTIFICATE HERE]
EOF

cat > nginx/ssl/smartaihub.app.key << 'EOF'
[PASTE PRIVATE KEY HERE]
EOF

# Set correct permissions
chmod 644 nginx/ssl/smartaihub.app.crt
chmod 600 nginx/ssl/smartaihub.app.key

# Restart Nginx
docker restart smartspec-nginx-dev

# Verify certificate
openssl x_client -connect localhost:443 -servername smartaihub.app </dev/null 2>&1 | grep "Verify return code"
```

Expected output: `Verify return code: 0 (ok)` or still 18 but Cloudflare will accept it.

### 3. Verify Cloudflare SSL/TLS Mode

Ensure SSL/TLS mode is set to:
- **"Full (strict)"** - Most secure, validates origin certificate
- **"Full"** - Also works, accepts any certificate

### 4. Test

```bash
curl -I https://smartaihub.app
```

Should return: `HTTP/2 200` (not 502)

## Troubleshooting

### Still getting 502?

1. Check Nginx is using the new certificate:
   ```bash
   docker exec smartspec-nginx-dev cat /etc/nginx/conf.d/dev-host.conf | grep ssl_certificate
   ```

2. Check certificate paths match:
   - Config: `/etc/nginx/ssl/smartaihub.app.crt`
   - Volume mount: `nginx/ssl/` → `/etc/nginx/ssl/`

3. Check Cloudflare Origin Server IPs are allowed in firewall

### Certificate not found error?

```bash
# Check if files exist in container
docker exec smartspec-nginx-dev ls -la /etc/nginx/ssl/

# If missing, check volume mount in docker-compose.yml:
grep -A 5 "smartspec-nginx-dev" docker-compose.yml | grep volumes
```

## Notes

- Cloudflare Origin Certificates are **only valid for Cloudflare to Origin** connection
- They are NOT valid for direct access (bypassing Cloudflare)
- Keep your private key secure - never commit to git
- Certificate expires in 15 years (2041)
