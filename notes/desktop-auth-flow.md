# Desktop Auth Flow Design

## Overview

Desktop App ต้องการเชื่อมต่อกับ SmartSpecWeb เพื่อ:
1. ใช้ LLM Gateway (พร้อม credit tracking)
2. ใช้ MCP tools
3. ดู credit balance

## Auth Flow Options

### Option A: OAuth Device Flow (Recommended)
```
1. Desktop App → SmartSpecWeb: POST /api/auth/device/code
   Response: { device_code, user_code, verification_uri, expires_in }

2. User opens browser → SmartSpecWeb login page
   Shows user_code for verification

3. Desktop App polls: POST /api/auth/device/token
   - pending: user hasn't authorized yet
   - success: { access_token, refresh_token, user }
   - expired: device_code expired

4. Desktop App stores tokens securely (Tauri keychain)

5. Desktop App uses access_token for API calls
```

### Option B: Browser Redirect Flow
```
1. Desktop App opens browser → SmartSpecWeb /auth/desktop?callback=smartspec://callback
2. User logs in on SmartSpecWeb
3. SmartSpecWeb redirects to smartspec://callback?token=xxx
4. Desktop App receives token via deep link
```

### Option C: API Key (Simple but less secure)
```
1. User generates API key on SmartSpecWeb dashboard
2. User copies API key to Desktop App settings
3. Desktop App uses API key for all requests
```

## Chosen: Option A (Device Flow)

เหตุผล:
- ไม่ต้องจัดการ deep links (ซับซ้อนใน Tauri)
- User experience ดี (แค่ login บน browser)
- Secure - ไม่ส่ง credentials ผ่าน Desktop App
- Standard OAuth 2.0 Device Authorization Grant

## Implementation Plan

### SmartSpecWeb (Backend)

1. **POST /api/auth/device/code**
   - Generate device_code และ user_code
   - Store in Redis/memory with expiry
   - Return verification_uri

2. **GET /api/auth/device/verify?user_code=xxx**
   - Show login page with user_code
   - After login, mark device_code as authorized

3. **POST /api/auth/device/token**
   - Poll endpoint for Desktop App
   - Return access_token when authorized

4. **Token Format**
   - JWT with user info and scopes
   - Short-lived access_token (15 min)
   - Long-lived refresh_token (30 days)

### Desktop App (Frontend)

1. **Auth Service**
   - `initiateDeviceAuth()` - Start device flow
   - `pollForToken()` - Poll for authorization
   - `refreshToken()` - Refresh expired token
   - `logout()` - Clear tokens

2. **Token Storage**
   - Use Tauri keychain for secure storage
   - Fallback to encrypted localStorage

3. **Login UI**
   - Show user_code and verification URL
   - Auto-poll for authorization
   - Show success/error states

## Data Structures

### Device Code Request
```typescript
interface DeviceCodeResponse {
  device_code: string;      // Internal code for polling
  user_code: string;        // 6-8 char code shown to user
  verification_uri: string; // URL for user to visit
  expires_in: number;       // Seconds until expiry
  interval: number;         // Polling interval in seconds
}
```

### Token Response
```typescript
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: {
    id: number;
    openId: string;
    name: string;
    email: string;
    credits: number;
    plan: string;
  };
}
```

### Error Response
```typescript
interface DeviceAuthError {
  error: "authorization_pending" | "slow_down" | "expired_token" | "access_denied";
  error_description?: string;
}
```

## Security Considerations

1. **Device Code**
   - Random, high-entropy (32+ bytes)
   - Single use
   - Short expiry (10 minutes)

2. **User Code**
   - Easy to type (6-8 alphanumeric)
   - Case insensitive
   - No ambiguous characters (0/O, 1/l)

3. **Access Token**
   - Short-lived (15 minutes)
   - Contains user ID and scopes
   - Signed with server secret

4. **Refresh Token**
   - Long-lived (30 days)
   - Stored securely in keychain
   - Can be revoked
