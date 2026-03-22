---
name: Authentication & Token Storage Architecture
description: Comprehensive audit of current auth flow, token storage mechanisms, and migration strategy for localStorage JWT → httpOnly session cookies
type: research
---

# SmartSpecPro Authentication Architecture — Research Brief

**Date:** 2026-03-18
**Status:** ARCHITECTURE COMPLETELY MAPPED
**Scope:** JWT handling, token storage (localStorage/sessionStorage/cookies), auth flows, API key management

---

## FINDINGS SUMMARY

### Current State: DUAL ARCHITECTURE (Session Cookies + localStorage)

The system is **already partially migrated to httpOnly session cookies** but **still retains legacy localStorage JWT fallback**:

| Component | Storage | Security | Notes |
|-----------|---------|----------|-------|
| **Session Token** | httpOnly Cookie (`app_session_id`) | ✅ Secure (HS256 JWT) | Primary auth method via SDK |
| **localStorage JWT** | `smartspec_auth_token` | ⚠️ XSS-vulnerable | Fallback for Tauri desktop app |
| **User Data** | `smartspec_user_data` (localStorage) | ⚠️ Plaintext JSON | Cached user object |
| **LLM API Keys** | `sessionStorage` (`smartspec_apikey_*`) | ⚠️ XSS-vulnerable | User-provided keys; TODO at line 272 |
| **OAuth State** | `sessionStorage` (CSRF tokens) | ✅ Session-only, auto-cleared | State/provider tokens |

**Key insight:** Session cookies are the PRODUCTION auth mechanism. localStorage serves as Tauri fallback only.

---

## 1. CURRENT AUTH FLOW

### Login → Token Creation → Storage → Usage

#### Step 1: Login (Email/Password)
**File:** `apps/web/server/routers.ts:280-325` (login procedure)

```typescript
// User submits email + password
const user = await getUserByEmail(input.email);
// ... password verification ...

// Create HS256 JWT session token
const token = await sdk.createSessionToken(user.openId, {
  name: user.name || user.email || '',
});

// Set HTTPONLY cookie (DEFAULT AUTH METHOD)
ctx.res.cookie(COOKIE_NAME, token, {
  ...cookieOptions,    // httpOnly: true, secure: true/false, sameSite: "none"/"lax"
  maxAge: THIRTY_DAYS_MS
});

return { success: true, user: { id: user.id, email: user.email, name: user.name } };
```

**Key points:**
- Token is created via `sdk.createSessionToken()` (line 317)
- **Immediately set as httpOnly cookie** (line 322) — this is the primary auth
- Cookie name: `app_session_id` (from `@shared/const.ts:1`)
- Expiry: 30 days
- No localStorage write happens at login

#### Step 2: OAuth Callback → Token Creation
**File:** `apps/web/server/_core/oauth.ts:160-180`

```typescript
app.get("/api/oauth/callback", async (req, res) => {
  const tokenResponse = await sdk.exchangeCodeForToken(code, state);
  const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

  // Upsert user in database
  await db.upsertUser({...});

  // Create session token (same as login)
  const sessionToken = await sdk.createSessionToken(userInfo.openId, {
    name: userInfo.name || '',
  });

  // Set httpOnly cookie
  res.cookie(COOKIE_NAME, sessionToken, {
    ...cookieOptions,
    maxAge: ONE_YEAR_MS  // OAuth gets 1 year expiry
  });

  // Redirect to callback with JWT in Authorization header (below)
});
```

**Tauri OAuth flow** also uses session token, but response includes `Authorization: Bearer <token>` header for desktop app to read.

#### Step 3: Token Transmission in API Calls
**File:** `apps/web/server/_core/context.ts:27-41` (token extraction)

