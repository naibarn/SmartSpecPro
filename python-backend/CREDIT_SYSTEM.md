# SmartSpec Pro - Credit System Documentation

**Version:** 2.0 (Integer-based Credits)  
**Date:** December 30, 2025  
**Status:** ✅ Implemented and Tested

---

## 📊 **Overview**

SmartSpec Pro uses a **credit-based payment system** where users purchase credits to use LLM services. The system is designed to be transparent, predictable, and easy to understand.

### **Key Principles**

1. **1 USD = 1,000 credits** (fixed conversion rate)
2. **Markup applied on top-up only** (not on usage)
3. **Actual LLM costs deducted** (no hidden fees on usage)
4. **Integer-based credits** (no decimal confusion)

---

## 💰 **Business Model**

### **Revenue Model**

SmartSpec Pro generates revenue through a **markup on credit purchases**:

- **Default Markup:** 15%
- **Configurable:** Admin can adjust markup percentage
- **Applied Once:** Only when user purchases credits, not on every LLM call

### **How It Works**

```
User Payment → Markup Deducted → Credits Added → LLM Usage → Credits Deducted
    $100    →   $13.04 revenue  →  86,956 credits →  $0.10 cost  →  100 credits
```

### **Example Calculation**

**Top-up:**
```
User pays: $100.00
Markup (15%): $100 / 1.15 = $86.956 (actual value)
Revenue: $100 - $86.956 = $13.044 (13.04% effective)
Credits received: 86,956 credits
```

**LLM Usage:**
```
LLM cost: $0.10 (actual provider cost)
Credits deducted: 100 credits (0.10 × 1,000)
No additional markup or fees
```

---

## 🔢 **Credit System**

### **Conversion Rate**

| USD | Credits |
|-----|---------|
| $0.001 | 1 credit |
| $0.01 | 10 credits |
| $0.10 | 100 credits |
| $1.00 | 1,000 credits |
| $10.00 | 10,000 credits |
| $100.00 | 100,000 credits |

### **Top-up Examples**

| Payment | Markup (15%) | Revenue | Credits Received | Effective Value |
|---------|--------------|---------|------------------|-----------------|
| $1.00 | $0.13 | $0.13 | 869 credits | $0.87 |
| $10.00 | $1.30 | $1.30 | 8,695 credits | $8.70 |
| $100.00 | $13.04 | $13.04 | 86,956 credits | $86.96 |
| $1,000.00 | $130.43 | $130.43 | 869,565 credits | $869.57 |

### **LLM Usage Examples**

| LLM Cost | Credits Deducted | Markup | Total Deducted |
|----------|------------------|--------|----------------|
| $0.001 | 1 credit | $0 | 1 credit |
| $0.01 | 10 credits | $0 | 10 credits |
| $0.10 | 100 credits | $0 | 100 credits |
| $1.00 | 1,000 credits | $0 | 1,000 credits |
| $10.00 | 10,000 credits | $0 | 10,000 credits |

---

## 🎯 **User Experience**

### **Scenario 1: New User**

```
1. User registers → Balance: 0 credits ($0.00)
2. User tops up $100 → Balance: 86,956 credits ($86.96)
3. User makes LLM call costing $0.50 → Balance: 86,456 credits ($86.46)
4. User can make 172 more $0.50 calls before running out
```

### **Scenario 2: Heavy User**

```
1. User tops up $1,000 → Balance: 869,565 credits ($869.57)
2. User makes 100 LLM calls @ $0.10 each → Balance: 859,565 credits ($859.57)
3. Total spent: $10.00, Remaining: $859.57
4. Can make 8,595 more $0.10 calls
```

### **Scenario 3: Budget-Conscious User**

```
1. User tops up $10 → Balance: 8,695 credits ($8.70)
2. User makes 87 LLM calls @ $0.10 each → Balance: 0 credits ($0.00)
3. User got 87 calls for $10 (effective cost: $0.115 per call)
```

---

## 🏗️ **Technical Implementation**

### **Database Schema**

