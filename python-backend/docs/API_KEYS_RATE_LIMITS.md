## API Key Management & Rate Limit Dashboard

**SmartSpec Pro - Programmatic Access and Rate Limiting**

## Overview

The API Key Management and Rate Limit Dashboard provide comprehensive tools for programmatic access to SmartSpec Pro and monitoring usage limits.

## Features

### 1. API Key Management

**Secure Programmatic Access:**
- Generate API keys for programmatic access
- Secure key storage with SHA-256 hashing
- Key rotation without changing integrations
- Granular permissions control
- Rate limiting per key
- Expiration dates
- Usage tracking

**Key Features:**
- **Generation**: Create new API keys with custom names
- **Permissions**: Control access to specific endpoints and methods
- **Rate Limits**: Set custom rate limits per key
- **Expiration**: Optional expiration dates
- **Rotation**: Generate new keys while keeping same ID
- **Revocation**: Deactivate keys instantly
- **Usage Stats**: Track requests, credits, and performance

**Security:**
- Keys are hashed with SHA-256 before storage
- Plaintext keys shown only once during creation
- Secure key prefix for identification
- Permission-based access control
- Automatic expiration handling

### 2. Rate Limit Dashboard

**Real-Time Rate Limit Monitoring:**
- Current usage vs limits
- Time until reset
- Usage percentage
- Historical data
- Per-endpoint breakdown
- API key-specific limits

**Key Features:**
- **Status**: Real-time rate limit status
- **History**: Historical usage data
- **Global Stats**: Overall usage across endpoints
- **API Key Limits**: Per-key rate limit tracking
- **Visualization**: Data formatted for charts
- **Alerts**: Percentage-based warnings

## API Endpoints

### API Key Management Endpoints

#### 1. Create API Key

```http
POST /api/v1/api-keys
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Production API Key",
  "permissions": {
    "endpoints": ["*"],
    "methods": ["*"]
  },
  "rate_limit": 100,
  "expires_in_days": 365,
  "description": "Main production API key"
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Production API Key",
  "key": "sk_smartspec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  "prefix": "sk_smartspec_a1b2c3",
  "permissions": {
    "endpoints": ["*"],
    "methods": ["*"]
  },
  "rate_limit": 100,
  "is_active": true,
  "expires_at": "2025-01-15T10:30:00",
  "created_at": "2024-01-15T10:30:00",
  "warning": "⚠️ Save this key securely! It will not be shown again."
}
```

**⚠️ Important:** The full API key is only shown once. Save it securely!

#### 2. List API Keys

```http
GET /api/v1/api-keys?include_inactive=false
Authorization: Bearer <token>
```

**Response:**
```json
{
  "api_keys": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Production API Key",
      "prefix": "sk_smartspec_a1b2c3",
      "permissions": {
        "endpoints": ["*"],
        "methods": ["*"]
      },
      "rate_limit": 100,
      "is_active": true,
      "is_expired": false,
      "is_valid": true,
      "last_used_at": "2024-01-15T09:45:00",
      "expires_at": "2025-01-15T10:30:00",
      "description": "Main production API key",
      "created_at": "2024-01-15T10:30:00"
    }
  ],
  "total": 1
}
```

#### 3. Get API Key Details

```http
GET /api/v1/api-keys/{api_key_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Production API Key",
  "prefix": "sk_smartspec_a1b2c3",
  "permissions": {
    "endpoints": ["*"],
    "methods": ["*"]
  },
  "rate_limit": 100,
  "is_active": true,
  "is_expired": false,
  "is_valid": true,
  "last_used_at": "2024-01-15T09:45:00",
  "expires_at": "2025-01-15T10:30:00",
  "description": "Main production API key",
  "created_at": "2024-01-15T10:30:00",
  "updated_at": "2024-01-15T10:30:00"
}
```

#### 4. Update API Key

```http
PUT /api/v1/api-keys/{api_key_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Production Key",
  "permissions": {
    "endpoints": ["/api/v1/llm/*"],
    "methods": ["GET", "POST"]
  },
  "rate_limit": 200,
  "is_active": true,
  "description": "Updated description"
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Updated Production Key",
  "prefix": "sk_smartspec_a1b2c3",
  "permissions": {
    "endpoints": ["/api/v1/llm/*"],
    "methods": ["GET", "POST"]
  },
  "rate_limit": 200,
  "is_active": true,
  "is_expired": false,
  "description": "Updated description",
  "updated_at": "2024-01-15T11:00:00"
}
```