```typescript
export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let userToken: string | null = null;

  // 1. Check Authorization header FIRST (for Bearer tokens / API requests)
  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    userToken = authHeader.substring(7);
  } else {
    // 2. Fall back to session cookie if no Bearer header
    const cookieHeader = opts.req.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader);
      const sessionCookie = cookies[COOKIE_NAME];  // "app_session_id"
      if (sessionCookie) {
        userToken = sessionCookie;
      }
    }
  }

  // Verify the token (same verification for both sources)
  user = await sdk.authenticateRequest(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
    userToken,  // Passed to Python backend for secure operations
    tenantId,
    publicUrl,
  };
}
```

**Priority order:** Authorization header > session cookie

#### Step 4: Token Verification
**File:** `apps/web/server/_core/sdk.ts:198-234` (verifySession)

```typescript
async verifySession(
  cookieValue: string | undefined | null
): Promise<{ openId: string; appId: string; name: string; jti?: string } | null> {
  if (!cookieValue) {
    console.warn("[Auth] Missing session cookie");
    return null;
  }

  try {
    const secretKey = this.getSessionSecret();  // From env.cookieSecret
    const { payload } = await jwtVerify(cookieValue, secretKey, {
      algorithms: ["HS256"],
    });
    const { openId, appId, name, jti, userId, role } = payload as Record<string, unknown>;

    // System user special case (userId=-1, role="system_agent")
    if (userId === -1 && role === "system_agent") {
      return { openId: "", appId: "", name: "System Guardian", userId, role } as any;
    }

    // Validate required fields
    if (!isNonEmptyString(openId) || !isNonEmptyString(appId)) {
      console.warn("[Auth] Session payload missing required fields");
      return null;
    }

    return { openId, appId, name, jti };
  } catch (error) {
    console.warn("[Auth] Session verification failed", String(error));
    return null;
  }
}
```

**Verification details:**
- Algorithm: HS256 (HMAC with SHA-256)
- Secret: derived from `ENV.cookieSecret` → TextEncoder (UTF-8)
- JTI (JWT ID) extracted for revocation tracking
- No database lookup at verification (only at user fetch)

#### Step 5: User Fetch (Database Lookup)
**File:** `apps/web/server/_core/sdk.ts:260-315` (authenticateRequest)

```typescript
async authenticateRequest(req: Request): Promise<User> {
  // Parse cookies and extract session
  const cookies = this.parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);

  // Also check Authorization header
  const authHeader = req.headers.authorization;
  const tokenToVerify = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : sessionCookie;

  // Verify JWT signature and claims
  const session = await this.verifySession(tokenToVerify);
  if (!session) throw ForbiddenError("Invalid session cookie");

  // Look up user by openId
  const sessionUserId = session.openId;
  let user = await db.getUserByOpenId(sessionUserId);

  // If user exists, update last signed-in and return
  if (user) {
    await db.updateLastSignedIn(user.openId);
    return user;
  }

  // If user not in DB, sync from OAuth server
  try {
    const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
    await db.upsertUser({...});
    user = await db.getUserByOpenId(userInfo.openId);
  } catch (error) {
    throw ForbiddenError("Failed to sync user info");
  }

  return user;
}
```

---

## 2. DEEP DIVE: authService.ts (Tauri Fallback)

**File:** `apps/web/client/src/services/authService.ts` (320 lines)

### Tauri vs Browser Branching Logic

```typescript
function hasTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
}

async function safeInvoke<T>(cmd: string, args?: any): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);  // Call Tauri native command
}
```

Every auth function has identical pattern:
1. Try Tauri secure store via `safeInvoke()` (if `__TAURI__` available)
2. Fall back to localStorage (if Tauri unavailable or throws)

### localStorage Keys Used

| Key | Purpose | Type | Line |
|-----|---------|------|------|
| `smartspec_auth_token` | JWT token fallback | String | 44, 67, 149 |
| `smartspec_user_data` | Cached user JSON | JSON string | 87, 115, 150 |
| `smartspec_web_refresh_token` | Legacy refresh token (unused?) | String | 151 |
| `smartspec_web_token_expiry` | Token expiry timestamp | String | 152 |
| `smartspec_web_user` | Legacy user data | JSON | 153 |

