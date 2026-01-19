# Security Quick Start Guide

## ✅ Security Enhancements Completed

### 1. JWT + Rate Limiter Integration
- Anonymous users: 60 req/min
- Authenticated users: 120 req/min
- Premium users: 240 req/min
- Admin users: 1,200 req/min

### 2. CSRF Protection
- Double-submit cookie pattern
- Automatic token rotation
- 1-hour token expiration

### 3. CORS Configuration
- Strict origin validation
- No wildcards in production
- Whitelist specific ports in development

---

## 🚀 Quick Setup

### Backend (already done)
No additional setup needed! All changes are already implemented.

### Frontend Integration

#### 1. Get CSRF Token on App Init
```javascript
// In your main app file (App.tsx, main.js)
async function initCSRF() {
  const res = await fetch('/api/csrf/token', { credentials: 'include' });
  const data = await res.json();
  sessionStorage.setItem('csrf_token', data.csrf_token);
}

// Call on app mount
initCSRF();
```

#### 2. Add CSRF Token to Axios
```javascript
import axios from 'axios';

axios.interceptors.request.use(config => {
  // Add CSRF token for state-changing requests
  if (['post', 'put', 'patch', 'delete'].includes(config.method)) {
    const token = sessionStorage.getItem('csrf_token');
    config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

// Always include credentials for CSRF cookies
axios.defaults.withCredentials = true;
```

#### 3. Or for Fetch
```javascript
function apiFetch(url, options = {}) {
  const method = options.method?.toUpperCase();

  // Add CSRF for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = sessionStorage.getItem('csrf_token');
    options.headers = {
      ...options.headers,
      'X-CSRF-Token': token
    };
  }

  // Always include credentials
  options.credentials = 'include';

  return fetch(url, options);
}
```

---

## 🧪 Testing

### Test Rate Limiting
```bash
# Check rate limit headers
curl -I http://localhost:8000/health
# Look for: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

### Test CSRF Protection
```bash
# 1. Get CSRF token
curl -c cookies.txt http://localhost:8000/api/csrf/token

# 2. Extract token
CSRF_TOKEN=$(curl -s -b cookies.txt http://localhost:8000/api/csrf/token | jq -r .csrf_token)

# 3. Use token in request
curl -X POST \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"data": "test"}' \
  http://localhost:8000/api/some-endpoint
```

### Test CORS
```bash
# Test allowed origin
curl -H "Origin: http://localhost:3000" \
  -X GET http://localhost:8000/api/users/me
# Should see Access-Control-Allow-Origin header

# Test disallowed origin
curl -H "Origin: http://evil.com" \
  -X GET http://localhost:8000/api/users/me
# Should NOT see Access-Control-Allow-Origin header
```

---

## ⚙️ Configuration

### .env Settings
```bash
# Required
SECRET_KEY=your-secret-key-32-chars-minimum
JWT_SECRET=your-jwt-secret-32-chars-minimum

# CORS (comma-separated for production)
CORS_ORIGINS=https://app.smartspec.pro,https://www.smartspec.pro

# CSRF (optional - disabled in dev by default)
ENABLE_CSRF=false  # Set to true to enable in development

# Environment
ENVIRONMENT=development  # or production
DEBUG=true  # Set to false in production
```

---

## 📝 API Endpoints

### CSRF Token Endpoints

#### GET /api/csrf/token
Get CSRF token for current session.

**Response:**
```json
{
  "csrf_token": "abc123...",
  "header_name": "X-CSRF-Token",
  "cookie_name": "csrf_token",
  "instructions": {
    "message": "Include this token in the X-CSRF-Token header...",
    "example": "headers: { 'X-CSRF-Token': 'abc123...' }"
  }
}
```

#### GET /api/csrf/status
Check CSRF token status.

**Response:**
```json
{
  "protected": true,
  "has_token": true,
  "valid": true,
  "message": "CSRF token is valid"
}
```

---

## 🛡️ Security Features

### Automatic Protection
✅ Rate limiting on all endpoints
✅ CSRF protection on POST, PUT, PATCH, DELETE
✅ CORS validation on all requests
✅ Security headers on all responses
✅ JWT validation for authenticated routes

### Exempt Endpoints
- `GET`, `HEAD`, `OPTIONS` - No CSRF required
- `/health`, `/docs`, `/redoc` - No CSRF required
- `/api/auth/login`, `/api/auth/register` - No CSRF required
- `/api/webhooks/*` - No CSRF required (use HMAC)

---

## 🔍 Debugging

### Check Security Headers
```bash
curl -I http://localhost:8000/
```
Should see:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `X-RateLimit-*` headers

### Check CSRF Cookie
```bash
curl -c - http://localhost:8000/api/csrf/token | grep csrf_token
```

### Check Rate Limits
```bash
curl -H "Authorization: Bearer $TOKEN" \
  -I http://localhost:8000/api/users/me | grep X-RateLimit
```

---

## 🚨 Common Issues

### CSRF Token Missing
**Problem:** Getting `CSRF_TOKEN_MISSING` error
**Solution:** Make sure to:
1. Call `/api/csrf/token` first
2. Include `credentials: 'include'` in fetch
3. Use `withCredentials: true` in axios

### CORS Error
**Problem:** CORS error in browser console
**Solution:**
1. Check `CORS_ORIGINS` in `.env`
2. Make sure origin matches exactly (including protocol and port)
3. Check browser console for actual origin

### Rate Limit Exceeded
**Problem:** Getting 429 Too Many Requests
**Solution:**
1. Check `X-RateLimit-Reset` header for reset time
2. Use `Retry-After` header value
3. Implement exponential backoff in client
4. Consider upgrading to authenticated requests (2x limit)

---

## 📚 Full Documentation

See `docs/SECURITY_ENHANCEMENTS.md` for complete documentation including:
- Detailed implementation details
- Architecture diagrams
- Advanced configuration
- Performance considerations
- Security best practices

---

## ✨ Benefits

### For Users
- Protection against CSRF attacks
- Fair usage through rate limiting
- Better error messages
- Faster authenticated requests (higher limits)

### For Developers
- Easy frontend integration
- Clear API documentation
- Automatic security enforcement
- Debugging tools and headers

### For Operations
- Better monitoring with rate limit metrics
- Automatic attack mitigation
- Production-ready configuration
- Clear audit logs

---

**Need Help?** Check the full documentation or create an issue in the repository.
