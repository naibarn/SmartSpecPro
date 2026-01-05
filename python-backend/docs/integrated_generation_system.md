# SmartSpec Pro - Integrated Generation System

## Overview

This document describes the integrated system connecting:
- **Key Management** - Secure API key authentication
- **Generation Service** - AI content generation (Image/Video/Audio)
- **R2 Storage** - Cloudflare R2 file storage
- **Credits System** - Usage tracking and billing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Application                        │
│                    (Web App / Mobile / SDK)                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ API Key (X-API-Key header)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Gateway                              │
│                    /api/v2/generation/*                          │
│                    /api/v2/storage/*                             │
│                    /api/keys/*                                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌───────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Key Management   │ │   Generation    │ │    Storage      │
│     Service       │ │    Service      │ │    Service      │
│                   │ │                 │ │                 │
│ - Validate Key    │ │ - Create Task   │ │ - Upload File   │
│ - Check Scopes    │ │ - Poll Status   │ │ - Download      │
│ - Rate Limiting   │ │ - Store Output  │ │ - Presigned URL │
│ - Audit Logging   │ │ - Credits Mgmt  │ │ - Usage Track   │
└───────────────────┘ └─────────────────┘ └─────────────────┘
        │                     │                   │
        └──────────┬──────────┴───────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                               │
│  - api_keys_v2      - credits_balances    - usage_records       │
│  - key_audit_logs   - credit_transactions - subscription_plans  │
└─────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare R2                               │
│  - images/generated/*   - videos/generated/*   - audio/*        │
│  - images/gallery/*     - images/thumbnails/*                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Generation API v2 (`/api/v2/generation`)

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| POST | `/generate` | `generation:create` | Create generation task |
| GET | `/tasks/{id}` | `generation:read` | Get task status |
| GET | `/tasks/{id}/wait` | `generation:read` | Wait for completion |
| GET | `/tasks` | `generation:read` | List user's tasks |
| DELETE | `/tasks/{id}` | `generation:delete` | Delete task |
| GET | `/credits` | `credits:read` | Get credits balance |
| GET | `/credits/history` | `credits:read` | Get usage history |
| GET | `/models` | `generation:read` | List available models |
| GET | `/models/{id}` | `generation:read` | Get model details |

### Storage API v2 (`/api/v2/storage`)

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| POST | `/upload` | `storage:write` | Upload file |
| POST | `/upload-from-url` | `storage:write` | Upload from URL |
| POST | `/presigned-url` | `storage:read/write` | Get presigned URL |
| DELETE | `/files/{key}` | `storage:delete` | Delete file |
| GET | `/usage` | `storage:read` | Get storage usage |

### Key Management API (`/api/keys`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create new API key |
| GET | `/` | List all keys |
| GET | `/{id}` | Get key details |
| POST | `/{id}/rotate` | Rotate key |
| POST | `/{id}/revoke` | Revoke key |
| DELETE | `/{id}` | Delete key |
| GET | `/{id}/audit` | Get audit log |

### MFA API (`/api/keys/mfa`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/status` | Get MFA status |
| POST | `/totp/setup` | Setup TOTP |
| POST | `/totp/verify-setup` | Verify TOTP setup |
| POST | `/challenge` | Create MFA challenge |
| POST | `/verify` | Verify MFA challenge |
| POST | `/backup-codes/regenerate` | Regenerate backup codes |

---

## Authentication Flow

### 1. Create API Key

```python
# POST /api/keys
{
    "name": "My Production Key",
    "scopes": ["generation:create", "generation:read", "storage:write"],
    "expires_in_days": 365
}

# Response
{
    "id": "key_abc123",
    "api_key": "sk_live_xxxxxxxxxxxxx",  # Only shown once!
    "name": "My Production Key",
    "scopes": ["generation:create", "generation:read", "storage:write"]
}
```

### 2. Use API Key

```python
import httpx

headers = {
    "X-API-Key": "sk_live_xxxxxxxxxxxxx"
}

# Or use Authorization header
headers = {
    "Authorization": "Bearer sk_live_xxxxxxxxxxxxx"
}

response = httpx.post(
    "https://api.smartspec.pro/v2/generation/generate",
    headers=headers,
    json={
        "model_id": "nano-banana-pro",
        "prompt": "A beautiful sunset over mountains"
    }
)
```

---

## Generation Flow

### 1. Create Task

```python
# POST /api/v2/generation/generate
{
    "model_id": "nano-banana-pro",
    "prompt": "A beautiful sunset over mountains",
    "options": {
        "aspect_ratio": "16:9",
        "resolution": "1024x576"
    }
}

# Response
{
    "success": true,
    "task": {
        "id": "task_xyz789",
        "status": "pending",
        "model_id": "nano-banana-pro",
        "prompt": "A beautiful sunset over mountains"
    },
    "credits_reserved": 1.5
}
```

### 2. Poll Status

```python
# GET /api/v2/generation/tasks/{task_id}

# Response (processing)
{
    "success": true,
    "task": {
        "id": "task_xyz789",
        "status": "processing",
        "progress": 45
    }
}

# Response (completed)
{
    "success": true,
    "task": {
        "id": "task_xyz789",
        "status": "completed",
        "output_url": "https://r2.smartspec.pro/images/generated/...",
        "thumbnail_url": "https://r2.smartspec.pro/images/thumbnails/..."
    }
}
```

### 3. Wait for Completion (Long Polling)

```python
# GET /api/v2/generation/tasks/{task_id}/wait?timeout=60

# Response (after completion)
{
    "success": true,
    "task": {
        "id": "task_xyz789",
        "status": "completed",
        "output_url": "https://r2.smartspec.pro/images/generated/..."
    }
}
```

---

## Credits System

### Balance Structure

```json
{
    "total_credits": 100.0,
    "used_credits": 25.5,
    "reserved_credits": 3.0,
    "available_credits": 71.5
}
```

### Credit Costs

| Operation | Base Credits | Notes |
|-----------|--------------|-------|
| Image Generation | 1.0 | +50% for HD, +100% for 4K |
| Video Generation | 5.0 | +100% for >5 seconds |
| Audio Generation | 0.5 | Per 30 seconds |
| Storage | 0.01 | Per GB/month |

### Credit Flow

1. **Reserve** - Credits reserved when task created
2. **Commit** - Credits deducted when task completes
3. **Release** - Credits returned if task fails/cancelled

---

## Storage Integration

### Upload Generated Content

Generated content is automatically uploaded to R2:

```
images/generated/{user_id}/{task_id}.png
videos/generated/{user_id}/{task_id}.mp4
audio/generated/{user_id}/{task_id}.mp3
```

### Manual Upload

```python
# POST /api/v2/storage/upload
# Content-Type: multipart/form-data

files = {"file": open("image.png", "rb")}
response = httpx.post(
    "https://api.smartspec.pro/v2/storage/upload",
    headers={"X-API-Key": api_key},
    files=files
)

# Response
{
    "success": true,
    "url": "https://r2.smartspec.pro/uploads/abc123.png",
    "key": "uploads/abc123.png",
    "size": 1024000
}
```

### Presigned URLs

```python
# POST /api/v2/storage/presigned-url
{
    "key": "uploads/abc123.png",
    "expires_in": 3600,
    "method": "get_object"
}

# Response
{
    "success": true,
    "url": "https://r2.smartspec.pro/uploads/abc123.png?signature=...",
    "expires_in": 3600
}
```

---

## Rate Limits

| Resource | Limit | Window |
|----------|-------|--------|
| API Requests | 100 | per minute |
| Generation Tasks | 10 | per minute |
| Storage Uploads | 10 | per minute |
| Storage Downloads | 100 | per minute |
| Key Rotations | 3 | per hour |

---

## Error Handling

### Error Response Format

```json
{
    "error": "error_code",
    "message": "Human-readable error message",
    "details": {}
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_api_key` | 401 | Invalid or expired API key |
| `insufficient_credits` | 402 | Not enough credits |
| `access_denied` | 403 | Missing required scope |
| `task_not_found` | 404 | Task does not exist |
| `rate_limited` | 429 | Rate limit exceeded |
| `quota_exceeded` | 413 | Storage quota exceeded |

---

## SDK Usage Examples

### Python SDK

```python
from smartspec import SmartSpecClient

client = SmartSpecClient(api_key="sk_live_xxx")

# Generate image
task = client.generate_image(
    prompt="A beautiful sunset",
    model="nano-banana-pro",
    aspect_ratio="16:9"
)

# Wait for completion
result = task.wait()
print(f"Image URL: {result.output_url}")

# Check credits
balance = client.get_credits()
print(f"Available: {balance.available_credits}")
```

### JavaScript SDK

```typescript
import { SmartSpecClient } from '@smartspec/sdk';

const client = new SmartSpecClient({ apiKey: 'sk_live_xxx' });

// Generate image
const task = await client.generateImage({
    prompt: 'A beautiful sunset',
    model: 'nano-banana-pro',
    aspectRatio: '16:9'
});

// Wait for completion
const result = await task.wait();
console.log(`Image URL: ${result.outputUrl}`);
```

### React Hook

```tsx
import { useSmartSpec } from '@smartspec/react';

function GenerateButton() {
    const { generate, isLoading, result, credits } = useSmartSpec();
    
    const handleGenerate = async () => {
        await generate({
            prompt: 'A beautiful sunset',
            model: 'nano-banana-pro'
        });
    };
    
    return (
        <div>
            <p>Credits: {credits?.available}</p>
            <button onClick={handleGenerate} disabled={isLoading}>
                {isLoading ? 'Generating...' : 'Generate'}
            </button>
            {result && <img src={result.outputUrl} />}
        </div>
    );
}
```

---

## Security Best Practices

1. **Never expose API keys in client-side code**
   - Use server-side proxy for web apps
   - Store keys in environment variables

2. **Use minimal scopes**
   - Only request scopes you need
   - Separate keys for different purposes

3. **Enable MFA for sensitive operations**
   - Required for key rotation
   - Required for key deletion

4. **Monitor audit logs**
   - Review suspicious activity
   - Set up alerts for anomalies

5. **Rotate keys regularly**
   - Use grace periods for smooth transitions
   - Revoke old keys after rotation

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/smartspec

# Cloudflare R2
CLOUDFLARE_R2_ACCESS_KEY_ID=xxx
CLOUDFLARE_R2_SECRET_ACCESS_KEY=xxx
CLOUDFLARE_R2_BUCKET_NAME=smartspec-media
CLOUDFLARE_R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
CLOUDFLARE_R2_PUBLIC_URL=https://r2.smartspec.pro

# Encryption
ENCRYPTION_MASTER_KEY=your-32-character-secret-key

# kie.ai API
KIE_AI_API_KEY=xxx
KIE_AI_BASE_URL=https://kie.ai/api/v1
```

---

## Database Schema

### New Tables

| Table | Description |
|-------|-------------|
| `api_keys_v2` | Enhanced API keys with versioning |
| `api_key_versions` | Key version history |
| `key_audit_logs` | Key operation audit trail |
| `key_mfa_verifications` | MFA challenge records |
| `credits_balances` | User credits balance |
| `credit_transactions` | Credit transaction history |
| `usage_records` | Detailed usage records |
| `subscription_plans` | Available plans |

### Migration

```bash
# Generate migration
alembic revision --autogenerate -m "Add integrated generation system tables"

# Apply migration
alembic upgrade head
```

---

*Document Version: 1.0*
*Last Updated: January 3, 2025*
