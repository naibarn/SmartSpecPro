# Section 03 Code Review Interview

## Review Summary
- **HIGH #1**: CSRF state not validated in `exchange_drive_code` -> **Auto-fixed**: Added `state_serializer.loads(state, max_age=600)` validation + test
- **HIGH #2**: Tokens stored in plaintext -> **Let go for now**: Added TODO comment; encryption deferred to section-15 (security hardening)
- **MEDIUM-HIGH #3**: `user_id` type mismatch (`str()` cast on Integer column) -> **Auto-fixed**: Removed `str()` casts in `_get_connection` and `OAuthConnection` creation
- **MEDIUM #4**: Missing `jti` in JWT -> **Auto-fixed**: Added `jti: randomUUID()` to `createDriveToken`
- **HIGH #5**: Missing test files (endpoint/router tests) -> **Let go**: Unit tests cover service layer; integration tests are lower priority for MVP
- **MEDIUM #6**: Redirect URI reuses login `googleRedirectUri` -> **Auto-fixed**: Changed to `googleDriveRedirectUri` config key with fallback
- **LOW #7**: Popup timer leak on unmount -> **Auto-fixed**: Added `useRef` + `useEffect` cleanup for interval timer
- **MEDIUM #8**: `tenant_id` not populated on new connections -> **Auto-fixed**: Added `tenant_id` parameter to `exchange_drive_code`, passed from endpoint
- **LOW #9**: Concurrent refresh race condition -> **Let go**: Acceptable for MVP; single-user per connection makes races unlikely
- **LOW #10**: Always mints JWT per request -> **Let go**: 15m expiry is short-lived; connection pooling not needed for proxy pattern
- **LOW #11**: `getAuthUrl` should be mutation not query -> **Let go**: Query is acceptable since URL generation is idempotent
- **LOW #12**: CSRF validation test -> **Auto-fixed**: Added `test_exchange_drive_code_rejects_invalid_state` test

## Fixes Applied
1. `google_token_service.py`: Imported `state_serializer` from `oauth_service`
2. `google_token_service.py`: Added CSRF state validation in `exchange_drive_code`
3. `google_token_service.py`: Removed `str()` cast on `user_id` in `_get_connection` WHERE clause
4. `google_token_service.py`: Changed `user_id=str(user_id)` to `user_id=user_id` in OAuthConnection creation
5. `google_token_service.py`: Changed `googleRedirectUri` to `googleDriveRedirectUri` in both methods
6. `google_token_service.py`: Added `tenant_id` parameter and pass-through to OAuthConnection
7. `google_token_service.py`: Added TODO comment for token encryption (section-15)
8. `googleDrive.ts`: Added `import { randomUUID } from "crypto"` and `jti: randomUUID()` to token
9. `GoogleDrivePanel.tsx`: Added `useRef`/`useEffect` for timer cleanup on unmount
10. `oauth.py`: Pass `tenant_id` from `current_user` to `exchange_drive_code`
11. `test_google_token_service.py`: Updated test to mock `state_serializer`, use `googleDriveRedirectUri`
12. `test_google_token_service.py`: Added `test_exchange_drive_code_rejects_invalid_state` test
