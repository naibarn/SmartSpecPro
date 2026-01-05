# 🚦 Rate Limiting - SmartSpec Pro

**Last Updated:** December 30, 2025  
**Version:** v1.0.0

---

## 📋 Overview

SmartSpec Pro implements rate limiting to protect the API from abuse and ensure fair usage for all users. Rate limits are applied per user (authenticated) or per IP address (unauthenticated).

---

## 🎯 Rate Limits

### **Authentication Endpoints**

| Endpoint | Method | Limit | Window | Notes |
|----------|--------|-------|--------|-------|
| `/api/auth/register` | POST | 5 requests | 1 hour | Per IP address |
| `/api/auth/login` | POST | 10 requests | 15 minutes | Per IP address |
| `/api/auth/refresh` | POST | 20 requests | 1 hour | Per user |

**Reason:** Prevent brute force attacks and account enumeration.

---

### **Credit Management**

| Endpoint | Method | Limit | Window | Notes |
|----------|--------|-------|--------|-------|
| `/api/credits/topup` | POST | 10 requests | 1 hour | Per user |
| `/api/credits/balance` | GET | 100 requests | 1 minute | Per user |
| `/api/credits/transactions` | GET | 60 requests | 1 minute | Per user |
| `/api/credits/calculate` | POST | 100 requests | 1 minute | Per user |

**Reason:** Prevent abuse of credit system and excessive API calls.

---

### **Payment Endpoints**

| Endpoint | Method | Limit | Window | Notes |
|----------|--------|-------|--------|-------|
| `/api/payments/checkout` | POST | 10 requests | 1 hour | Per user |
| `/api/payments/status/:id` | GET | 60 requests | 1 minute | Per user |
| `/api/payments/history` | GET | 60 requests | 1 minute | Per user |
| `/api/payments/webhook` | POST | 1000 requests | 1 minute | Per IP (Stripe) |

**Reason:** Prevent payment fraud and excessive checkout attempts.

---

### **Dashboard Endpoints**

| Endpoint | Method | Limit | Window | Notes |
|----------|--------|-------|--------|-------|
| `/api/dashboard/summary` | GET | 60 requests | 1 minute | Per user |
| `/api/dashboard/usage` | GET | 60 requests | 1 minute | Per user |
| `/api/dashboard/transactions` | GET | 60 requests | 1 minute | Per user |
| `/api/dashboard/llm-usage` | GET | 60 requests | 1 minute | Per user |
| `/api/dashboard/providers` | GET | 60 requests | 1 minute | Per user |

**Reason:** Prevent excessive dashboard queries.

---

### **LLM Gateway**

| Endpoint | Method | Limit | Window | Notes |
|----------|--------|-------|--------|-------|
| `/api/llm/chat` | POST | 100 requests | 1 minute | Per user |
| `/api/llm/models` | GET | 60 requests | 1 minute | Per user |

**Reason:** Prevent LLM API abuse. Note: LLM usage is also limited by credit balance.

---

### **Health Check**

| Endpoint | Method | Limit | Window | Notes |
|----------|--------|-------|--------|-------|
| `/api/health` | GET | 60 requests | 1 minute | Per IP |
| `/api/health/ready` | GET | 60 requests | 1 minute | Per IP |
| `/api/health/live` | GET | 60 requests | 1 minute | Per IP |

**Reason:** Allow frequent health checks for monitoring.

---

## 🔧 Implementation

### **Technology**

SmartSpec Pro uses **Token Bucket Algorithm** for rate limiting:

- Each user/IP has a bucket with a maximum number of tokens
- Each request consumes one token
- Tokens are refilled at a constant rate
- If bucket is empty, request is rejected with 429 status

### **Storage**

Rate limit counters are stored in:
- **Redis** (primary) - Fast, distributed
- **Memory** (fallback) - If Redis unavailable

### **Headers**

Rate limit information is included in response headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## 📊 Response Format

### **Success Response**

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
Content-Type: application/json

{
  "data": "..."
}
```

### **Rate Limit Exceeded**

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640995200
Retry-After: 60
Content-Type: application/json

{
  "detail": "Rate limit exceeded. Please try again in 60 seconds.",
  "limit": 100,
  "window": "1 minute",
  "retry_after": 60
}
```

---

## 🎯 Best Practices

### **For API Consumers**

1. **Check Rate Limit Headers**
   - Monitor `X-RateLimit-Remaining`
   - Plan requests accordingly

2. **Handle 429 Responses**
   - Implement exponential backoff
   - Respect `Retry-After` header

3. **Optimize Requests**
   - Batch operations when possible
   - Cache responses locally
   - Use webhooks instead of polling

4. **Contact Support**
   - If limits are too restrictive
   - For enterprise plans with higher limits

### **Example: Handling Rate Limits**

```python
import time
import requests

def api_call_with_retry(url, headers, max_retries=3):
    for attempt in range(max_retries):
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            return response.json()
        
        elif response.status_code == 429:
            # Rate limit exceeded
            retry_after = int(response.headers.get('Retry-After', 60))
            print(f"Rate limit exceeded. Retrying after {retry_after}s...")
            time.sleep(retry_after)
        
        else:
            raise Exception(f"API error: {response.status_code}")
    
    raise Exception("Max retries exceeded")
```

---

## 🔓 Rate Limit Exemptions

### **Whitelisted IPs**

Certain IP addresses may be whitelisted for higher limits:
- Internal monitoring systems
- Trusted partners
- Enterprise customers

Contact support for whitelist requests.

### **Enterprise Plans**

Enterprise customers can request custom rate limits:
- Higher request limits
- Dedicated rate limit pools
- Priority processing

---

## 📈 Monitoring

### **For Administrators**

Rate limit metrics are available in:
- Monitoring dashboard
- Prometheus metrics
- CloudWatch (if deployed on AWS)

**Key Metrics:**
- `rate_limit_exceeded_total` - Total 429 responses
- `rate_limit_remaining_avg` - Average remaining tokens
- `rate_limit_reset_time` - Time until reset

---

## ⚙️ Configuration

### **Environment Variables**

```bash
# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STORAGE=redis  # redis or memory

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379/0
```

### **Custom Limits**

To customize rate limits, modify:
```python
# app/core/rate_limiter.py

RATE_LIMITS = {
    "auth:register": (5, 3600),      # 5 requests per hour
    "auth:login": (10, 900),         # 10 requests per 15 minutes
    "credits:topup": (10, 3600),     # 10 requests per hour
    # ... more limits
}
```

---

## 🆘 Support

If you're experiencing rate limit issues:

1. **Check your usage**
   - Review `X-RateLimit-*` headers
   - Optimize your request patterns

2. **Contact support**
   - Email: support@smartspec.pro
   - Include your user ID and use case

3. **Upgrade plan**
   - Enterprise plans have higher limits
   - Custom limits available

---

## 📚 Related Documentation

- [API Reference](./API_REFERENCE.md)
- [Authentication Guide](./AUTHENTICATION.md)
- [Error Handling](./ERROR_HANDLING.md)
- [Best Practices](./BEST_PRACTICES.md)

---

**Questions?** Contact us at support@smartspec.pro
