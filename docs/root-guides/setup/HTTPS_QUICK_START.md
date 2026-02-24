# HTTPS Quick Start Guide

**Problem Solved**: Docker Status login loop when using HTTP

**Solution**: Enable HTTPS for local development

## Why HTTPS?

When accessing `docker.smartspec.pro` (or any subdomain) via HTTP, you experience a login loop because:
- Modern browsers require `secure=true` for cookies with `SameSite=none`
- HTTP doesn't support `secure=true`
- Result: Cookies can't be shared between `smartspec.pro` and `docker.smartspec.pro`

With HTTPS, cookies work correctly across subdomains. ✅

## Quick Setup (5 Minutes)

### 1. Generate SSL Certificate

**Windows (Git Bash):**
```bash
cd /h/projects/SmartSpecPro
./scripts/generate-ssl-certs.sh
```

**Windows (Command Prompt):**
```cmd
cd h:\projects\SmartSpecPro
scripts\generate-ssl-certs.bat
```

**Linux/Mac:**
```bash
cd ~/projects/SmartSpecPro
chmod +x scripts/generate-ssl-certs.sh
./scripts/generate-ssl-certs.sh
```

### 2. Update Hosts File

**Windows**: Edit `C:\Windows\System32\drivers\etc\hosts` (as Administrator)

**Linux/Mac**: Edit `/etc/hosts` (with sudo)

Add these lines:
```
127.0.0.1 smartspec.local
127.0.0.1 docker.smartspec.local
```

### 3. Trust Certificate

**Chrome/Edge (Windows):**
1. Windows Key + R → type `certmgr.msc` → Enter
2. Trusted Root Certification Authorities → Certificates
3. Right-click → All Tasks → Import
4. Browse to: `h:\projects\SmartSpecPro\nginx\ssl\smartspec.local.crt`
5. Complete wizard
6. Restart browser

**Quick way (Chrome/Edge):**
1. Open: `chrome://settings/certificates`
2. Authorities tab → Import
3. Select: `h:\projects\SmartSpecPro\nginx\ssl\smartspec.local.crt`
4. Check "Trust this certificate for identifying websites"

**Firefox:**
1. Settings → Privacy & Security → Certificates → View Certificates
2. Authorities tab → Import
3. Select certificate file
4. Check "Trust this CA to identify websites"

### 4. Restart Services

```bash
docker-compose down
docker-compose up -d
```

Or:
```bash
./dev.sh restart
```

### 5. Test

Open browser:
- https://smartspec.local
- https://docker.smartspec.local

Expected: No SSL warnings, login works without loops ✅

## Verification Checklist

- [ ] Certificate generated (files in `nginx/ssl/`)
- [ ] Hosts file updated (ping smartspec.local returns 127.0.0.1)
- [ ] Certificate trusted in browser
- [ ] Services restarted
- [ ] Can access https://smartspec.local (no SSL warning)
- [ ] Can access https://docker.smartspec.local (no SSL warning)
- [ ] Login works without loops

## Troubleshooting

### "Your connection is not private" Warning

**Solution**: Certificate not trusted yet
1. Import certificate to Trusted Root Certification Authorities (not Personal)
2. Restart browser completely
3. Try again

### "This site can't be reached"

**Solution**: Check hosts file
```bash
ping smartspec.local
# Should reply from 127.0.0.1
```

If not working:
1. Save hosts file after editing
2. Run: `ipconfig /flushdns` (Windows) or `sudo killall -HUP mDNSResponder` (Mac)
3. Try again

### Still Getting Login Loop

**Solution**: Clear cookies
1. F12 → Application → Cookies
2. Delete all cookies for smartspec.local
3. Close browser completely
4. Reopen and try again

## Advanced Options

### Option 1: HTTP Only (Not Recommended)

Use `.local` domains without HTTPS (less secure, browser-dependent):
- See: [SUBDOMAIN_SSO_SETUP.md](SUBDOMAIN_SSO_SETUP.md)

### Option 2: Production SSL

Use real SSL certificates in production:
- See: [SSL_SETUP_GUIDE.md](SSL_SETUP_GUIDE.md) - Production section

## What Gets Created

```
nginx/ssl/
├── smartspec.local.crt    # SSL certificate (public)
└── smartspec.local.key    # Private key (keep secret)

nginx/conf.d/
├── ssl.conf                      # Main site HTTPS config
└── docker-subdomain-ssl.conf     # Docker Status HTTPS config
```

## How It Works

```
Browser Request (HTTPS)
    ↓
https://smartspec.local
    ↓
nginx (port 443, SSL enabled)
    ↓
Proxy to SmartSpec Web (port 3000)
    ↓
Set secure cookies with domain=.smartspec.local
    ↓
Browser stores cookies
    ↓
Request to https://docker.smartspec.local
    ↓
Browser sends cookies (because secure=true + SameSite=none)
    ↓
Docker Status authenticates user ✅
    ↓
No login loop!
```

## Security Notes

⚠️ **Self-signed certificates are for development only!**

In production:
- Use Let's Encrypt (free)
- Or commercial SSL (DigiCert, Sectigo)
- Never use self-signed certs

## Next Steps

After HTTPS is working:

1. Test login flow:
   - Login at https://smartspec.local
   - Access https://docker.smartspec.local
   - Should be logged in automatically

2. Test Domain Admin features:
   - Navigate to Domain Admin Dashboard
   - Edit theme
   - Manage content

3. Develop with confidence:
   - All features work as in production
   - Cookies shared correctly
   - Secure by default

## Need Help?

Full documentation:
- [SSL_SETUP_GUIDE.md](SSL_SETUP_GUIDE.md) - Complete SSL setup
- [SUBDOMAIN_SSO_SETUP.md](SUBDOMAIN_SSO_SETUP.md) - SSO configuration
- [README.md](../../../README.md) - Main project documentation

Common issues:
- Certificate warnings → Import to Trusted Root CA
- Can't reach site → Check hosts file and ping
- Login loops → Clear cookies and use HTTPS