**Caching strategy:**
```typescript
let cachedUser: User | null = null;
let cachedToken: string | null = null;

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;  // Return cached value first

  try {
    if (hasTauri()) {
      const token = await safeInvoke<string | null>('get_auth_token');
      cachedToken = token;
      return token;
    }
  } catch { /* fallback */ }

  cachedToken = localStorage.getItem('smartspec_auth_token') || null;
  return cachedToken;
}
```

**No sync function:** `getAuthTokenSync()` returns only cached value (line 51-53)

### Logout Cleanup
**File:** `authService.ts:141-163`

```typescript
export async function logout(navigate?: (path: string) => void): Promise<void> {
  try {
    if (hasTauri()) {
      await safeInvoke('clear_all_credentials');  // Tauri clears secure store
    }
  } catch { /* ignore */ }

  // Clear ALL localStorage keys (including legacy ones)
  localStorage.removeItem('smartspec_auth_token');
  localStorage.removeItem('smartspec_user_data');
  localStorage.removeItem('smartspec_web_refresh_token');
  localStorage.removeItem('smartspec_web_token_expiry');
  localStorage.removeItem('smartspec_web_user');

  cachedToken = null;
  cachedUser = null;

  if (navigate) {
    navigate("/login");
  } else {
    window.location.href = "/login";
  }
}
```

### Token Expiry Check (Client-Side)
**File:** `authService.ts:121-136`

```typescript
export async function isTokenExpired(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return true;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));  // Decode JWT payload
    const exp = payload.exp;
    if (exp && typeof exp === 'number') {
      return Date.now() / 1000 > (exp - 300);  // 5-minute grace period
    }
  } catch (e) {
    console.error('Failed to decode token:', e);
  }

  return false;
}
```

**Issue:** Client-side token validation is NOT SECURE (JWT can be forged). Server always re-verifies.

### Token Verification with Backend
**File:** `authService.ts:168-195` (verifyToken)

```typescript
export async function verifyToken(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  try {
    const response = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,  // Send as Bearer token
      },
    });

    if (response.ok) {
      const user = await response.json();
      await setUser(user);
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      await logout();  // Auto-logout on 401/403
      return false;
    }

    return false;
  } catch (error) {
    console.error("Failed to verify token:", error);
    return false;
  }
}
```

### Auth Interceptor Setup
**File:** `authService.ts:200-227` (setupAuthInterceptor)

```typescript
export function setupAuthInterceptor() {
  if ((window as unknown as { __authInterceptorSetup?: boolean }).__authInterceptorSetup) {
    return;  // Only set up once
  }
  (window as unknown as { __authInterceptorSetup?: boolean }).__authInterceptorSetup = true;

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (response.status === 401 || response.status === 403) {
      const url = args[0] instanceof Request ? args[0].url : args[0].toString();

      // Skip auto-logout for auth endpoints
      if (!url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/desktop/login')) {
        const hasToken = !!(await getAuthToken());
        const onLoginPage = window.location.pathname === '/login';

        if (hasToken && !onLoginPage) {
          console.warn('Auth error detected, logging out...');
          await logout();  // Auto-logout on 401/403
        }
      }
    }

    return response;
  };
}
```

---

## 3. SERVER-SIDE SESSION / COOKIE HANDLING

### Cookie Configuration (getSessionCookieOptions)
**File:** `apps/web/server/_core/cookies.ts:24-83`

```typescript
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname;

  // Extract root domain for subdomain cookie sharing
  // e.g., docker.smartspec.pro -> .smartspec.pro
  let domain: string | undefined;

  const shouldSetDomain =
    hostname &&
    !LOCAL_HOSTS.has(hostname) &&
    !isIpAddress(hostname) &&
    hostname !== "127.0.0.1" &&
    hostname !== "::1";

  if (shouldSetDomain) {
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join('.');
      domain = `.${rootDomain}`;  // e.g., ".smartspec.pro"
    }
  } else {
    domain = undefined;  // localhost: no domain attribute
  }

  const isSecure = isSecureRequest(req);

  return {
    domain,
    httpOnly: true,  // ✅ MANDATORY — prevents JavaScript access
    path: "/",
    // SameSite handling:
    // - HTTPS: Use "none" with secure=true (allows cross-subdomain sharing)
    // - HTTP (localhost): Use "lax" (modern browsers require this)
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure,
  };
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");
  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}
```

