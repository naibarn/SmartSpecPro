# SmartSpecWeb Analysis

## สถานะปัจจุบัน

### ✅ มีอยู่แล้ว

1. **User Authentication**
   - Manus OAuth integration (`server/_core/oauth.ts`, `authz.ts`)
   - Session-based auth สำหรับ browser
   - Bearer token auth สำหรับ server-to-server
   - Static token support (`webGatewayToken`, `mcpServerToken`)

2. **LLM Gateway**
   - `/v1/chat/completions` - OpenAI-compatible endpoint
   - `/v1/models` - Models listing
   - `/api/llm/chat` และ `/api/llm/stream` - UI-friendly endpoints
   - Streaming support (SSE)
   - Rate limiting

3. **User Schema** (drizzle/schema.ts)
   - `id`, `openId`, `name`, `email`, `role`, `createdAt`, `updatedAt`

4. **Frontend Auth**
   - `AuthContext.tsx` with login/signup/logout
   - Demo mode with mock credits
   - Dashboard shows `user.credits`

### ❌ ยังไม่มี

1. **Credit System (Backend)**
   - ไม่มี `credits` field ใน users table
   - ไม่มี credit transactions table
   - ไม่มี credit deduction logic ใน LLM routes
   - ไม่มี API สำหรับ check/deduct credits

2. **User Token Forwarding**
   - LLM routes ไม่ forward user token ไปยัง upstream
   - ไม่สามารถ track ว่า user คนไหนใช้ LLM

3. **Desktop App Integration**
   - ไม่มี endpoint สำหรับ desktop app login
   - ไม่มี token exchange mechanism

## สิ่งที่ต้องพัฒนา

### 1. Database Schema Updates

```sql
-- Add credits to users table
ALTER TABLE users ADD COLUMN credits INT DEFAULT 0;

-- Create credit transactions table
CREATE TABLE credit_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  amount INT NOT NULL,
  type ENUM('purchase', 'usage', 'bonus', 'refund') NOT NULL,
  description TEXT,
  metadata JSON,
  balanceAfter INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

### 2. Credit Service APIs

- `GET /api/credits/balance` - Get user's credit balance
- `POST /api/credits/deduct` - Deduct credits (internal use)
- `GET /api/credits/history` - Get transaction history

### 3. LLM Route Updates

- Extract user from token
- Check credit balance before LLM call
- Deduct credits after successful LLM call
- Return credit info in response

### 4. Desktop App Auth Flow

Option A: **Token Exchange**
- Desktop app redirects to SmartSpecWeb login
- SmartSpecWeb returns auth token to desktop app
- Desktop app uses token for all API calls

Option B: **API Key**
- User generates API key from SmartSpecWeb dashboard
- Desktop app uses API key for authentication
- API key linked to user for credit tracking

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Desktop App    │────▶│  Python Backend │────▶│  SmartSpecWeb   │
│  (React/Tauri)  │     │  (FastAPI)      │     │  (Express)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │ User Token            │ Forward Token         │ Credit Check
        │                       │                       │ Credit Deduct
        │                       │                       │ LLM Proxy
        ▼                       ▼                       ▼
                                                ┌─────────────────┐
                                                │  Forge API      │
                                                │  (LLM Provider) │
                                                └─────────────────┘
```

## Priority Tasks

1. **High**: Add credits field to users table
2. **High**: Create credit transactions table
3. **High**: Add credit check/deduct to LLM routes
4. **Medium**: Create credit balance API
5. **Medium**: Add user identification in LLM routes
6. **Low**: Desktop app auth flow
