# Section 18: Auth & Session Hardening

## Overview

This section hardens the existing JWT-based authentication system for production Cloud Run deployment. The codebase already has auth foundations (HttpOnly Secure cookies, role-based access, bearer tokens) — this section focuses on production-specific hardening: cookie domain configuration, CSRF protection, and DB-backed session validation.

## Dependencies

**Required sections:**
- Section 3 (Database Setup) — Session validation requires DB connection
- Section 10 (Redis Rate Limiting) — Rate limiting for auth endpoints uses Redis

**Blocks:**
- Section 19 (Load Testing) — Auth hardening must be complete before load tests
- Section 20 (Production Hardening) — Final launch checklist validates auth configuration

## Tests First

The following test stubs define the expected behavior. Implement these tests before writing implementation code.

### Cookie Configuration Tests (Vitest)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/auth-cookies.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer } from '../_testUtils/testServer';
import type { Express } from 'express';

describe('Cookie Configuration', () => {
  let app: Express;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should set cookie domain to .smartaihub.app in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DOMAIN = 'app.smartaihub.app';
    app = await createTestServer();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie[0]).toContain('Domain=.smartaihub.app');
  });

  it('should set cookie with Secure, HttpOnly, SameSite=Lax attributes', async () => {
    process.env.NODE_ENV = 'production';
    app = await createTestServer();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    const setCookie = response.headers['set-cookie'][0];
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('should not set cookie domain in development (localhost)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DOMAIN;
    app = await createTestServer();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    const setCookie = response.headers['set-cookie'][0];
    expect(setCookie).not.toContain('Domain=');
  });
});
```

### CSRF Protection Tests (Vitest)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/csrf-protection.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createTestServer } from '../_testUtils/testServer';

describe('CSRF Protection', () => {
  it('should reject POST request without Origin header', async () => {
    const app = await createTestServer();

    const response = await request(app)
      .post('/api/jobs')
      .set('Cookie', 'SMARTSPEC_SESSIONID=valid-token')
      .send({ type: 'image-generation' });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('CSRF');
  });

  it('should accept POST request with correct Origin header', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.smartaihub.app';
    const app = await createTestServer();

    const response = await request(app)
      .post('/api/jobs')
      .set('Cookie', 'SMARTSPEC_SESSIONID=valid-token')
      .set('Origin', 'https://app.smartaihub.app')
      .send({ type: 'image-generation' });

    expect(response.status).not.toBe(403);
  });

  it('should reject POST request with mismatched Origin', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.smartaihub.app';
    const app = await createTestServer();

    const response = await request(app)
      .post('/api/jobs')
      .set('Cookie', 'SMARTSPEC_SESSIONID=valid-token')
      .set('Origin', 'https://evil.com')
      .send({ type: 'image-generation' });

    expect(response.status).toBe(403);
  });

  it('should allow GET request without CSRF check', async () => {
    const app = await createTestServer();

    // GET requests are safe (read-only) and don't need CSRF protection
    const response = await request(app)
      .get('/api/jobs/status/123')
      .set('Cookie', 'SMARTSPEC_SESSIONID=valid-token');

    expect(response.status).not.toBe(403);
  });
});
```

### Session Validation Tests (Vitest)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/session-validation.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { sessions } from '../../drizzle/schema';
import { createTestServer } from '../_testUtils/testServer';
import { signJWT } from '../_core/jwt';