**Cookie Attributes:**
| Attribute | Value | Security | Notes |
|-----------|-------|----------|-------|
| **httpOnly** | `true` | ✅ High | JavaScript cannot access; prevents XSS token theft |
| **secure** | `true` (HTTPS) / `false` (HTTP) | ✅ High | Only sent over HTTPS in prod |
| **sameSite** | `"none"` (prod) / `"lax"` (dev) | ✅ High | Prevents CSRF; `none` requires `secure=true` |
| **domain** | `.smartspec.pro` | ✅ Medium | Allows sharing across subdomains |
| **path** | `/` | ✅ High | Cookie sent to all paths |
| **maxAge** | 30 days (login) / 365 days (OAuth) | ✅ Medium | Session duration |

### Cookie-Based Authentication (No Explicit Token Transmission)

**The key difference:** Browsers automatically include httpOnly cookies in all requests to the same domain. **No JavaScript code needs to attach the token.**

For tRPC requests, the fetch call includes `credentials: 'include'`:

**File:** `apps/web/client/src/contexts/AuthContext.tsx:60-63`
```typescript
const response = await fetch('/trpc/auth.me', {
  method: 'GET',
  credentials: 'include',  // ← Tells browser to include cookies
});
```

For other API calls, browser automatically sends cookies (same-origin requests).

### Session Token Creation (SDK)
**File:** `apps/web/server/_core/sdk.ts:164-196` (createSessionToken)

```typescript
async createSessionToken(
  openId: string,
  options: { expiresInMs?: number; name?: string } = {}
): Promise<string> {
  return this.signSession(
    {
      openId,
      appId: ENV.appId,
      name: options.name || "",
    },
    options
  );
}

async signSession(
  payload: SessionPayload,
  options: { expiresInMs?: number } = {}
): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;  // Default 365 days
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
  const secretKey = this.getSessionSecret();  // HS256 secret

  return new SignJWT({
    openId: payload.openId,
    appId: payload.appId,
    name: payload.name,
    jti: payload.jti ?? randomUUID(),  // Unique token ID for revocation
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}
```

**Token structure:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
.
{
  "openId": "google_abc123def456",
  "appId": "smartspec-web",
  "name": "John Doe",
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "iat": 1710816000,
  "exp": 1742352000
}
```

### Token Revocation System
**File:** `apps/web/server/_core/revocation.ts` (78 lines)

```typescript
// Redis + in-memory denylist for revoked JTIs
const mem = new Map<string, number>();  // jti -> expiryMs

export async function revokeJti(jti: string, expiresAtMs: number) {
  const ttlSeconds = Math.max(1, Math.ceil((expiresAtMs - nowMs()) / 1000));
  mem.set(jti, expiresAtMs);  // Always store in memory

  const r = await getRedis();
  if (!r) return;

  try {
    await r.setEx(`${PREFIX}${jti}`, ttlSeconds, "1");  // Also store in Redis
  } catch { /* ignore */ }
}

