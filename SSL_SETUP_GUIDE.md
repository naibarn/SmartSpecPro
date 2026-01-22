# SSL Setup Guide for SmartSpec Pro

This guide will help you set up HTTPS for local development using self-signed SSL certificates.

## Benefits of Using HTTPS for Development

1. **Cookie Sharing Works**: SameSite=none cookies work properly across subdomains
2. **Production-like Environment**: Your dev environment matches production
3. **No Login Loops**: SSO between smartspec.local and docker.smartspec.local works seamlessly
4. **Secure Cookies**: All session cookies work correctly with secure=true

## Quick Setup (Windows)

### Step 1: Install OpenSSL (if not already installed)

**Option A: Using Git Bash** (Recommended if you have Git installed)
- Git for Windows includes OpenSSL
- Use Git Bash terminal for all commands

**Option B: Download OpenSSL**
- Download from: https://slproweb.com/products/Win32OpenSSL.html
- Install Win64 OpenSSL (not the Light version)
- Add to PATH: `C:\Program Files\OpenSSL-Win64\bin`

**Option C: Using Chocolatey**
```powershell
choco install openssl
```

### Step 2: Generate SSL Certificates

Open Git Bash (or PowerShell if you installed OpenSSL separately):

```bash
cd /h/projects/SmartSpecPro
chmod +x scripts/generate-ssl-certs.sh
./scripts/generate-ssl-certs.sh
```

This will create:
- `nginx/ssl/smartspec.local.crt` - SSL certificate
- `nginx/ssl/smartspec.local.key` - Private key

The certificate is valid for:
- smartspec.local
- *.smartspec.local (all subdomains like docker.smartspec.local)
- localhost
- *.localhost

### Step 3: Update Hosts File

**Windows:**

1. Open Notepad as Administrator
2. Open file: `C:\Windows\System32\drivers\etc\hosts`
3. Add these lines:

```
127.0.0.1 smartspec.local
127.0.0.1 docker.smartspec.local
```

4. Save and close

### Step 4: Trust the Certificate in Your Browser

#### Chrome / Edge

1. Open browser settings
2. Navigate to: **Settings → Privacy and security → Security → Manage certificates**
3. Go to **Trusted Root Certification Authorities** tab
4. Click **Import**
5. Browse to: `h:\projects\SmartSpecPro\nginx\ssl\smartspec.local.crt`
6. Complete the import wizard
7. Restart browser

#### Firefox

1. Open Firefox settings
2. Navigate to: **Settings → Privacy & Security → Certificates**
3. Click **View Certificates**
4. Go to **Authorities** tab
5. Click **Import**
6. Select: `h:\projects\SmartSpecPro\nginx\ssl\smartspec.local.crt`
7. Check "Trust this CA to identify websites"
8. Click OK
9. Restart browser

### Step 5: Enable SSL Configuration

The SSL nginx configs are already created. Now we need to make sure they're being used:

1. Check that these files exist:
   - `nginx/conf.d/ssl.conf`
   - `nginx/conf.d/docker-subdomain-ssl.conf`

2. (Optional) Disable HTTP-only configs to force HTTPS:
   ```bash
   # Rename to disable HTTP configs
   mv nginx/conf.d/default.conf nginx/conf.d/default.conf.disabled
   mv nginx/conf.d/docker-subdomain.conf nginx/conf.d/docker-subdomain.conf.disabled
   ```

### Step 6: Restart Services

```bash
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d
```

Or using the dev script:
```bash
./dev.sh restart
```

### Step 7: Test HTTPS Access

Open your browser and navigate to:
- https://smartspec.local
- https://docker.smartspec.local

**Expected results:**
- ✅ No SSL warnings (after trusting certificate)
- ✅ Lock icon in address bar
- ✅ Login works without loops
- ✅ Cookies are shared between main site and docker subdomain

## Troubleshooting

### Certificate Not Trusted

**Symptom**: Browser shows "Your connection is not private" or "NET::ERR_CERT_AUTHORITY_INVALID"

**Solution**:
1. Make sure you imported the certificate into **Trusted Root Certification Authorities** (not Personal or other stores)
2. Restart browser completely (close all windows)
3. Clear browser cache: Settings → Privacy → Clear browsing data
4. Try in incognito/private window

### "This site can't be reached"

**Symptom**: Browser says "smartspec.local refused to connect"

**Solutions**:
1. Check hosts file was edited correctly:
   ```bash
   ping smartspec.local
   # Should show: Reply from 127.0.0.1
   ```

2. Check nginx is running:
   ```bash
   docker-compose ps
   # nginx should show "Up"
   ```

3. Check nginx logs:
   ```bash
   docker-compose logs nginx
   ```

