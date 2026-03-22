---
name: Authentication Quick Reference
description: Fast lookup guide for auth flow, storage mechanisms, and code locations
type: reference
---

# SmartSpecPro Authentication — Quick Reference

## Token Flow Diagram

```
┌─────────────────────┐
│   User Login        │
│  (email + password) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  routers.ts:280-325 (login)         │
│  - Verify credentials               │
│  - Create HS256 JWT via sdk.ts      │
│  - Set httpOnly cookie              │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Browser Storage                    │
│  - Cookie: app_session_id (httpOnly)│
│  - localStorage: FALLBACK ONLY      │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  API Request                        │
│  - Include credentials: 'include'   │
│  - Browser sends cookie auto        │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  context.ts:27-41 (token extract)   │
│  - Check Authorization header       │
│  - Fall back to cookie              │
│  - Extract userToken                │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  sdk.ts:198-234 (verifySession)     │
│  - Verify HS256 HMAC signature      │
│  - Check JTI not revoked (??)       │
│  - Extract openId, appId, jti, exp  │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  db.getUserByOpenId(openId)         │
│  - Database lookup                  │
│  - Return User object               │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Return TrpcContext with user       │
└─────────────────────────────────────┘
```

---

## Storage Comparison Table

| Storage | Key | Content | Security | Lifespan | Risk Level |
|---------|-----|---------|----------|----------|-----------|
| **httpOnly Cookie** | `app_session_id` | HS256 JWT | ✅ XSS-safe | Session (30d) | **LOW** ✅ |
| **localStorage** | `smartspec_auth_token` | JWT token | ❌ XSS-vulnerable | Persistent | **MEDIUM** ⚠️ |
| **localStorage** | `smartspec_user_data` | JSON user object | ❌ XSS-vulnerable | Persistent | **MEDIUM** ⚠️ |
| **sessionStorage** | `smartspec_apikey_*` | LLM API keys | ❌❌ XSS-vulnerable | Session | **CRITICAL** ❌ |
| **Tauri Secure Store** | (native) | Encrypted keys | ✅ OS-protected | Until logout | **LOW** ✅ |

---

## Code Locations: Token Operations

### Create Token (Login)
```
File: apps/web/server/routers.ts
Line: 280-325 (login procedure)
      316-322 (token creation + cookie set)

Code:
  const token = await sdk.createSessionToken(user.openId, {
    name: user.name || user.email || '',
  });
  ctx.res.cookie(COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: THIRTY_DAYS_MS
  });
```

### Verify Token
```
File: apps/web/server/_core/sdk.ts
Line: 198-234 (verifySession)

Code:
  const { payload } = await jwtVerify(cookieValue, secretKey, {
    algorithms: ["HS256"],
  });
  const { openId, appId, name, jti } = payload;
  // TODO: Check if JTI revocation is verified here?
```

### Extract Token from Request
```
File: apps/web/server/_core/context.ts
Line: 27-41 (createContext)

Code:
  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    userToken = authHeader.substring(7);
  } else {
    const cookies = parseCookieHeader(opts.req.headers.cookie);
    const sessionCookie = cookies[COOKIE_NAME];
    if (sessionCookie) {
      userToken = sessionCookie;
    }
  }
```

### Revoke Token (Logout)
```
File: apps/web/server/routers.ts
Line: 182-203 (logout procedure)

Code:
  const cookieValue = ctx.req.cookies?.[COOKIE_NAME];
  if (cookieValue) {
    const session = await sdk.verifySession(cookieValue);
    if (session?.jti) {
      await revokeJti(session.jti, Date.now() + THIRTY_DAYS_MS);
    }
  }
  ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
```

### Clear localStorage (Tauri Fallback)
```
File: apps/web/client/src/services/authService.ts
Line: 141-163 (logout function)

Code:
  localStorage.removeItem('smartspec_auth_token');
  localStorage.removeItem('smartspec_user_data');
  localStorage.removeItem('smartspec_web_refresh_token');
  localStorage.removeItem('smartspec_web_token_expiry');
  localStorage.removeItem('smartspec_web_user');
```

---

## Key Constants & Configs

### Cookie Name
```typescript
// apps/web/shared/const.ts:1
export const COOKIE_NAME = "app_session_id";
```

### Cookie Options
```typescript
// apps/web/server/_core/cookies.ts:71-82
return {
  domain: ".smartspec.pro",      // Subdomain sharing
  httpOnly: true,                 // ✅ Prevents JS access
  path: "/",                      // Sent to all paths
  sameSite: isSecure ? "none" : "lax",  // CSRF protection
  secure: isSecure,               // HTTPS only in prod
};
```

### Session Durations
```typescript
// apps/web/shared/const.ts
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;      // OAuth
export const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;    // Login
export const TWENTY_FOUR_HOURS_MS = 1000 * 60 * 60 * 24;   // Access token
```

---

## Tauri Fallback Flow

### Tauri-First Detection
```typescript
// apps/web/client/src/services/authService.ts:8-14
function hasTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
}

async function safeInvoke<T>(cmd: string, args?: any): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);
}
```