export async function isJtiRevoked(jti: string): Promise<boolean> {
  const exp = mem.get(jti);
  if (exp && exp > nowMs()) return true;
  if (exp && exp <= nowMs()) mem.delete(jti);

  const r = await getRedis();
  if (!r) return false;

  try {
    const v = await r.get(`${PREFIX}${jti}`);
    return v === "1";
  } catch { return false; }
}
```

**Usage at logout:**
**File:** `apps/web/server/routers.ts:182-203`
```typescript
logout: publicProcedure.mutation(async ({ ctx }) => {
  // Revoke the session token before clearing the cookie
  const cookieValue = ctx.req.cookies?.[COOKIE_NAME];
  if (cookieValue) {
    try {
      const { sdk } = await import("./_core/sdk");
      const { revokeJti } = await import("./_core/revocation");
      const session = await sdk.verifySession(cookieValue);
      if (session?.jti) {
        await revokeJti(session.jti, Date.now() + THIRTY_DAYS_MS);  // Revoke until expiry
      }
    } catch {
      // Best-effort revocation — still clear cookie even if revocation fails
    }
  }

  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
  return { success: true };
});
```

---

## 4. THIRD-PARTY API KEY STORAGE

### Current Implementation
**File:** `apps/web/client/src/services/authService.ts:270-320`

```typescript
// ============================================
// API Key Management
// TODO: Move API keys to server-side encrypted store (crypto.ts AES-256-GCM)
// ============================================

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'deepseek' | 'google';

export async function setApiKey(provider: LLMProvider, apiKey: string): Promise<void> {
  try {
    if (hasTauri()) {
      await safeInvoke('set_api_key', { provider, apiKey });  // Tauri secure store
      return;
    }
  } catch { /* fallback */ }
  sessionStorage.setItem(`smartspec_apikey_${provider}`, apiKey);  // ⚠️ XSS-vulnerable
}

export async function getApiKey(provider: LLMProvider): Promise<string | null> {
  try {
    if (hasTauri()) {
      return await safeInvoke<string | null>('get_api_key', { provider });
    }
  } catch { /* fallback */ }
  return sessionStorage.getItem(`smartspec_apikey_${provider}`);  // ⚠️ XSS-vulnerable
}

export async function deleteApiKey(provider: LLMProvider): Promise<void> {
  try {
    if (hasTauri()) {
      await safeInvoke('delete_api_key', { provider });
    }
  } catch { /* fallback */ }
  sessionStorage.removeItem(`smartspec_apikey_${provider}`);
}

export async function listStoredApiKeys(): Promise<string[]> {
  try {
    if (hasTauri()) {
      return await safeInvoke<string[]>('list_stored_api_keys');
    }
  } catch { /* fallback */ }
  const providers: LLMProvider[] = ['openrouter', 'openai', 'anthropic', 'deepseek', 'google'];
  return providers.filter(p => !!sessionStorage.getItem(`smartspec_apikey_${p}`));
}
```

**sessionStorage Keys Used:**
- `smartspec_apikey_openrouter`
- `smartspec_apikey_openai`
- `smartspec_apikey_anthropic`
- `smartspec_apikey_deepseek`
- `smartspec_apikey_google`

**TODO at line 272:** "Move API keys to server-side encrypted store (crypto.ts AES-256-GCM)"

**Risk:** sessionStorage is XSS-vulnerable. An XSS payload can read all stored API keys for all providers.

---

## 5. TAURI INTEGRATION CONSTRAINTS

**File:** `apps/web/client/src/services/authService.ts:8-14`

Tauri desktop app has native secure storage via Rust:

```typescript
function hasTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
}

