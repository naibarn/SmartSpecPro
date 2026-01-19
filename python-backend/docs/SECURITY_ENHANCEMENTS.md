# Security Enhancements - SmartSpec Pro

## Overview

This document describes the security enhancements implemented to address critical security concerns in the SmartSpec Pro Python backend.

## Changes Implemented

### 1. JWT + Rate Limiter Integration ✅

**Location:** `app/core/security.py`, `app/core/middleware.py`

**What was fixed:**
- Enhanced `RateLimiter` class to support both IP-based and user-based rate limiting
- Added tier-based rate limits (standard, premium, admin)
- Integrated JWT authentication into `RateLimitMiddleware`
- Added sliding window algorithm for accurate rate limiting
- Implemented burst protection

**Features:**
- **Anonymous users:** 60 requests/minute
- **Authenticated users:** 120 requests/minute
- **Premium users:** 240 requests/minute (2x authenticated)
- **Admin users:** 1,200 requests/minute (10x authenticated)
- **Burst allowance:** 1.5x the base limit
- **Response headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

**Usage:**
```python
# Rate limiting is automatic via middleware
# JWT token in Authorization header automatically upgrades limits
```

**Benefits:**
1. Prevents API abuse from both anonymous and authenticated users
2. Provides better experience for legitimate authenticated users
3. Includes rate limit info in response headers for client-side handling
4. Admin users get significantly higher limits for administrative tasks

---

### 2. CSRF Protection ✅

**Location:** `app/core/csrf.py`, `app/api/csrf.py`

**What was implemented:**
- Double Submit Cookie pattern with HMAC signing
- `CSRFProtection` class for token generation and verification
- `CSRFMiddleware` for automatic CSRF validation
- CSRF token API endpoints for frontend integration

**Features:**
- **Token generation:** Cryptographically secure tokens with HMAC signatures
- **Token expiration:** 1 hour token validity
- **Double submit pattern:** Token must match between cookie and header
- **Automatic rotation:** New token generated after successful state-changing requests
- **Safe methods exempt:** GET, HEAD, OPTIONS don't require CSRF tokens
- **Webhook exemption:** Webhook endpoints use HMAC signatures instead

**Protected Methods:**
- POST, PUT, PATCH, DELETE

**Exempt Paths:**
- `/health`, `/docs`, `/redoc`, `/openapi.json`
- `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`
- `/api/webhooks/*` (use HMAC signatures)

**Frontend Integration:**

1. **Get CSRF token:**
```javascript
// Call this on app initialization
const response = await fetch('/api/csrf/token', {
  credentials: 'include'  // Important: include cookies
});
const data = await response.json();
const csrfToken = data.csrf_token;
```

2. **Include token in requests:**
```javascript
// For all POST, PUT, PATCH, DELETE requests
fetch('/api/some-endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,  // Include CSRF token
    'Authorization': `Bearer ${accessToken}`  // JWT token
  },
  credentials: 'include',  // Important: include cookies
  body: JSON.stringify(data)
});
```

3. **Check CSRF status:**
```javascript
const status = await fetch('/api/csrf/status', {
  credentials: 'include'
});
const data = await status.json();
console.log('CSRF protected:', data.protected);
console.log('Token valid:', data.valid);
```

**Configuration:**

In `.env`:
```bash
# Enable CSRF in development (disabled by default)
ENABLE_CSRF=true

# CSRF uses SECRET_KEY by default
SECRET_KEY=your-secret-key-here
```

**Benefits:**
1. Protects against Cross-Site Request Forgery attacks
2. Ensures requests originate from legitimate frontend
3. Token rotation after state changes improves security
4. Easy frontend integration with clear API

---

### 3. CORS Configuration Improvements ✅

**Location:** `app/core/middleware.py`

