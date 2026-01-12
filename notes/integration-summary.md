# SmartSpecPro Integration Summary

## Overview

การ integrate ระหว่าง SmartSpecPro Desktop App และ SmartSpecWeb สำหรับ credit-based LLM access

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SmartSpecPro Desktop App                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │  Dashboard  │  │  LLM Chat   │  │       Web Login             │  │
│  │  (Credits)  │  │  (AI Chat)  │  │  (Device Auth Flow)         │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────────┬──────────────┘  │
│         │                │                        │                  │
│  ┌──────┴────────────────┴────────────────────────┴──────────────┐  │
│  │                    webAuthService.ts                          │  │
│  │  - Device code flow                                           │  │
│  │  - Token management                                           │  │
│  │  - Credit balance API                                         │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Python Backend                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    web_gateway.py                            │    │
│  │  - Forward user token                                        │    │
│  │  - Proxy LLM requests                                        │    │
│  └──────────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SmartSpecWeb                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │ Device Auth    │  │ LLM Routes     │  │ Credit Service         │ │
│  │ Routes         │  │ (with credit   │  │ - Balance              │ │
│  │ - /device/code │  │  check)        │  │ - Deduction            │ │
│  │ - /device/token│  │                │  │ - Transactions         │ │
│  └────────────────┘  └────────────────┘  └────────────────────────┘ │
│                              │                      │                │
│  ┌───────────────────────────┴──────────────────────┴──────────────┐ │
│  │                      Database                                    │ │
│  │  - users (with credits, plan)                                   │ │
│  │  - credit_transactions                                          │ │
│  │  - credit_packages                                              │ │
│  │  - device_codes                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Components Created/Modified

### SmartSpecWeb

| File | Description |
|------|-------------|
| `drizzle/schema.ts` | Added credits, plan fields to users; credit_transactions, credit_packages tables |
| `drizzle/0003_add_credit_system.sql` | Migration SQL |
| `server/services/creditService.ts` | Credit management service |
| `server/routers/credits.ts` | tRPC routes for credits |
| `server/_core/llmRoutes.ts` | LLM routes with credit check/deduction |
| `server/_core/deviceAuthRoutes.ts` | OAuth Device Flow endpoints |
| `client/src/pages/DeviceAuth.tsx` | Web verification page |
| `client/src/App.tsx` | Added /auth/device route |

### Desktop App

| File | Description |
|------|-------------|
| `src/services/webAuthService.ts` | Device flow client, token management |
| `src/pages/WebLogin.tsx` | Device code login UI |
| `src/pages/Dashboard.tsx` | Added SmartSpecWeb credit card |
| `src/App.tsx` | Added /web-login route |

### Python Backend

| File | Description |
|------|-------------|
| `app/clients/web_gateway.py` | Forward user token to SmartSpecWeb |
| `app/api/openai_compat.py` | Extract and forward user token |

## Authentication Flow

### Device Authorization Grant (RFC 8628)

1. **Desktop App** requests device code from SmartSpecWeb
2. **SmartSpecWeb** returns device_code, user_code, verification_uri
3. **Desktop App** opens browser with verification URL
4. **User** logs in on SmartSpecWeb and enters user_code
5. **Desktop App** polls for token
6. **SmartSpecWeb** returns access_token, refresh_token after authorization
7. **Desktop App** stores tokens and uses for API calls

### Token Lifecycle

| Token | Expiry | Purpose |
|-------|--------|---------|
| Device Code | 10 min | One-time use for authorization |
| Access Token | 15 min | API authentication |
| Refresh Token | 30 days | Obtain new access token |

## Credit System

### Database Schema

```sql
-- users table additions
credits INT DEFAULT 0
plan VARCHAR(50) DEFAULT 'free'

-- credit_transactions table
id, user_id, type, amount, balance_after, description, metadata, created_at

-- credit_packages table  
id, name, credits, price_usd, is_popular, is_active, created_at
```

### Credit Flow

1. **Before LLM call**: Check if user has enough credits
2. **If insufficient**: Return 402 Payment Required
3. **After LLM call**: Calculate credits based on tokens used
4. **Deduct credits**: Update user balance, log transaction
5. **Return response**: Include credits used and remaining

### Credit Calculation

- Default: 1 credit per 1,000 tokens
- Minimum: 1 credit per request
- Configurable via environment variables

## API Endpoints

### Device Auth

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/device/code` | POST | Request device code |
| `/api/auth/device/verify` | GET | Verify user code |
| `/api/auth/device/authorize` | POST | Authorize device |
| `/api/auth/device/token` | POST | Exchange for tokens |
| `/api/auth/me` | GET | Get current user |

### Credits

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/credits` | GET | Get credit balance |
| `credits.balance` | tRPC | Get balance |
| `credits.history` | tRPC | Get transaction history |
| `credits.packages` | tRPC | Get available packages |

### LLM (with credit tracking)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat |
| `/api/llm/chat` | POST | JSON chat |
| `/api/llm/stream` | POST | SSE streaming chat |

## Environment Variables

### SmartSpecWeb

```bash
WEB_LLM_MIN_CREDITS=1
WEB_LLM_CREDIT_PER_1K_TOKENS=0.1
WEB_LLM_SKIP_CREDIT_FOR_STATIC=false
```

### Desktop App

```bash
VITE_SMARTSPEC_WEB_URL=https://smartspec.example.com
```

## Security Considerations

1. **Token Storage**: Access tokens stored in Tauri secure keychain
2. **Token Refresh**: Automatic refresh before expiry
3. **Device Codes**: Short-lived, single-use
4. **User Codes**: 8 alphanumeric characters, case-insensitive
5. **Credit Transactions**: Atomic operations with logging

## Testing

### Manual Testing Steps

1. Start SmartSpecWeb server
2. Start Desktop App
3. Navigate to /web-login
4. Note the user code displayed
5. Open verification URL in browser
6. Log in and enter user code
7. Desktop app should show "Device Authorized"
8. Navigate to Dashboard
9. Verify SmartSpecWeb credit card shows balance
10. Use LLM chat and verify credits are deducted

## Future Improvements

1. **Credit Purchase**: Integrate payment gateway
2. **Usage Analytics**: Detailed usage reports
3. **Rate Limiting**: Per-user rate limits
4. **Notifications**: Low credit alerts
5. **Admin Dashboard**: Credit management UI