describe('Session Validation', () => {
  beforeEach(async () => {
    // Clean sessions table before each test
    await db.delete(sessions);
  });

  it('should accept valid JWT with active session', async () => {
    const userId = 'user-123';
    const sessionId = 'session-456';

    // Create active session in DB
    await db.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const token = await signJWT({ userId, sessionId });
    const app = await createTestServer();

    const response = await request(app)
      .get('/api/user/profile')
      .set('Cookie', `SMARTSPEC_SESSIONID=${token}`);

    expect(response.status).toBe(200);
  });

  it('should reject valid JWT with revoked session', async () => {
    const userId = 'user-123';
    const sessionId = 'session-456';

    // Session was deleted (revoked)
    // No entry in sessions table

    const token = await signJWT({ userId, sessionId });
    const app = await createTestServer();

    const response = await request(app)
      .get('/api/user/profile')
      .set('Cookie', `SMARTSPEC_SESSIONID=${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('session');
  });

  it('should reject expired JWT', async () => {
    const userId = 'user-123';
    const sessionId = 'session-456';

    // Create expired session
    await db.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() - 1000), // Already expired
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });

    const token = await signJWT({ userId, sessionId });
    const app = await createTestServer();

    const response = await request(app)
      .get('/api/user/profile')
      .set('Cookie', `SMARTSPEC_SESSIONID=${token}`);

    expect(response.status).toBe(401);
  });

  it('should reject JWT without session in DB', async () => {
    const token = await signJWT({ userId: 'user-999', sessionId: 'session-999' });
    const app = await createTestServer();

    const response = await request(app)
      .get('/api/user/profile')
      .set('Cookie', `SMARTSPEC_SESSIONID=${token}`);

    expect(response.status).toBe(401);
  });
});
```

## Implementation Details

### 1. Cookie Domain Configuration

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/cookies.ts`

**Current behavior:** The existing `cookies.ts` module sets `Secure: true` and `HttpOnly: true` for all environments, but does not set a `Domain` attribute.

**Required changes:**

```typescript
// apps/web/server/_core/cookies.ts

export interface CookieOptions {
  name: string;
  value: string;
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  domain?: string;
}

export function getCookieDomain(): string | undefined {
  // In production, set domain to allow cookie sharing across subdomains
  if (process.env.NODE_ENV === 'production' && process.env.DOMAIN) {
    // Extract base domain from DOMAIN env var
    // app.smartaihub.app → .smartaihub.app
    const domain = process.env.DOMAIN.replace(/^[^.]+\./, '.');
    return domain;
  }
  // In development (localhost), do not set domain
  return undefined;
}

export function setAuthCookie(res: Response, token: string) {
  const domain = getCookieDomain();

  res.cookie('SMARTSPEC_SESSIONID', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
    ...(domain && { domain }), // Only set if domain is defined
  });
}
```

**Environment variable:**
- Add `DOMAIN=app.smartaihub.app` to GCP Secret Manager and mount in Cloud Run service

### 2. CSRF Protection Middleware

**Files to create:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/csrf.ts`

**Implementation pattern:**

```typescript
// apps/web/server/middleware/csrf.ts
import type { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF check for safe methods (read-only)
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip for health check endpoints
  if (req.path === '/healthz' || req.path === '/readyz') {
    return next();
  }

  // Get allowed origins from env
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  // In development, allow localhost
  if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
  }

  // Check Origin header
  const origin = req.get('Origin') || req.get('Referer');

  if (!origin) {
    return res.status(403).json({
      error: 'CSRF validation failed: missing Origin header',
      code: 'CSRF_MISSING_ORIGIN',
    });
  }

  // Extract origin from Referer if needed
  const requestOrigin = origin.includes('://')
    ? new URL(origin).origin
    : origin;

  if (!allowedOrigins.includes(requestOrigin)) {
    return res.status(403).json({
      error: 'CSRF validation failed: invalid Origin',
      code: 'CSRF_INVALID_ORIGIN',
      origin: requestOrigin,
    });
  }

  next();
}
```

**Apply middleware:**

```typescript
// apps/web/server/index.ts
import { csrfProtection } from './middleware/csrf';

// Apply CSRF protection to all routes except public ones
app.use('/api', csrfProtection);
app.use('/trpc', csrfProtection);
```

**Environment variables:**
- `ALLOWED_ORIGINS=https://app.smartaihub.app,https://www.smartaihub.app` (stored in Secret Manager)

### 3. DB-Backed Session Validation

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/auth.ts`

**Current behavior:** The auth middleware verifies JWT signature and extracts `userId`, but does not check if the session exists in the database.

**Required changes:**

```typescript
// apps/web/server/middleware/auth.ts
import { db } from '../db';
import { sessions, users } from '../../drizzle/schema';
import { eq, and, gt } from 'drizzle-orm';
import { verifyJWT } from '../_core/jwt';

export async function authenticateRequest(req: Request): Promise<User | null> {
  // Extract token from cookie or Authorization header
  const token = req.cookies.SMARTSPEC_SESSIONID ||
                req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return null;
  }

  // Verify JWT signature and extract payload
  let payload: { userId: string; sessionId: string };
  try {
    payload = await verifyJWT(token);
  } catch (err) {
    // Invalid or expired token
    return null;
  }

  // Check session exists in database and is not expired
  const session = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, payload.sessionId),
        eq(sessions.userId, payload.userId),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1)
    .then(rows => rows[0]);

  if (!session) {
    // Session was revoked or expired
    return null;
  }

  // Fetch user data
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1)
    .then(rows => rows[0]);

  if (!user) {
    // User deleted
    return null;
  }

  return user;
}
```

**Performance optimization:** Consider caching session validation results in Redis for 1 minute to reduce DB load:

```typescript
// Pseudo-code for cached session validation
const cacheKey = `session:${sessionId}`;
const cached = await redis.cache.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

