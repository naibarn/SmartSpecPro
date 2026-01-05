# SmartSpec Pro - Payment Integration Design

**Phase:** 0.3  
**Date:** 30 December 2025  
**Status:** Design Phase

---

## 📋 **Overview**

Integration ของ Stripe Payment สำหรับ SmartSpec Pro credit top-up system

**Goals:**
- รองรับ credit top-up ผ่าน Stripe
- Secure payment processing
- Webhook handling สำหรับ payment events
- Transaction tracking และ logging
- Support multiple currencies (เริ่มจาก USD)

---

## 🏗️ **Payment Flow**

### **User Journey:**

```
1. User เข้า Dashboard
   ↓
2. Click "Top-up Credits"
   ↓
3. เลือกจำนวนเงิน ($10, $50, $100, $500, Custom)
   ↓
4. System คำนวณ credits ที่จะได้รับ
   - Payment: $100
   - Credits: 86,956 credits ($86.956 value)
   - Markup: $13.044 (13.04%)
   ↓
5. Click "Proceed to Payment"
   ↓
6. Backend สร้าง Stripe Checkout Session
   ↓
7. Redirect to Stripe Checkout
   ↓
8. User ชำระเงิน (Card, Google Pay, Apple Pay, etc.)
   ↓
9. Stripe processes payment
   ↓
10. Stripe sends webhook event
   ↓
11. Backend verifies webhook
   ↓
12. Backend adds credits to user account
   ↓
13. Redirect back to Dashboard
   ↓
14. Show success message + new balance
```

---

## 🔧 **Technical Architecture**

### **Components:**

```
Frontend (React/Tauri)
    ↓
Payment API (/api/payments)
    ├── POST /checkout - Create checkout session
    ├── GET /status/{session_id} - Check payment status
    └── POST /webhook - Handle Stripe webhooks
    ↓
Payment Service
    ├── Create checkout session
    ├── Verify webhook signature
    ├── Process payment events
    └── Add credits to user
    ↓
Credit Service
    └── Add credits with transaction record
    ↓
Database
    ├── users (credits_balance)
    ├── credit_transactions
    └── payment_transactions (new)
```

### **Database Schema:**

```sql
CREATE TABLE payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    
    -- Stripe info
    stripe_session_id VARCHAR(255) UNIQUE,
    stripe_payment_intent_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    
    -- Payment info
    amount_usd DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,  -- pending, completed, failed, refunded
    
    -- Credits info
    credits_amount INTEGER,
    credits_added_at TIMESTAMP,
    
    -- Metadata
    payment_method VARCHAR(50),
    metadata JSON,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_session_id ON payment_transactions(stripe_session_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
```

---

## 💻 **API Endpoints**

### **1. Create Checkout Session**

```http
POST /api/payments/checkout

Headers:
  Authorization: Bearer <token>

Request:
{
  "amount_usd": 100.00,
  "success_url": "https://app.smartspec.pro/dashboard?payment=success",
  "cancel_url": "https://app.smartspec.pro/dashboard?payment=cancel"
}

Response:
{
  "session_id": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "credits_to_receive": 86956,
  "amount_usd": 100.00
}
```

### **2. Check Payment Status**

```http
GET /api/payments/status/{session_id}

Headers:
  Authorization: Bearer <token>

Response:
{
  "session_id": "cs_test_...",
  "status": "completed",
  "amount_usd": 100.00,
  "credits_added": 86956,
  "payment_intent_id": "pi_...",
  "completed_at": "2025-12-30T12:00:00Z"
}
```

### **3. Webhook Handler**

```http
POST /api/payments/webhook

Headers:
  Stripe-Signature: <signature>

Body: (Stripe webhook event)

Response:
{
  "received": true
}
```

### **4. Payment History**

