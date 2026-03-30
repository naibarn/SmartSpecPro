# Section 03 — Meta Graph API Client

## Dependencies
- None (Batch 1)

## Overview
Async Python HTTP client wrapping Meta Graph API v25.0. Single point of contact for all outbound Meta API calls. Uses `httpx.AsyncClient` with connection pooling, exponential backoff retry, token expiration detection, structured logging with token scrubbing, and circuit breaker support.

## Files to Create
| File | Purpose |
|------|---------|
| `python-backend/app/services/social/__init__.py` | Package init |
| `python-backend/app/services/social/meta_graph_client.py` | `MetaGraphClient` class |
| `python-backend/app/services/social/base_provider.py` | `SocialProviderClient` protocol (abstract interface for future providers) |
| `python-backend/app/services/social/exceptions.py` | `MetaApiError`, `TokenExpiredError`, `PermissionDeniedError`, `RateLimitExceededError` |
| `python-backend/tests/unit/services/test_meta_graph_client.py` | Unit tests |

## Tests First
```
# Test: send_message calls POST /{page_id}/messages with recipient.id and message.text
# Test: create_post sends POST /{page_id}/feed with message and link params
# Test: create_post with scheduled_at includes scheduled_publish_time as Unix timestamp
# Test: get_comments paginates with after cursor
# Test: reply_to_comment sends POST /{object_id}/comments
# Test: hide_comment sends is_hidden=true, delete_comment sends DELETE
# Test: subscribe_webhooks sends correct fields
# Test: client retries on HTTP 429 with exponential backoff (1s, 2s, 4s)
# Test: client retries on HTTP 502/503 up to 3 times
# Test: client does NOT retry on HTTP 400
# Test: client raises TokenExpiredError on error code 190
# Test: client raises PermissionDeniedError on error code 10
# Test: client uses 30s default timeout
# Test: close() calls aclose() on underlying httpx client
# Test: access_token never appears in log output (scrub processor)
```

## Implementation Guidance

### SocialProviderClient Protocol
```python
class SocialProviderClient(Protocol):
    async def send_message(self, recipient_id: str, text: str) -> dict: ...
    async def create_post(self, message: str, link: str | None) -> dict: ...
    async def get_comments(self, object_id: str, limit: int, after: str | None) -> dict: ...
    async def close(self): ...
```

### MetaGraphClient
- Base URL: `https://graph.facebook.com/{META_GRAPH_API_VERSION}` (from env var, default v25.0)
- `access_token` appended as query param (Meta pattern)
- Lazy `httpx.AsyncClient` creation with `Limits(max_connections=20, max_keepalive_connections=10)`
- **Log scrubbing**: `scrub_access_tokens` structlog processor strips token from all logged URLs. Wrap httpx exceptions to strip URL before re-raising.
- Retry: 429 → up to 3 times with `Retry-After` header (cap 60s) or backoff 1s/2s/4s. 502/503 → 3 retries. 400+ → no retry.
- Error code 190 → `TokenExpiredError`, code 10 → `PermissionDeniedError`
- Context manager support (`__aenter__`/`__aexit__`)
- **Token handling**: Callers pass decrypted token. MetaGraphClient never touches encryption. Python-backend decrypts from DB via `smartspecweb_crypto.decrypt_smartspecweb()` immediately before constructing the client.
