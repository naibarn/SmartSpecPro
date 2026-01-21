# Docker Status - Subdomain Authentication Setup

## Overview
Docker Status now uses shared authentication with SmartSpec Web through subdomain-based Single Sign-On (SSO).

## How It Works
1. User visits Docker Status (docker.smartspec.pro or docker.smartspec.local)
2. If not authenticated, redirects to SmartSpec Web login
3. After successful login, returns to Docker Status with shared session cookie
4. Docker Status validates the session and checks for admin role

## Local Development Setup

### Option 1: Using .local domains (Recommended)
This mimics production behavior with proper subdomain cookie sharing.

1. **Add to hosts file:**

   **Windows:** `C:\Windows\System32\drivers\etc\hosts`
   **Linux/Mac:** `/etc/hosts`

   ```
   127.0.0.1 smartspec.local
   127.0.0.1 docker.smartspec.local
   ```

2. **Access the applications:**
   - SmartSpec Web: http://smartspec.local
   - Docker Status: http://docker.smartspec.local

3. **Cookie sharing:**
   - Cookies are set with domain `.smartspec.local`
   - Shared automatically between smartspec.local and docker.smartspec.local

### Option 2: Using localhost (Simplified)
Simpler but doesn't fully simulate production subdomain behavior.

1. **No hosts file needed**

2. **Access the applications:**
   - SmartSpec Web: http://localhost
   - Docker Status: http://localhost:3001

3. **Cookie behavior:**
   - Cookies are set without domain attribute
   - Limited to localhost only (no subdomain sharing)
   - May require direct port access

### Option 3: Using docker.localhost
Some browsers support .localhost subdomains natively.

1. **Add to nginx config (already done):**
   ```nginx
   server_name docker.smartspec.pro docker.smartspec.local docker.localhost;
   ```

2. **Access the applications:**
   - SmartSpec Web: http://localhost
   - Docker Status: http://docker.localhost

3. **Note:** Browser support varies, Option 1 is more reliable.

## Production Setup

Production uses actual domains without hosts file:
- SmartSpec Web: http://smartspec.pro (or https://smartspec.pro)
- Docker Status: http://docker.smartspec.pro (or https://docker.smartspec.pro)

Cookies are shared with domain `.smartspec.pro` and `sameSite: "none"` when using HTTPS.

## Testing the Flow

1. **Clear browser cookies** for localhost/smartspec.local

2. **Visit Docker Status:**
   - http://docker.smartspec.local (Option 1)
   - http://localhost:3001 (Option 2)
   - http://docker.localhost (Option 3)

3. **Observe redirect:**
   - Should redirect to SmartSpec Web login page
   - URL includes `returnUrl` parameter

4. **Login with admin account:**
   - Use admin credentials
   - After successful login, redirects back to Docker Status

5. **Verify authentication:**
   - Should see Docker Status dashboard
   - Admin role required for access

## Troubleshooting

### Redirect Loop
**Symptom:** Page keeps redirecting between login and Docker Status

**Causes:**
- Cookies not being shared between domains
- Using mismatched URLs (e.g., localhost vs smartspec.local)

**Solutions:**
1. Clear all browser cookies for localhost and .local domains
2. Ensure using same domain approach (don't mix localhost and .local)
3. Check browser DevTools > Application > Cookies to verify cookie domain
4. Verify nginx is running: `docker ps | grep nginx`

### "Invalid session cookie"
**Symptom:** Login successful but Docker Status shows login page

**Causes:**
- Cookie domain mismatch
- Session expired
- Different JWT_SECRET between services

**Solutions:**
1. Check both services use same DATABASE_URL
2. Verify JWT_SECRET is set in docker-compose.dev.yml
3. Restart both services: `docker-compose -f docker-compose.dev.yml restart smartspec-web docker-status`

### "Admin Access Required"
**Symptom:** Login successful but redirects back with error

**Causes:**
- User account doesn't have admin role
- Cookie not being read by Docker Status

**Solutions:**
1. Verify user has admin role in database
2. Check AuthContext is validating `role === 'admin'`
3. Check browser console for authentication errors

## Current Configuration

### SmartSpec Web
- Port: 3000 (exposed as 3000)
- Nginx: http://localhost, http://smartspec.local
- Cookie: `app_session_id` with domain based on hostname

### Docker Status
- Port: 3000 (exposed as 3001)
- Nginx: http://docker.smartspec.local, http://docker.localhost
- Cookie: Same `app_session_id` shared with SmartSpec Web

### Database
- PostgreSQL on port 5432
- Shared `users` table between both applications
- Admin role required for Docker Status access

## Security Notes

1. **Cookie Settings:**
   - `httpOnly: true` - Prevents XSS attacks
   - `sameSite: "lax"` for HTTP, `"none"` for HTTPS
   - `secure: true` only when using HTTPS
   - Domain set to root domain for subdomain sharing

2. **returnUrl Validation:**
   - Only allows same domain or `.smartspec.pro/.smartspec.local` subdomains
   - Prevents open redirect vulnerabilities

3. **Admin-Only Access:**
   - Docker Status validates `role === 'admin'`
   - Regular users are denied access