const session = await db.select()...;
if (session) {
  await redis.cache.setex(cacheKey, 60, JSON.stringify(session));
}
return session;
```

### 4. Session Revocation Endpoint

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/auth.ts`

**Add logout endpoint:**

```typescript
// apps/web/server/routers/auth.ts
router.post('/logout', async (req, res) => {
  const user = await authenticateRequest(req);

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Extract sessionId from JWT
  const token = req.cookies.SMARTSPEC_SESSIONID;
  const payload = await verifyJWT(token);

  // Delete session from database
  await db
    .delete(sessions)
    .where(eq(sessions.id, payload.sessionId));

  // Clear cookie
  res.clearCookie('SMARTSPEC_SESSIONID', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    domain: getCookieDomain(),
  });

  return res.json({ success: true });
});
```

### 5. Cloud Run Configuration

**No code changes required** — Cloud Run provides TLS termination automatically. Verify the following in Cloud Run service configuration:

- `--ingress=all` (allow traffic from internet)
- `--allow-unauthenticated` (for public endpoints; auth is handled at application level)
- HTTPS is enforced by default; HTTP requests are auto-redirected to HTTPS

**Service-to-service auth:** When the Node.js service calls the Python service (or vice versa), use OIDC tokens instead of user session cookies. This is already covered in Section 4 (Cloud Tasks OIDC Validation).

## Actual Implementation

### Deviations from Plan

The existing codebase already had most auth infrastructure in place. Key differences:

1. **No sessions table** — System uses stateless JWTs with JTI-based revocation (in-memory + Redis), not DB-backed sessions. This is architecturally correct and was not changed.
2. **Cookie configuration already existed** — `_core/cookies.ts` already handled domain extraction, HttpOnly, Secure, SameSite.
3. **CSRF protection already existed** — Inline in `_core/index.ts` checking Origin header on POST/PUT/PATCH/DELETE.
4. **Cookie name is `app_session_id`** — Not `SMARTSPEC_SESSIONID` as plan assumed.
5. **Test patterns use mock TrpcContext** — Not `createTestServer` as plan assumed.
6. **SameSite=none kept for HTTPS** — Needed for cross-subdomain sharing; CSRF middleware provides equivalent protection.

### Files Modified

1. **`apps/web/server/_core/index.ts`** — CSRF hardening:
   - Reject missing Origin on cookie-authenticated POST in production
   - Allow Bearer token requests to bypass (server-to-server)
   - Gate IP address origins behind non-production check
   - Added `COOKIE_NAME` import from `@shared/const`

### Files Created

1. **`apps/web/server/__tests__/auth-cookies.test.ts`** — 9 tests for cookie domain, Secure, HttpOnly, SameSite, path
2. **`apps/web/server/__tests__/csrf-protection.test.ts`** — 14 tests for CSRF origin validation (allowed/rejected domains, IP restrictions)
3. **`apps/web/server/__tests__/session-validation.test.ts`** — 8 tests for JTI revocation logic, token extraction, cookie name

### What Was NOT Changed (Already Correct)

- Cookie domain extraction in `cookies.ts` — already handles `.smartaihub.app`
- JTI-based revocation in `revocation.ts` — hybrid in-memory + Redis store
- Logout procedure in `routers.ts` — JTI revocation + cookie clearance
- Security headers (HSTS, CSP, X-Frame-Options) — already configured
- CORS whitelist including `.smartaihub.app` suffix

## Dependencies Summary

**Input from other sections:**
- Section 10: Redis client for JTI revocation store and rate limiting

**Output to other sections:**
- Section 19: Auth endpoints hardened and ready for load testing
- Section 20: Cookie domain and CSRF configuration are part of production hardening checklist