4. Restart nginx:
   ```bash
   docker-compose restart nginx
   ```

### Still Getting Login Loops

**Solution**:
1. Clear ALL browser cookies for smartspec.local:
   - Press F12 → Application → Cookies
   - Delete all cookies for smartspec.local

2. Check cookie settings in browser console (F12):
   ```javascript
   // Check cookies
   document.cookie
   // Should see smartspec_session cookie
   ```

3. Verify HTTPS is being used (check address bar shows https://)

4. Check that secure=true in cookies:
   - F12 → Application → Cookies → smartspec.local
   - Look at smartspec_session cookie
   - Secure should be ✓ checked

### nginx Won't Start

**Symptom**: nginx container keeps restarting or won't start

**Solution**:
1. Check nginx configuration syntax:
   ```bash
   docker-compose exec nginx nginx -t
   ```

2. Check certificate files exist:
   ```bash
   ls nginx/ssl/
   # Should show: smartspec.local.crt and smartspec.local.key
   ```

3. Check file permissions:
   ```bash
   # On Linux/Mac
   chmod 644 nginx/ssl/smartspec.local.crt
   chmod 600 nginx/ssl/smartspec.local.key
   ```

4. Check nginx error logs:
   ```bash
   docker-compose logs nginx | tail -50
   ```

## Quick Setup (Linux/Mac)

### Step 1: Generate SSL Certificates

```bash
cd /path/to/SmartSpecPro
chmod +x scripts/generate-ssl-certs.sh
./scripts/generate-ssl-certs.sh
```

### Step 2: Update Hosts File

```bash
sudo nano /etc/hosts
```

Add:
```
127.0.0.1 smartspec.local
127.0.0.1 docker.smartspec.local
```

Save and exit (Ctrl+X, Y, Enter)

### Step 3: Trust Certificate

**Ubuntu/Debian:**
```bash
sudo cp nginx/ssl/smartspec.local.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

**macOS:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain nginx/ssl/smartspec.local.crt
```

### Step 4: Restart Services

```bash
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d
```

## Configuration Files

### Generated Files

- `nginx/ssl/smartspec.local.crt` - SSL certificate (valid 365 days)
- `nginx/ssl/smartspec.local.key` - Private key
- `nginx/conf.d/ssl.conf` - Main site HTTPS config
- `nginx/conf.d/docker-subdomain-ssl.conf` - Docker Status HTTPS config

### How It Works

1. **Certificate Generation**: OpenSSL creates a self-signed certificate with SAN (Subject Alternative Names) for multiple domains
2. **nginx Configuration**: SSL configs listen on port 443 (HTTPS) and proxy to backend services
3. **HTTP Redirect**: Port 80 (HTTP) automatically redirects to HTTPS
4. **Cookie Security**: With HTTPS, cookies can use `secure=true` and `SameSite=none` for cross-subdomain sharing

## Renewal

Certificates are valid for 365 days. To renew:

```bash
./scripts/generate-ssl-certs.sh
# Answer 'y' when asked to regenerate

docker-compose restart nginx
```

## Reverting to HTTP

If you need to go back to HTTP:

1. Disable SSL configs:
   ```bash
   mv nginx/conf.d/ssl.conf nginx/conf.d/ssl.conf.disabled
   mv nginx/conf.d/docker-subdomain-ssl.conf nginx/conf.d/docker-subdomain-ssl.conf.disabled
   ```

2. Enable HTTP configs:
   ```bash
   mv nginx/conf.d/default.conf.disabled nginx/conf.d/default.conf
   mv nginx/conf.d/docker-subdomain.conf.disabled nginx/conf.d/docker-subdomain.conf
   ```

3. Restart nginx:
   ```bash
   docker-compose restart nginx
   ```

## Security Notes

⚠️ **Important**: Self-signed certificates are for **development only**!

- Do NOT use self-signed certificates in production
- For production, use certificates from:
  - Let's Encrypt (free)
  - CloudFlare (free)
  - Commercial CA (DigiCert, Sectigo, etc.)

## Production SSL Setup

For production deployment:

1. Get a real SSL certificate from Let's Encrypt:
   ```bash
   # Install certbot
   sudo apt-get install certbot python3-certbot-nginx

   # Get certificate
   sudo certbot --nginx -d smartspec.pro -d docker.smartspec.pro
   ```

2. Update nginx configuration to use Let's Encrypt certificates
3. Set up automatic renewal with certbot

## Additional Resources

- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
- [nginx SSL Configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [MDN: SameSite Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)

## Support

If you encounter issues not covered in this guide, check:
1. Browser console (F12) for errors
2. nginx logs: `docker-compose logs nginx`
3. Application logs: `docker-compose logs smartspec-web docker-status`
