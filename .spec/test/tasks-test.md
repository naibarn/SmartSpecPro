# Test Tasks

| Key | Value |
| --- | --- |
| Spec | test/spec.md |
| Updated | 2025-12-28 |

## Tasks

### Phase 1: Test

- [ ] TSK-TEST-001 Test rate limiting
  
  **Evidence:**
  - 📄 `packages/auth-service/src/middleware/rate-limit.middleware.ts`
  - 📄 `packages/auth-service/tests/unit/rate-limit.test.ts`

- [ ] TSK-TEST-002 Test API key auth
  
  **Evidence:**
  - 📄 `packages/auth-service/src/middleware/agent-api.middleware.ts`
  - 📄 `packages/auth-service/tests/unit/agent-api.test.ts`

- [ ] TSK-TEST-003 Test user service
  
  **Evidence:**
  - 📄 `packages/auth-lib/src/services/user-service.ts`
  - 📄 `packages/auth-lib/tests/unit/user-service.test.ts`