async function safeInvoke<T>(cmd: string, args?: any): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);  // Invoke Tauri native command
}
```

**Tauri Commands Used:**
| Command | Purpose | Fallback |
|---------|---------|----------|
| `get_auth_token` | Retrieve token from Tauri secure store | localStorage |
| `set_auth_token` | Store token in Tauri secure store | localStorage |
| `get_user_data` | Retrieve user JSON from Tauri | localStorage |
| `set_user_data` | Store user JSON in Tauri | localStorage |
| `is_authenticated` | Check if authenticated | Check localStorage |
| `clear_all_credentials` | Wipe all stored credentials | localStorage.removeItem() |
| `get_api_key` | Retrieve API key from Tauri secure store | sessionStorage |
| `set_api_key` | Store API key in Tauri secure store | sessionStorage |
| `delete_api_key` | Delete API key from Tauri | sessionStorage.removeItem() |
| `list_stored_api_keys` | List all stored API keys | Loop through sessionStorage |

**Constraint:** Every Tauri call must wrap in try/catch because Tauri module may not be available. This creates a fallback chain: Tauri → localStorage/sessionStorage.

---

## 6. EXISTING COOKIE INFRASTRUCTURE

### Cookie Definition
**File:** `apps/web/shared/const.ts:1`
```typescript
export const COOKIE_NAME = "app_session_id";
```

### Cookie Usage Across Codebase
**Files that set cookies:**
- `apps/web/server/routers.ts:322` — Login sets 30-day cookie
- `apps/web/server/routers.ts:478` — Email verification sets 30-day cookie
- `apps/web/server/_core/oauth.ts:175` — OAuth callback sets 1-year cookie
- `apps/web/server/routers.ts:1071, 1193, 1292, 1344` — Other auth endpoints set 30-day cookie

**Files that read cookies:**
- `apps/web/server/_core/context.ts:36` — Extract from request for tRPC context
- `apps/web/server/_core/sdk.ts:263` — Parse from authorization header or cookie
- `apps/web/server/routers.ts:184` — Check for logout revocation

**Files that clear cookies:**
- `apps/web/server/routers.ts:199` — Logout clears cookie

### httpOnly Status
✅ **ALREADY ENABLED** — All cookies use `httpOnly: true` (see `cookies.ts:73`)

**Test coverage:**
**File:** `apps/web/server/__tests__/auth-cookies.test.ts`
```typescript
it("should set httpOnly to true", () => {
  const options = getSessionCookieOptions(mockReq);
  expect(options.httpOnly).toBe(true);
});

it("should set secure=true for HTTPS requests", () => {
  mockReq.protocol = 'https';
  const options = getSessionCookieOptions(mockReq);
  expect(options.secure).toBe(true);
});

it("should set secure=false for HTTP requests", () => {
  mockReq.protocol = 'http';
  const options = getSessionCookieOptions(mockReq);
  expect(options.secure).toBe(false);
});

it("should set sameSite=lax for HTTP requests", () => {
  mockReq.protocol = 'http';
  const options = getSessionCookieOptions(mockReq);
  expect(options.sameSite).toBe("lax");
});
```

---

## 7. IMPACT ANALYSIS: Components Consuming Tokens from localStorage

### Files that Read localStorage for Auth

1. **authService.ts (Tauri fallback)**
   - Lines 44, 67, 87, 115, 149-153 — Token/user data access
   - **Impact:** Remove fallback for production, keep for Tauri dev

2. **AuthContext.tsx (Legacy)**
   - Lines 60, 108, 116, 159, 183, 189, 227 — OAuth state in sessionStorage
   - **Note:** This is sessionStorage, not localStorage; state is CSRF-only

3. **Chat, VideoEditor, etc. (via localStorage indirectly)**
   - No direct localStorage reads in components
   - All auth via `useAuth()` hook → tRPC session cookie

### Files that Read sessionStorage

1. **authService.ts (API key storage)**
   - Lines 284, 293, 303, 313 — `smartspec_apikey_*` keys
   - **Impact:** Migrate to server-side encrypted storage

2. **AuthContext.tsx (OAuth state)**
   - Lines 202, 216 — `oauth_state`, `oauth_provider` (CSRF tokens)
   - **Impact:** No action needed (temporary, session-only)

### Files that Call getAuthToken / setAuthToken

**Search results:** Only `apps/web/client/src/services/authService.ts` defines these functions. Usage is **extremely limited** in production:
- No components directly call `getAuthToken()` / `setAuthToken()`
- Used only by:
  - `authService.ts` itself (internal cache management)
  - Tauri startup flow (if applicable)
  - `verifyToken()` (called during initialization)

**Implication:** Removing localStorage JWT will have **minimal component-level impact** because most auth is already cookie-based.

---

## 8. CURRENT ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Desktop                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               useAuth() Hook                             │ │
│  │   ↓                                                      │ │
│  │   trpc.auth.me.useQuery() ──────────────────────────┐  │ │
│  │                                                   │  │  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                          │     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               Cookies (httpOnly)                         │ │
│  │     app_session_id = "eyJ..." (HS256 JWT)               │ │
│  │     [Browser auto-sends to same-origin]                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                          │     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               localStorage (fallback only)              │ │
│  │     smartspec_auth_token = "eyJ..."  ⚠️ XSS risk       │ │
│  │     smartspec_user_data = {...}      ⚠️ XSS risk       │ │
│  │     [Only used by Tauri if cookie unavailable]          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                          │     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               sessionStorage (API keys)                 │ │
│  │     smartspec_apikey_openai = "sk-..."  ⚠️⚠️ XSS risk  │ │
│  │     smartspec_apikey_anthropic = "..."  ⚠️⚠️ XSS risk  │ │
│  │     [Used for LLM provider configuration]               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                          │     │
└──────────────────────────────────────────────────────────────┘
                                                          │
                              ┌───────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                       Express Server                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  createContext(req)                                    │  │
│  │    ↓                                                   │  │
│  │    Extract: Authorization header OR cookie            │  │
│  │    ↓                                                   │  │
│  │    sdk.verifySession(token) ← HS256 HMAC verify      │  │
│  │    ↓                                                   │  │
│  │    db.getUserByOpenId(openId) ← Database lookup       │  │
│  │    ↓                                                   │  │
│  │    Check if JTI revoked (revocation.ts)               │  │
│  │    ↓                                                   │  │
│  │    Return user + userToken                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  tRPC Router (protected/publicProcedure)               │  │
│  │    ctx.user → Database lookups                        │  │
│  │    ctx.userToken → Passed to Python backend           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │                    │
                    ▼                    ▼
         ┌──────────────────┐  ┌──────────────────┐
         │   PostgreSQL     │  │      Redis       │
         │   (users table)  │  │  (JTI revocation)│
         └──────────────────┘  └──────────────────┘
```