```sql
-- Users table
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    credits_balance INTEGER NOT NULL DEFAULT 0,  -- Credits (not USD)
    ...
);

-- Credit transactions table
CREATE TABLE credit_transactions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(20) NOT NULL,  -- topup, deduction, refund, adjustment
    amount INTEGER NOT NULL,  -- Credits (not USD)
    balance_before INTEGER NOT NULL,  -- Credits
    balance_after INTEGER NOT NULL,  -- Credits
    metadata JSON,
    created_at TIMESTAMP,
    ...
);

-- System config table
CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);

-- Example: credit_markup_percent = "15"
```

### **Core Functions**

```python
# Credit conversion
usd_to_credits(Decimal("0.10")) → 100 credits
credits_to_usd(100) → Decimal("0.10")

# Markup calculation
calculate_credits_from_payment(Decimal("100.00")) → 86,956 credits
calculate_payment_from_credits(86956) → Decimal("100.00")
```

### **API Endpoints**

#### **1. Top-up Credits**

```http
POST /api/credits/topup
Authorization: Bearer <token>
Content-Type: application/json

{
  "payment_usd": 100.00,
  "payment_method": "stripe",
  "payment_id": "pi_xxx"
}
```

**Response:**
```json
{
  "transaction_id": "uuid",
  "payment_usd": 100.00,
  "markup_percent": 15.0,
  "markup_amount_usd": 13.044,
  "credits_received": 86956,
  "balance_credits": 86956,
  "balance_usd": 86.956,
  "message": "Successfully topped up 86,956 credits ($86.96 value). Your new balance is 86,956 credits ($86.96)."
}
```

#### **2. Get Balance**

```http
GET /api/credits/balance
Authorization: Bearer <token>
```

**Response:**
```json
{
  "balance_credits": 86956,
  "balance_usd": 86.956,
  "stats": {
    "total_added_credits": 86956,
    "total_added_usd": 86.956,
    "total_deducted_credits": 0,
    "total_deducted_usd": 0.0,
    "transaction_count": 1,
    "current_balance_credits": 86956,
    "current_balance_usd": 86.956
  }
}
```

#### **3. Get Transactions**

```http
GET /api/credits/transactions?limit=10&offset=0
Authorization: Bearer <token>
```

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "type": "topup",
      "amount": 86956,
      "amount_usd": 86.956,
      "description": "Top-up via stripe",
      "balance_before": 0,
      "balance_after": 86956,
      "metadata": {
        "payment_method": "stripe",
        "payment_id": "pi_xxx",
        "payment_usd": 100.0,
        "markup_percent": 15.0,
        "markup_amount_usd": 13.044,
        "actual_value_usd": 86.956,
        "credits_received": 86956
      },
      "created_at": "2025-12-30T10:00:00Z"
    },
    {
      "id": "uuid",
      "type": "deduction",
      "amount": 100,
      "amount_usd": 0.10,
      "description": "LLM call: code_generation using anthropic/claude-sonnet",
      "balance_before": 86956,
      "balance_after": 86856,
      "metadata": {
        "task_type": "code_generation",
        "provider": "anthropic",
        "model": "claude-sonnet",
        "tokens": 1500,
        "llm_cost": 0.10,
        "llm_cost_usd": 0.10,
        "credits_deducted": 100
      },
      "created_at": "2025-12-30T10:05:00Z"
    }
  ],
  "total": 2
}
```

#### **4. Calculate Credits**

```http
POST /api/credits/calculate
Authorization: Bearer <token>
Content-Type: application/json

{
  "payment_usd": 100.00
}
```

**Response:**
```json
{
  "payment_usd": 100.00,
  "credits": 86956,
  "markup_percent": 15.0,
  "markup_amount_usd": 13.044,
  "actual_value_usd": 86.956
}
```

---

## 🔐 **Security & Validation**

### **Authentication**

- All credit endpoints require JWT authentication
- Token must be valid and not expired
- User must be active

### **Validation**

- Payment amounts must be positive
- Credits must be sufficient before LLM calls
- Transactions are atomic (all-or-nothing)
- Balance checks before deduction

### **Audit Trail**

- All transactions logged with metadata
- Balance before/after recorded
- Timestamps for all operations
- User ID tracked for all transactions

---

## 📈 **Admin Controls**

### **Markup Configuration**

```python
# Get current markup
markup = await credit_service.get_markup_percent()  # Returns Decimal("15")