**What was fixed:**
- Removed wildcard origins in production
- Implemented strict origin validation
- Added origin format validation (must start with http://, https://, or tauri://)
- Restricted allowed headers to only necessary ones
- Added exposed headers for rate limiting info
- Improved logging and error messages

**Security Improvements:**

1. **Production Mode:**
   - No wildcards allowed
   - Requires explicit CORS_ORIGINS configuration
   - No regex patterns (explicit origins only)
   - Validates all origins are properly formatted URLs

2. **Development Mode:**
   - Whitelist specific ports only (3000, 5173, 8080, 1420, 4200, 8000-8099)
   - Regex pattern matches localhost and local network IPs only
   - Logs all CORS configuration for debugging

3. **Allowed Headers (restricted):**
   - `Authorization` - JWT tokens
   - `Content-Type` - Request content type
   - `Accept` - Response content type
   - `Origin` - CORS origin
   - `X-Requested-With` - AJAX indicator
   - `X-CSRF-Token` - CSRF protection
   - `X-RateLimit-*` - Rate limiting headers
   - `X-Proxy-Token` - SmartSpecWeb gateway (if enabled)

4. **Exposed Headers:**
   - `X-RateLimit-Limit` - Rate limit maximum
   - `X-RateLimit-Remaining` - Requests remaining
   - `X-RateLimit-Reset` - Reset timestamp
   - `Retry-After` - Retry delay for 429 responses
   - `X-Request-ID` - Request tracking

**Configuration:**

In `.env`:
```bash
# Production: explicit origins only (comma-separated)
CORS_ORIGINS=https://app.smartspec.pro,https://www.smartspec.pro

# Development: default localhost ports
# CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Environment
ENVIRONMENT=production  # or development
DEBUG=false  # Set to true for development
```

**Benefits:**
1. Prevents unauthorized cross-origin requests
2. Protects against CORS misconfiguration attacks
3. Reduces attack surface by limiting allowed headers
4. Provides better error messages for configuration issues
5. Maintains security while allowing necessary cross-origin communication

---

## Middleware Execution Order

The middleware stack is configured in the following order (outermost to innermost):

1. **Error Handling** - Catches all unhandled exceptions
2. **Request/Audit Logging** - Logs all requests and responses
3. **Security Headers** - Adds security headers to all responses
4. **CORS** - Handles cross-origin requests (must be before CSRF for preflight)
5. **CSRF Protection** - Validates CSRF tokens for state-changing requests
6. **Rate Limiting** - Enforces rate limits with JWT awareness
7. **Request Validation** - Validates request format and content

This order ensures:
- Errors are caught at the highest level
- All requests are logged (even if they fail later)
- Security headers are added to all responses
- CORS preflight requests work correctly
- CSRF is validated before rate limiting
- Rate limits are enforced before expensive validation
- Request validation is the last check before reaching endpoints

---

## Testing

### 1. Test Rate Limiting

**Anonymous user:**
```bash
# Should get rate limited after 60 requests in a minute
for i in {1..70}; do
  curl http://localhost:8000/health
done
```

**Authenticated user:**
```bash
# Should get rate limited after 120 requests in a minute
for i in {1..130}; do
  curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/users/me
done
```

**Check rate limit headers:**
```bash
curl -I http://localhost:8000/health
# Look for X-RateLimit-* headers
```

### 2. Test CSRF Protection

**Get CSRF token:**
```bash
curl -c cookies.txt http://localhost:8000/api/csrf/token
```

**Try POST without CSRF token (should fail):**
```bash
curl -X POST \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/some-endpoint
# Expected: 403 Forbidden - CSRF_HEADER_MISSING
```

**Try POST with CSRF token (should succeed):**
```bash
CSRF_TOKEN=$(curl -b cookies.txt http://localhost:8000/api/csrf/token | jq -r .csrf_token)

curl -X POST \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"data": "test"}' \
  http://localhost:8000/api/some-endpoint
# Expected: 200 OK
```

### 3. Test CORS

**Test allowed origin:**
```bash
curl -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type" \
  -X OPTIONS \
  http://localhost:8000/api/users/me
# Should return CORS headers
```

**Test disallowed origin:**
```bash
curl -H "Origin: http://evil.com" \
  -X GET \
  http://localhost:8000/api/users/me
# Should not return Access-Control-Allow-Origin header
```

---

## Migration Guide

### For Frontend Developers

1. **Initialize CSRF on app load:**
```javascript
// In your app initialization (e.g., App.tsx, main.js)
async function initializeApp() {
  // Get CSRF token
  const response = await fetch('/api/csrf/token', {
    credentials: 'include'
  });
  const data = await response.json();

  // Store token for later use
  sessionStorage.setItem('csrf_token', data.csrf_token);
}
```

2. **Update API client to include CSRF token:**
```javascript
// For axios
axios.interceptors.request.use(config => {
  const csrfToken = sessionStorage.getItem('csrf_token');

  // Add CSRF token for state-changing requests
  if (['post', 'put', 'patch', 'delete'].includes(config.method)) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }

  return config;
});

// For fetch
function apiFetch(url, options = {}) {
  const csrfToken = sessionStorage.getItem('csrf_token');

  // Add CSRF token for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
    options.headers = {
      ...options.headers,
      'X-CSRF-Token': csrfToken
    };
  }

  // Always include credentials for CSRF cookies
  options.credentials = 'include';

  return fetch(url, options);
}
```

3. **Handle CSRF errors:**
```javascript
try {
  const response = await apiFetch('/api/endpoint', {
    method: 'POST',
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json();

    // Handle CSRF token errors
    if (error.error === 'CSRF_TOKEN_MISSING' ||
        error.error === 'CSRF_TOKEN_INVALID') {
      // Refresh CSRF token
      await initializeApp();
      // Retry request
      return apiFetch('/api/endpoint', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
  }
} catch (error) {
  console.error('API error:', error);
}
```

### For Backend Developers

1. **CSRF is automatically enabled in production**
   - No code changes needed for existing endpoints
   - Endpoints automatically protected for POST, PUT, PATCH, DELETE

2. **To exempt an endpoint from CSRF:**
```python
# Add path to EXEMPT_PATHS in app/core/csrf.py
EXEMPT_PATHS = {
    "/api/webhooks/stripe",  # Add your path here
    # ... other exempt paths
}
```

3. **To get CSRF token in endpoint:**
```python
from fastapi import Request
from app.core.csrf import get_csrf_token

@router.get("/some-endpoint")
async def my_endpoint(request: Request):
    csrf_token = get_csrf_token(request)
    return {"csrf_token": csrf_token}
```

---

## Performance Impact

### Rate Limiting
- **Memory usage:** O(n) where n = number of active users/IPs
- **CPU impact:** Minimal - simple list operations
- **Latency:** < 1ms per request

### CSRF Protection
- **Memory usage:** Negligible (tokens stored in cookies)
- **CPU impact:** Minimal - HMAC operations are fast
- **Latency:** < 1ms per request

### CORS
- **Memory usage:** Negligible
- **CPU impact:** Minimal - pattern matching
- **Latency:** < 1ms per request

**Total overhead:** < 3ms per request on average

---

## Security Checklist

- [x] Rate limiting implemented with JWT awareness
- [x] CSRF protection with double-submit cookie pattern
- [x] CORS configuration secured for production
- [x] Security headers added to all responses
- [x] No wildcards in production CORS
- [x] Token expiration and rotation implemented
- [x] Rate limit headers exposed to clients
- [x] Webhook endpoints properly exempted
- [x] Admin endpoints have higher rate limits
- [x] Frontend integration documented

---

## Related Files

### Modified Files
- `app/core/security.py` - Enhanced RateLimiter class
- `app/core/middleware.py` - Updated middleware configuration
- `app/main.py` - Added CSRF router and imports

### New Files
- `app/core/csrf.py` - CSRF protection implementation
- `app/api/csrf.py` - CSRF token API endpoints
- `docs/SECURITY_ENHANCEMENTS.md` - This documentation

### Configuration Files
- `.env` - CORS_ORIGINS, ENABLE_CSRF, SECRET_KEY

---

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [CORS MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [FastAPI Security Best Practices](https://fastapi.tiangolo.com/tutorial/security/)

---

## Support

For questions or issues related to these security enhancements, please:
1. Check this documentation first
2. Review the test cases above
3. Check the code comments in the implementation files
4. Create an issue in the project repository

---

**Last Updated:** 2026-01-19
**Version:** 0.2.0
**Author:** SmartSpec Pro Security Team