```http
GET /api/payments/history?limit=10

Headers:
  Authorization: Bearer <token>

Response:
{
  "payments": [
    {
      "id": 1,
      "amount_usd": 100.00,
      "credits_added": 86956,
      "status": "completed",
      "payment_method": "card",
      "created_at": "2025-12-30T12:00:00Z",
      "completed_at": "2025-12-30T12:01:00Z"
    }
  ],
  "total": 5
}
```

---

## 🔐 **Security**

### **1. Webhook Verification**

```python
import stripe

def verify_webhook(payload: bytes, sig_header: str) -> stripe.Event:
    """Verify Stripe webhook signature"""
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
        return event
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")
```

### **2. Idempotency**

- ใช้ `stripe_session_id` เป็น unique key
- ป้องกัน duplicate credit additions
- Check existing transaction ก่อน process

### **3. Amount Validation**

```python
def validate_amount(amount_usd: Decimal) -> bool:
    """Validate payment amount"""
    min_amount = Decimal("5.00")   # $5 minimum
    max_amount = Decimal("10000.00")  # $10,000 maximum
    
    if amount_usd < min_amount or amount_usd > max_amount:
        return False
    
    return True
```

---

## 📊 **Stripe Configuration**

### **Products & Prices:**

```python
# Predefined top-up amounts
TOP_UP_AMOUNTS = {
    "small": {
        "amount_usd": Decimal("10.00"),
        "credits": 8695,  # 10 / 1.15 * 1000
        "label": "Small Top-up"
    },
    "medium": {
        "amount_usd": Decimal("50.00"),
        "credits": 43478,  # 50 / 1.15 * 1000
        "label": "Medium Top-up"
    },
    "large": {
        "amount_usd": Decimal("100.00"),
        "credits": 86956,  # 100 / 1.15 * 1000
        "label": "Large Top-up"
    },
    "xlarge": {
        "amount_usd": Decimal("500.00"),
        "credits": 434782,  # 500 / 1.15 * 1000
        "label": "Extra Large Top-up"
    }
}
```

### **Checkout Session Configuration:**

```python
session = stripe.checkout.Session.create(
    payment_method_types=['card'],
    line_items=[{
        'price_data': {
            'currency': 'usd',
            'product_data': {
                'name': f'SmartSpec Pro Credits - {credits:,} credits',
                'description': f'Top-up ${amount_usd} → {credits:,} credits',
            },
            'unit_amount': int(amount_usd * 100),  # Amount in cents
        },
        'quantity': 1,
    }],
    mode='payment',
    success_url=success_url,
    cancel_url=cancel_url,
    customer_email=user.email,
    client_reference_id=str(user.id),
    metadata={
        'user_id': user.id,
        'credits_amount': credits,
        'amount_usd': str(amount_usd)
    }
)
```

---

## 🎯 **Webhook Events**

### **Events to Handle:**

1. **`checkout.session.completed`**
   - Payment succeeded
   - Add credits to user account
   - Create credit transaction record
   - Send confirmation email

2. **`payment_intent.succeeded`**
   - Backup confirmation
   - Log successful payment

3. **`payment_intent.payment_failed`**
   - Payment failed
   - Update transaction status
   - Send failure notification

4. **`charge.refunded`**
   - Refund processed
   - Deduct credits from user account
   - Create refund transaction record

### **Event Handler:**

```python
async def handle_webhook_event(event: stripe.Event):
    """Handle Stripe webhook events"""
    
    event_type = event['type']
    
    if event_type == 'checkout.session.completed':
        session = event['data']['object']
        await handle_checkout_completed(session)
    
    elif event_type == 'payment_intent.succeeded':
        payment_intent = event['data']['object']
        await handle_payment_succeeded(payment_intent)
    
    elif event_type == 'payment_intent.payment_failed':
        payment_intent = event['data']['object']
        await handle_payment_failed(payment_intent)
    
    elif event_type == 'charge.refunded':
        charge = event['data']['object']
        await handle_charge_refunded(charge)
    
    else:
        logger.info(f"Unhandled event type: {event_type}")
```

---

## 💰 **Credit Calculation**