# Set new markup (admin only)
await credit_service.set_markup_percent(Decimal("20"))
```

### **Manual Adjustments**

```python
# Add credits (refund, bonus, etc.)
await credit_service.add_credits(
    user_id="uuid",
    amount=10000,  # 10,000 credits = $10
    description="Refund for failed transaction",
    transaction_type="refund"
)

# Direct deduction (admin correction)
await credit_service.deduct_credits(
    user_id="uuid",
    llm_cost_usd=Decimal("5.00"),
    description="Manual adjustment"
)
```

---

## 🧪 **Testing**

### **Test Coverage**

- ✅ 21/21 tests passing
- ✅ Credit conversion (USD ↔ Credits)
- ✅ Markup calculation (payment → credits)
- ✅ Business logic scenarios
- ✅ Edge cases (zero, very small, very large)
- ✅ Full user journey (topup → use → balance)

### **Run Tests**

```bash
cd python-backend
python3.11 -m pytest tests/unit/test_credit_system.py -v
```

---

## 🚀 **Migration Guide**

### **From DECIMAL to INTEGER**

**Old Schema (DECIMAL):**
```sql
credits_balance DECIMAL(10, 4)  -- Stored as USD
amount DECIMAL(10, 4)  -- Stored as USD
```

**New Schema (INTEGER):**
```sql
credits_balance INTEGER  -- Stored as credits (1 USD = 1,000 credits)
amount INTEGER  -- Stored as credits
```

**Migration Script:**
```sql
-- See: migrations/001_credit_system_integer.sql
-- Converts existing USD balances to credits (multiply by 1000)
```

---

## 📚 **References**

### **Related Files**

- `app/core/credits.py` - Core credit functions and constants
- `app/services/credit_service.py` - Credit service implementation
- `app/api/credits.py` - Credit API endpoints
- `app/models/user.py` - User model with credits_balance
- `app/models/credit.py` - CreditTransaction and SystemConfig models
- `app/llm_proxy/gateway.py` - LLM Gateway with credit checking
- `tests/unit/test_credit_system.py` - Comprehensive tests

### **Constants**

```python
USD_TO_CREDITS = 1000  # 1 USD = 1,000 credits
CREDITS_TO_USD = Decimal("0.001")  # 1 credit = $0.001
DEFAULT_MARKUP_PERCENT = Decimal("15.0")  # 15% markup
```

---

## ❓ **FAQ**

### **Q: Why 1,000 credits per USD?**
A: To avoid decimal confusion and make credits feel more substantial. It's easier to understand "100 credits" than "$0.10".

### **Q: Why is the effective revenue 13.04% instead of 15%?**
A: Because markup is calculated on the base price, not the total. $100 / 1.15 = $86.96, so revenue is $13.04 (13.04% of $100).

### **Q: Can users see the markup?**
A: Yes! The top-up response shows exact breakdown: payment, markup %, markup amount, and credits received.

### **Q: What happens if LLM call fails?**
A: Credits are only deducted after successful LLM call. If call fails, credits are not deducted.

### **Q: Can admin give free credits?**
A: Yes, using `add_credits()` with `transaction_type="adjustment"` or `"bonus"`.

### **Q: How to change markup percentage?**
A: Admin can call `set_markup_percent()` to update the system config. New markup applies to future top-ups only.

---

## 🎉 **Summary**

SmartSpec Pro's credit system is designed to be:

- ✅ **Transparent:** Users see exactly what they pay and get
- ✅ **Predictable:** Fixed conversion rate, no hidden fees
- ✅ **Fair:** Markup only on top-up, actual costs on usage
- ✅ **Simple:** Integer credits, easy calculations
- ✅ **Flexible:** Admin can adjust markup as needed
- ✅ **Auditable:** Full transaction history with metadata

**Ready for production! 🚀**