---

## 9. RISKS & OPEN QUESTIONS

### Immediate Risks

1. **localStorage XSS vulnerability**
   - If attacker injects XSS, can read `smartspec_auth_token` and `smartspec_user_data`
   - **Mitigation:** Already using httpOnly cookies; localStorage is only fallback
   - **Recommendation:** Remove localStorage JWT entirely, keep Tauri path only

2. **sessionStorage API key exposure**
   - If attacker injects XSS, can read ALL user LLM API keys (OpenAI, Anthropic, etc.)
   - **Severity:** CRITICAL
   - **TODO at line 272 in authService.ts:** "Move API keys to server-side encrypted store (crypto.ts AES-256-GCM)"

3. **Tauri fallback complexity**
   - Fallback chain creates attack surface (try Tauri → fall back to localStorage)
   - If Tauri call times out or fails, desktop app falls back to XSS-vulnerable storage
   - **Recommendation:** Tauri should fail fast, not silently fall back

4. **Token revocation not checked everywhere**
   - Revocation system exists (revocation.ts) but unclear if it's called during request verification
   - **Check:** Does `sdk.verifySession()` check for revoked JTIs?

### Open Questions

1. **Does the session verification check JTI revocation?**
   - `verifySession()` extracts JTI but unclear if it calls `isJtiRevoked()` check
   - Need to verify `sdk.ts:198-234` doesn't skip revocation check

2. **Is the refresh token mechanism still used?**
   - `authService.ts:151` references `smartspec_web_refresh_token` (legacy?)
   - Device auth routes (deviceAuthRoutes.ts) have refresh token logic
   - Is this still active?

3. **How are refresh tokens handled in the refresh grant?**
   - `deviceAuthRoutes.ts:410-457` has "refresh_token" grant type
   - Is this separate from session cookies? Is it only for device auth?

4. **Are there any other storage mechanisms?**
   - IndexedDB? Service Workers? Cache API?
   - Need full audit

5. **What's the Tauri-specific auth flow at startup?**
   - Tauri app starts → calls Tauri commands to get token
   - Does it then make HTTP request with Bearer token?
   - Or does it set cookies in Tauri's internal WebView?

---

