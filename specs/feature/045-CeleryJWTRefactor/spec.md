# Feature 045: Remove JWT from Celery Task Arguments

## Problem

Celery tasks receive full bearer JWT tokens as arguments:
- `agency_creator_task.py` — uses `user_jwt` to call Node.js API + LLM gateway (20+ references)
- `automation_copilot_task.py` — same pattern (2 tasks)

JWT tokens are serialized into Redis broker messages (plaintext JSON). Any process with Redis access can read the tokens and impersonate users.

## Security Risk

- **HIGH**: JWT at rest in Redis broker queue (readable by any Redis client)
- **HIGH**: JWT persisted for task duration (minutes to hours for long tasks)
- **MEDIUM**: JWT visible in Celery task logs if debug logging enabled

## Current Flow

```
Browser → Node.js API → Celery task(user_jwt=<full token>) →
  → HTTP call to Node.js API with Bearer {user_jwt}
  → HTTP call to LLM Gateway with user_jwt
```

## Proposed Solution: Internal Service Token

Replace user JWT with a short-lived, scoped internal service token:

```
Browser → Node.js API → create internal_token(user_id, scope, ttl=5min)
  → Celery task(user_id, internal_token)
    → HTTP call to Node.js API with Bearer {internal_token}
    → internal_token verified by Node.js (separate from user JWT)
```

### Implementation Steps

1. **Node.js**: Create `internalTokenService.ts`
   - `createInternalToken(userId, scope, ttlSeconds)` → short-lived JWT with `iss: "smartspec-internal"`
   - `verifyInternalToken(token)` → validates issuer + expiry + scope

2. **Node.js**: Add internal token middleware
   - Accept both user JWT and internal tokens in auth middleware
   - Internal tokens scoped: `agency:create`, `automation:execute`, `llm:call`

3. **Python API endpoints that dispatch Celery tasks**:
   - `app/api/agency_creator.py` → request internal token from Node.js before dispatching
   - `app/api/automation_copilot.py` → same

4. **Celery tasks**: Replace `user_jwt` parameter with `internal_token`
   - All HTTP calls use internal_token instead of user JWT
   - Token auto-expires after task TTL

5. **LLM Gateway**: Accept internal tokens for Celery-originated requests

## Scope

- Files to change: ~8-10
- Effort: ~4-6 hours
- Risk: HIGH (auth flow change, requires careful testing)
- Dependencies: None

## Testing

- Unit: verify internal token creation/verification
- Integration: verify Celery task can call Node.js API with internal token
- Security: verify expired internal token is rejected
- Security: verify internal token cannot access endpoints outside its scope