### Storage Priority
```
1. Try: Tauri secure store (safeInvoke)
2. Catch any error? Fall back to localStorage
3. Fall back to sessionStorage for API keys
```

### Tauri Commands
- `get_auth_token` → retrieve JWT from Rust keychain
- `set_auth_token` → store JWT in Rust keychain
- `clear_all_credentials` → wipe all credentials
- `get_api_key` / `set_api_key` → API key management
- `is_authenticated` → check if user logged in

---

## API Key Management (VULNERABLE)

### Current Implementation
```typescript
// apps/web/client/src/services/authService.ts:275-320
export async function setApiKey(provider: LLMProvider, apiKey: string) {
  try {
    if (hasTauri()) {
      await safeInvoke('set_api_key', { provider, apiKey });
      return;
    }
  } catch { /* fallback */ }

  // ⚠️⚠️⚠️ XSS-VULNERABLE
  sessionStorage.setItem(`smartspec_apikey_${provider}`, apiKey);
}

export async function getApiKey(provider: LLMProvider) {
  try {
    if (hasTauri()) {
      return await safeInvoke<string | null>('get_api_key', { provider });
    }
  } catch { /* fallback */ }

  // ⚠️⚠️⚠️ XSS-VULNERABLE
  return sessionStorage.getItem(`smartspec_apikey_${provider}`);
}
```

### Providers Stored
```typescript
export type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'deepseek' | 'google';
```

### TODO
```
Line 272: "Move API keys to server-side encrypted store (crypto.ts AES-256-GCM)"
```

---

## Revocation System

### How It Works
```typescript
// apps/web/server/_core/revocation.ts

// On logout:
await revokeJti(jti, expiresAtMs);
  ↓
  mem.set(jti, expiresAtMs);              // In-memory map
  await r.setEx(`revoked:${jti}`, ttl, "1");  // Redis (with TTL)

// On request:
const isRevoked = await isJtiRevoked(jti);
  ↓
  Check mem first (fastest)
  Fall back to Redis if mem miss
  Return false if no Redis
```

### Revocation Check Location
```
UNKNOWN — Need to verify if verifySession() calls isJtiRevoked()
Location: apps/web/server/_core/sdk.ts:198-234
```

---

## Component Integration

### Most Components Use This Pattern
```typescript
// apps/web/client/src/_core/hooks/useAuth.ts
export function useAuth(options?: UseAuthOptions) {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    error: meQuery.error ?? null,
    isAuthenticated: Boolean(meQuery.data),
  };
}
```

**Key point:** No direct localStorage/sessionStorage access. Auth via tRPC.

### tRPC Auth Procedure
```typescript
// apps/web/server/routers.ts:134-154
auth: router({
  me: publicProcedure.query(opts => {
    if (!opts.ctx.user) return null;
    return {
      id: opts.ctx.user.id,
      email: opts.ctx.user.email || '',
      name: opts.ctx.user.name || opts.ctx.user.email?.split('@')[0] || 'User',
      // ...
    };
  }),
})
```

---

## Testing Checklist

### Verify These Points
- [ ] httpOnly cookie set correctly (no `secure: false` for httpOnly)
- [ ] SameSite=none only when secure=true
- [ ] JTI revocation checked during verification (sdk.ts)
- [ ] Logout clears cookie + revokes JTI
- [ ] Token expires correctly (30 days)
- [ ] 2FA works before session creation
- [ ] Email verification blocks login

### Test Files Location
```
apps/web/server/__tests__/auth-cookies.test.ts
apps/web/server/__tests__/session-validation.test.ts
apps/web/server/auth.logout.test.ts
```

---

## Debugging Tips

### Check If User Is Authenticated
```typescript
// Use hook (recommended)
const { user, isAuthenticated } = useAuth();

// Or tRPC directly
const meQuery = trpc.auth.me.useQuery();
```

### Check Browser Cookies
```javascript
// In browser console
document.cookie
// Shows: "app_session_id=eyJ..."

// Check if httpOnly
// Won't be able to access via JS (that's correct!)
```

### Check Revocation Redis
```bash
# From server terminal
redis-cli
> KEYS "revoked:*"
> TTL "revoked:550e8400-e29b-41d4-a716-446655440000"
```

### Trace Auth Error
```
1. Check server logs for [Auth] messages
2. Look in audit log if available
3. Check context.ts for user == null
4. Verify JTI not revoked
5. Verify openId in database
```

---

## Glossary

- **JWT** — JSON Web Token (format: header.payload.signature)
- **HS256** — HMAC with SHA-256 (symmetric signature)
- **JTI** — JWT ID (unique identifier for revocation)
- **openId** — User's unique ID (email for email/password, OAuth ID for OAuth)
- **appId** — Application ID (smartspec-web)
- **httpOnly** — Cookie flag preventing JavaScript access
- **SameSite** — Cookie flag preventing cross-site request forgery
- **Tauri** — Desktop app framework with native secure storage

---

## Related Documents

- Full research: `AUTH-ARCHITECTURE-RESEARCH-BRIEF.md`
- Executive summary: `AUTH-ARCHITECTURE-EXECUTIVE-SUMMARY.txt`
- This file: Quick reference guide for developers