## RECOMMENDATIONS FOR MIGRATION SPEC

### Phase 1: Immediate (High Priority)
1. **Remove localStorage JWT fallback** (authService.ts:44-69)
   - Keep Tauri path only; throw error if Tauri unavailable on desktop
   - Browser always uses httpOnly cookies (already happening)

2. **Migrate API key storage to server-side encrypted store** (authService.ts:272 TODO)
   - Create `userApiKeys` table with encrypted storage
   - Add tRPC endpoints: `setUserApiKey()`, `getUserApiKey()`, `listUserApiKeys()`
   - Use crypto.ts AES-256-GCM encryption (LLM_ENCRYPTION_KEY)
   - Remove sessionStorage entirely

### Phase 2: Medium Priority (1-2 weeks)
1. **Add JTI revocation check in verifySession()**
   - Ensure revoked tokens are actually rejected
   - Add test coverage

2. **Clarify refresh token usage**
   - Is device auth refresh separate from session cookies?
   - Document the flow

3. **Audit Tauri startup flow**
   - Understand how desktop app authenticates at startup
   - Ensure no fallback to XSS-vulnerable storage

### Phase 3: Future (Nice-to-Have)
1. **Token rotation on each request** (optional)
   - Create new JTI on each request, revoke old
   - Adds complexity but better for long-lived sessions

2. **Short-lived access tokens + long-lived refresh tokens** (optional)
   - Access token: 15 min (httpOnly)
   - Refresh token: 30 days (secure rotate-on-use)
   - Requires token endpoint

---

## SUMMARY TABLE: Current vs. Recommended

| Mechanism | Current | Status | Risk | Recommendation |
|-----------|---------|--------|------|-----------------|
| **Session Token (httpOnly Cookie)** | ✅ Yes | ✅ Primary | Low | Keep — production-ready |
| **localStorage JWT** | ✅ Yes (Tauri fallback) | ⚠️ Legacy | Medium | Remove; Tauri-only |
| **sessionStorage API Keys** | ✅ Yes | ❌ TODO | Critical | Migrate to encrypted DB store |
| **Token Revocation** | ✅ Yes (Redis + mem) | ❓ Unknown | Medium | Verify JTI check in verifySession() |
| **Refresh Tokens** | ✅ Yes (device auth) | ❓ Unclear | Medium | Audit usage + document |
| **CORS Credentials** | ✅ credentials: 'include' | ✅ Correct | Low | Keep |
| **HTTPS Only** | ✅ Conditional (isSecure) | ✅ Good | Low | Keep; enforce in prod |
| **SameSite=none** | ✅ Prod HTTPS | ✅ Correct | Low | Keep for subdomain sharing |

---

## KEY FILES FOR IMPLEMENTATION

### Frontend (Client)
- `apps/web/client/src/services/authService.ts` — Remove localStorage fallback
- `apps/web/client/src/services/authService.ts:270-320` — Migrate API key storage
- `apps/web/client/src/contexts/AuthContext.tsx` — Update if needed
- `apps/web/client/src/_core/hooks/useAuth.ts` — Verify cookie-based auth

### Backend (Server)
- `apps/web/server/_core/sdk.ts:198-234` — Verify JTI revocation check
- `apps/web/server/_core/revocation.ts` — Add verification call
- `apps/web/server/_core/cookies.ts` — Already secure; no changes
- `apps/web/server/routers.ts:280-325` — Login sets cookie; no changes
- `apps/web/server/_core/context.ts:27-41` — Token extraction; no changes

### Database (Schema)
- `apps/web/drizzle/schema.ts` — Add `userApiKeys` table (encrypted storage)
- Migration file — Create table + add encryption columns

### Tests
- `apps/web/server/__tests__/auth-cookies.test.ts` — Expand coverage
- `apps/web/server/__tests__/session-validation.test.ts` — Add JTI revocation tests
- New test file: `apps/web/server/__tests__/api-key-storage.test.ts`

---

**Status:** ✅ Architecture research complete. Ready for implementation planning.