#### 5. Rotate API Key

```http
POST /api/v1/api-keys/{api_key_id}/rotate
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Production API Key",
  "key": "sk_smartspec_x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4",
  "prefix": "sk_smartspec_x9y8z7",
  "updated_at": "2024-01-15T11:30:00",
  "warning": "⚠️ The old key is now invalid. Save the new key securely!"
}
```

**⚠️ Important:** The old key is immediately invalidated!

#### 6. Delete API Key

```http
DELETE /api/v1/api-keys/{api_key_id}
Authorization: Bearer <token>
```

**Response:**
- Status: 204 No Content

#### 7. Get API Key Usage

```http
GET /api/v1/api-keys/{api_key_id}/usage?days=30
Authorization: Bearer <token>
```

**Response:**
```json
{
  "api_key_id": "550e8400-e29b-41d4-a716-446655440000",
  "api_key_name": "Production API Key",
  "period_days": 30,
  "total_requests": 15420,
  "total_credits": 154200,
  "avg_response_time": 245.5,
  "error_rate": 0.02
}
```

### Rate Limit Dashboard Endpoints

#### 1. Get Rate Limit Status

```http
GET /api/v1/rate-limits/status?endpoint=llm
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user_id": "user123",
  "timestamp": "2024-01-15T10:30:00",
  "rate_limits": {
    "llm": {
      "current": 45,
      "limit": 60,
      "window_seconds": 60,
      "reset_in_seconds": 32,
      "percentage": 75.0
    }
  },
  "total_endpoints": 1
}
```

#### 2. Get Rate Limit History

```http
GET /api/v1/rate-limits/history?hours=24
Authorization: Bearer <token>
```

**Response:**
```json
{
  "period_hours": 24,
  "data_points": 24,
  "history": [
    {
      "timestamp": "2024-01-15T10:00:00",
      "rate_limits": {
        "llm": {
          "current": 45,
          "limit": 60,
          "percentage": 75.0
        }
      }
    }
  ]
}
```

#### 3. Get Global Stats

```http
GET /api/v1/rate-limits/global-stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user_id": "user123",
  "total_requests_current_window": 157,
  "active_endpoints": 5,
  "top_endpoints": [
    {
      "endpoint": "llm",
      "requests": 89
    },
    {
      "endpoint": "credits",
      "requests": 45
    }
  ],
  "timestamp": "2024-01-15T10:30:00"
}
```

#### 4. Get API Key Rate Limits

```http
GET /api/v1/rate-limits/api-key/{api_key_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "api_key_id": "550e8400-e29b-41d4-a716-446655440000",
  "api_key_name": "Production API Key",
  "current": 78,
  "limit": 100,
  "remaining": 22,
  "reset_in_seconds": 45,
  "percentage": 78.0,
  "window_seconds": 60
}
```

#### 5. Check Rate Limit

```http
POST /api/v1/rate-limits/check
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint": "llm"
}
```

**Response:**
```json
{
  "allowed": true,
  "current": 45,
  "limit": 60,
  "remaining": 15,
  "reset_in_seconds": 32,
  "percentage": 75.0
}
```

## Using API Keys

### Authentication with API Keys

Instead of using JWT tokens, you can use API keys for programmatic access:

```bash
# Using Bearer token (API key)
curl -H "Authorization: Bearer sk_smartspec_a1b2c3..." \
  https://api.smartspec.pro/api/v1/llm/chat
```

### Permission Examples

**Full Access:**
```json
{
  "endpoints": ["*"],
  "methods": ["*"]
}
```

**LLM Only:**
```json
{
  "endpoints": ["/api/v1/llm/*"],
  "methods": ["GET", "POST"]
}
```

**Read-Only:**
```json
{
  "endpoints": ["*"],
  "methods": ["GET"]
}
```

**Specific Endpoints:**
```json
{
  "endpoints": [
    "/api/v1/llm/chat",
    "/api/v1/credits/balance",
    "/api/v1/analytics/summary"
  ],
  "methods": ["GET", "POST"]
}
```