```python
from decimal import Decimal
from app.core.credits import MARKUP_PERCENTAGE, usd_to_credits

def calculate_credits_from_payment(payment_usd: Decimal) -> int:
    """
    Calculate credits from payment amount
    
    Formula:
    - Actual value = Payment / (1 + Markup)
    - Credits = Actual value * 1000
    
    Example:
    - Payment: $100
    - Markup: 15%
    - Actual: $100 / 1.15 = $86.956
    - Credits: 86,956
    """
    return usd_to_credits(payment_usd)

def calculate_payment_from_credits(credits: int) -> Decimal:
    """
    Calculate payment amount from desired credits
    
    Formula:
    - Actual value = Credits / 1000
    - Payment = Actual value * (1 + Markup)
    
    Example:
    - Credits: 86,956
    - Actual: $86.956
    - Markup: 15%
    - Payment: $86.956 * 1.15 = $100
    """
    from app.core.credits import credits_to_usd
    
    actual_value = credits_to_usd(credits)
    payment = actual_value * (Decimal("1") + MARKUP_PERCENTAGE)
    return payment.quantize(Decimal("0.01"))
```

---

## 🧪 **Testing**

### **Test Mode:**

```python
# Use Stripe test keys
STRIPE_PUBLISHABLE_KEY = "pk_test_..."
STRIPE_SECRET_KEY = "sk_test_..."
STRIPE_WEBHOOK_SECRET = "whsec_test_..."

# Test cards
TEST_CARDS = {
    "success": "4242424242424242",
    "decline": "4000000000000002",
    "authentication": "4000002500003155"
}
```

### **Test Scenarios:**

1. **Successful Payment:**
   - Use test card 4242 4242 4242 4242
   - Complete checkout
   - Verify credits added
   - Verify transaction recorded

2. **Failed Payment:**
   - Use test card 4000 0000 0000 0002
   - Payment declined
   - Verify no credits added
   - Verify transaction status = failed

3. **Webhook Handling:**
   - Use Stripe CLI to forward webhooks
   - Test all event types
   - Verify proper handling

4. **Idempotency:**
   - Send duplicate webhook events
   - Verify credits only added once

---

## 📝 **Implementation Checklist**

- [ ] Setup Stripe account and get API keys
- [ ] Install stripe-python library
- [ ] Create payment_transactions table
- [ ] Implement PaymentService
- [ ] Create payment API endpoints
- [ ] Implement webhook handler
- [ ] Add webhook signature verification
- [ ] Implement idempotency checks
- [ ] Add payment history endpoint
- [ ] Create frontend payment UI
- [ ] Test with Stripe test mode
- [ ] Setup webhook endpoint in Stripe Dashboard
- [ ] Add monitoring and logging
- [ ] Write documentation
- [ ] Deploy to production

---

## 🚀 **Deployment**

### **Environment Variables:**

```env
# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Payment Settings
PAYMENT_MIN_AMOUNT=5.00
PAYMENT_MAX_AMOUNT=10000.00
PAYMENT_CURRENCY=USD
```

### **Webhook Endpoint:**

```
Production: https://api.smartspec.pro/api/payments/webhook
Development: https://dev.smartspec.pro/api/payments/webhook
Local: Use Stripe CLI to forward webhooks
```

---

## 📚 **References**

- Stripe Payment Intents API: https://stripe.com/docs/payments/payment-intents
- Stripe Checkout: https://stripe.com/docs/payments/checkout
- Stripe Webhooks: https://stripe.com/docs/webhooks
- Stripe Python SDK: https://stripe.com/docs/api/python

---

## 🎉 **Summary**

Payment Integration Design สำหรับ SmartSpec Pro:

- ✅ Stripe Checkout integration
- ✅ Secure webhook handling
- ✅ Credit calculation (15% markup)
- ✅ Transaction tracking
- ✅ Payment history
- ✅ Multiple payment methods
- ✅ Test mode support
- ✅ Production ready

**Ready for implementation! 🚀**
