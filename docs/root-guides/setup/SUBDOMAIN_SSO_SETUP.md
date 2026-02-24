# Cross-Subdomain SSO Configuration

## Problem

When accessing Docker Status at `docker.smartspec.pro`, you experience an infinite login loop:
1. Access `docker.smartspec.pro` → redirects to `smartspec.pro/login`
2. Login successful → redirects back to `docker.smartspec.pro`
3. Not authenticated → redirects to `smartspec.pro/login` (LOOP)

## Root Cause

Modern browsers (Chrome, Firefox, Safari) enforce strict cookie security policies:
- **SameSite=none** is required for cross-subdomain cookie sharing
- **secure=true** is required when using **SameSite=none**
- **HTTP (not HTTPS)** prevents **secure=true** cookies from working

Result: Cookies set at `smartspec.pro` cannot be read by `docker.smartspec.pro` when using HTTP.

## Solutions

### Option 1: Use HTTPS (Recommended for Production)

Set up SSL certificates and access the sites via HTTPS:

```bash
https://smartspec.pro
https://docker.smartspec.pro
```

**Benefits:**
- Secure communication
- Cookies work across subdomains
- Production-ready

**Setup:**
1. Get SSL certificates (Let's Encrypt, CloudFlare, etc.)
2. Configure nginx with SSL
3. Update docker-compose to use HTTPS ports
4. Access sites via `https://`

### Option 2: Use .local Domains (Recommended for Development)

Use `.local` domains instead of `.pro` domains for local development.

**Step 1: Update hosts file**

Windows: `C:\Windows\System32\drivers\etc\hosts`
Linux/Mac: `/etc/hosts`

Add these lines:
```
127.0.0.1 smartspec.local
127.0.0.1 docker.smartspec.local
```

**Step 2: Access the sites**
```bash
http://smartspec.local
http://docker.smartspec.local
```

**Benefits:**
- Works with HTTP
- No SSL certificates needed
- Browser allows SameSite=none with secure=false for .local domains

### Option 3: Local SSL Certificates (Advanced)

Generate self-signed SSL certificates for local development:

```bash
# Generate SSL certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout smartspec.local.key \
  -out smartspec.local.crt \
  -subjectAltName "DNS:smartspec.local,DNS:*.smartspec.local"

# Add certificate to nginx config
# Update docker-compose to use HTTPS
```

## Current Configuration

The system is now configured with:
- `SameSite=none` for cross-subdomain cookie sharing
- `secure=false` for HTTP (development)
- Cookie domain set to `.smartspec.pro` or `.smartspec.local`

This configuration **REQUIRES** either:
1. HTTPS with real domains (production)
2. .local domains with hosts file (development)

## Verification

After implementing one of the solutions above:

1. Clear browser cookies for `smartspec.pro` / `smartspec.local`
2. Access the main site: `http://smartspec.local` or `https://smartspec.pro`
3. Login with credentials
4. Access Docker Status: `http://docker.smartspec.local` or `https://docker.smartspec.pro`
5. Should be logged in automatically (no loop)

## Troubleshooting

### Still experiencing login loop?

1. **Check browser console** for cookie errors:
   - Press F12 → Console tab
   - Look for "Cookie was rejected because it had the 'SameSite=None' attribute"

2. **Clear all cookies**:
   - Chrome: Settings → Privacy → Clear browsing data → Cookies
   - Firefox: Options → Privacy → Clear Data → Cookies
   - Safari: Preferences → Privacy → Manage Website Data → Remove All

3. **Verify hosts file** (if using .local domains):
   ```bash
   ping smartspec.local
   # Should return 127.0.0.1
   ```

4. **Check nginx is running**:
   ```bash
   docker-compose ps
   # nginx should be Up
   ```

5. **Restart all services**:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Check cookies in browser

1. Press F12 → Application tab → Cookies
2. Look for `smartspec_session` cookie
3. Verify:
   - Domain: `.smartspec.local` or `.smartspec.pro`
   - SameSite: `None`
   - Secure: `false` (HTTP) or `true` (HTTPS)

## Technical Details

### Cookie Settings

```typescript
{
  domain: ".smartspec.pro",      // Shared across subdomains
  httpOnly: true,                 // Not accessible via JavaScript
  path: "/",                      // Available for all paths
  sameSite: "none",               // Allow cross-site requests
  secure: false,                  // HTTP (dev) or true for HTTPS (prod)
}
```

### Browser Compatibility

| Browser | HTTP + SameSite=none | HTTPS + SameSite=none |
|---------|---------------------|----------------------|
| Chrome  | ❌ Rejected*        | ✅ Accepted          |
| Firefox | ❌ Rejected*        | ✅ Accepted          |
| Safari  | ❌ Rejected*        | ✅ Accepted          |
| Edge    | ❌ Rejected*        | ✅ Accepted          |

*Exception: .local and localhost domains may be accepted

## References

- [MDN: SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [Chrome SameSite Updates](https://www.chromium.org/updates/same-site)
- [Cookie Security Best Practices](https://web.dev/samesite-cookies-explained/)