## Database Schema

### API Keys Table

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    permissions JSONB DEFAULT '{}',
    rate_limit INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### API Key Usage Table

```sql
CREATE TABLE api_key_usage (
    id UUID PRIMARY KEY,
    api_key_id UUID NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time INTEGER NOT NULL,
    credits_used INTEGER DEFAULT 0,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);
```

## Security Best Practices

### API Key Security

1. **Never commit API keys to version control**
2. **Store keys in environment variables**
3. **Use different keys for different environments**
4. **Rotate keys regularly**
5. **Set expiration dates**
6. **Use minimal permissions**
7. **Monitor usage regularly**
8. **Revoke unused keys**

### Rate Limiting

1. **Set appropriate limits per key**
2. **Monitor usage patterns**
3. **Implement exponential backoff**
4. **Handle 429 responses gracefully**
5. **Use webhooks for alerts**

## Usage Examples

### Python Example

```python
import requests

API_KEY = "sk_smartspec_a1b2c3..."
BASE_URL = "https://api.smartspec.pro"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Make LLM request
response = requests.post(
    f"{BASE_URL}/api/v1/llm/chat",
    headers=headers,
    json={
        "provider": "openai",
        "model": "gpt-4",
        "messages": [
            {"role": "user", "content": "Hello!"}
        ]
    }
)

print(response.json())
```

### JavaScript Example

```javascript
const API_KEY = 'sk_smartspec_a1b2c3...';
const BASE_URL = 'https://api.smartspec.pro';

async function makeRequest() {
  const response = await fetch(`${BASE_URL}/api/v1/llm/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider: 'openai',
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello!' }
      ]
    })
  });
  
  const data = await response.json();
  console.log(data);
}

makeRequest();
```

### Rate Limit Handling

```python
import time
import requests

def make_request_with_retry(url, headers, data, max_retries=3):
    for attempt in range(max_retries):
        response = requests.post(url, headers=headers, json=data)
        
        if response.status_code == 429:  # Rate limited
            retry_after = int(response.headers.get('Retry-After', 60))
            print(f"Rate limited. Retrying after {retry_after} seconds...")
            time.sleep(retry_after)
            continue
        
        return response
    
    raise Exception("Max retries exceeded")
```

## Frontend Integration

### Display API Keys

```javascript
// Fetch API keys
const response = await fetch('/api/v1/api-keys', {
  headers: {
    'Authorization': `Bearer ${userToken}`
  }
});

const { api_keys } = await response.json();

// Display in UI
api_keys.forEach(key => {
  console.log(`${key.name}: ${key.prefix}...`);
  console.log(`Status: ${key.is_valid ? 'Active' : 'Inactive'}`);
  console.log(`Rate Limit: ${key.rate_limit} req/min`);
});
```

### Display Rate Limits

```javascript
// Fetch rate limit status
const response = await fetch('/api/v1/rate-limits/status', {
  headers: {
    'Authorization': `Bearer ${userToken}`
  }
});

const { rate_limits } = await response.json();

// Display progress bars
Object.entries(rate_limits).forEach(([endpoint, data]) => {
  const percentage = data.percentage;
  console.log(`${endpoint}: ${data.current}/${data.limit} (${percentage}%)`);
  
  // Update progress bar
  document.getElementById(`${endpoint}-progress`).style.width = `${percentage}%`;
});
```

## Troubleshooting

### API Key Not Working

**Problem:** API key returns 401 Unauthorized

**Solutions:**
- Check if key is active
- Check if key has expired
- Verify key is correctly formatted
- Check permissions match endpoint

### Rate Limit Exceeded

**Problem:** Getting 429 Too Many Requests

**Solutions:**
- Check current rate limit status
- Implement exponential backoff
- Increase rate limit for API key
- Spread requests over time

### Key Rotation Issues

**Problem:** Old key still working after rotation

**Solutions:**
- Check Redis cache expiration
- Verify key hash was updated
- Clear application cache

## Support

For issues or questions:
- GitHub Issues: https://github.com/smartspec/smartspec-pro/issues
- Documentation: https://docs.smartspec.pro
- Email: support@smartspec.pro

---

**Last Updated:** January 15, 2024  
**Version:** 1.0.0  
**Status:** Production Ready
