# Payment Integration Testing Guide

**Version:** 0.3.0  
**Date:** 30 December 2025

---

## 📋 **Overview**

คู่มือการทดสอบ Stripe Payment Integration สำหรับ SmartSpec Pro

---

## 🔧 **Setup**

### **1. Get Stripe Test Keys**

1. สมัคร Stripe account: https://dashboard.stripe.com/register
2. ไปที่ Developers → API keys
3. Copy test keys:
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`

### **2. Configure Environment**

```bash
cd python-backend

# Edit .env
nano .env
```

```env
# Stripe Test Keys
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...  # Get from webhook setup
```

### **3. Install Stripe CLI**

```bash
# Mac
brew install stripe/stripe-cli/stripe

# Linux
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz
tar -xvf stripe_1.19.4_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/

# Login
stripe login
```

---

## 🧪 **Test Scenarios**

### **Scenario 1: Successful Payment**

#### **Step 1: Create Checkout Session**

```bash
curl -X POST http://localhost:8000/api/payments/checkout \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_usd": 100.00,
    "success_url": "http://localhost:3000/dashboard?payment=success",
    "cancel_url": "http://localhost:3000/dashboard?payment=cancel"
  }'
```

**Response:**
```json
{
  "session_id": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "credits_to_receive": 86956,
  "amount_usd": 100.0,
  "payment_transaction_id": 1
}
```

#### **Step 2: Complete Payment**

1. Open `url` in browser
2. Use test card: `4242 4242 4242 4242`
3. Expiry: Any future date (e.g., 12/34)
4. CVC: Any 3 digits (e.g., 123)
5. ZIP: Any 5 digits (e.g., 12345)
6. Click "Pay"

#### **Step 3: Verify Credits Added**

```bash
curl http://localhost:8000/api/credits/balance \
  -H "Authorization: Bearer <your_token>"
```

**Expected:**
```json
{
  "balance_credits": 86956,
  "balance_usd": 86.956
}
```

---

### **Scenario 2: Failed Payment**

#### **Step 1: Create Checkout Session**

Same as Scenario 1

#### **Step 2: Use Declined Card**

Use test card: `4000 0000 0000 0002`

**Expected:**
- Payment declined
- No credits added
- Transaction status = "failed"

---

### **Scenario 3: Webhook Testing**

#### **Step 1: Start Webhook Forwarding**

```bash
# Terminal 1: Start server
cd python-backend
uvicorn app.main:app --reload

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:8000/api/payments/webhook
```

**Output:**
```
> Ready! Your webhook signing secret is whsec_...
```

#### **Step 2: Update .env**

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### **Step 3: Trigger Test Event**

```bash
stripe trigger checkout.session.completed
```

**Expected:**
- Webhook received
- Event processed
- Credits added

---

### **Scenario 4: Idempotency Test**

#### **Step 1: Complete Payment**

Complete a successful payment (Scenario 1)

#### **Step 2: Resend Webhook**

```bash
stripe trigger checkout.session.completed \
  --override checkout_session:id=cs_test_...
```

**Expected:**
- Webhook received
- Already processed (idempotency)
- Credits NOT added again

---

## 💳 **Test Cards**

### **Success**

| Card Number | Description |
|-------------|-------------|
| 4242 4242 4242 4242 | Visa (success) |
| 5555 5555 5555 4444 | Mastercard (success) |
| 3782 822463 10005 | American Express (success) |

### **Decline**

| Card Number | Description |
|-------------|-------------|
| 4000 0000 0000 0002 | Generic decline |
| 4000 0000 0000 9995 | Insufficient funds |
| 4000 0000 0000 0069 | Expired card |

### **Authentication**

| Card Number | Description |
|-------------|-------------|
| 4000 0025 0000 3155 | 3D Secure required |
| 4000 0027 6000 3184 | 3D Secure 2 required |

---

## 📊 **API Testing**

### **1. Get Predefined Amounts**

```bash
curl http://localhost:8000/api/payments/amounts
```

**Response:**
```json
{
  "amounts": {
    "small": {
      "amount_usd": 10.0,
      "credits": 8695,
      "label": "Small Top-up"
    },
    "medium": {
      "amount_usd": 50.0,
      "credits": 43478,
      "label": "Medium Top-up"
    },
    "large": {
      "amount_usd": 100.0,
      "credits": 86956,
      "label": "Large Top-up"
    },
    "xlarge": {
      "amount_usd": 500.0,
      "credits": 434782,
      "label": "Extra Large Top-up"
    }
  },
  "currency": "USD",
  "min_amount": 5.0,
  "max_amount": 10000.0
}
```

### **2. Check Payment Status**

```bash
curl http://localhost:8000/api/payments/status/cs_test_... \
  -H "Authorization: Bearer <your_token>"
```

**Response:**
```json
{
  "session_id": "cs_test_...",
  "status": "completed",
  "amount_usd": 100.0,
  "credits_amount": 86956,
  "credits_added": 86956,
  "payment_intent_id": "pi_...",
  "created_at": "2025-12-30T12:00:00Z",
  "completed_at": "2025-12-30T12:01:00Z"
}
```

### **3. Get Payment History**

```bash
curl http://localhost:8000/api/payments/history?limit=10 \
  -H "Authorization: Bearer <your_token>"
```

**Response:**
```json
{
  "payments": [
    {
      "id": 1,
      "amount_usd": 100.0,
      "credits_amount": 86956,
      "status": "completed",
      "payment_method": "card",
      "created_at": "2025-12-30T12:00:00Z",
      "completed_at": "2025-12-30T12:01:00Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

---

## 🔍 **Debugging**

### **Check Logs**

```bash
# Server logs
tail -f logs/smartspec.log

# Stripe CLI logs
stripe logs tail
```

### **Check Database**

```bash
sqlite3 data/smartspec.db

# Check payment transactions
SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 5;

# Check credit transactions
SELECT * FROM credit_transactions ORDER BY created_at DESC LIMIT 5;

# Check user balance
SELECT id, email, credits_balance FROM users;
```

### **Common Issues**

#### **Issue: Webhook signature verification failed**

**Solution:**
1. Check STRIPE_WEBHOOK_SECRET in .env
2. Restart server after updating .env
3. Use Stripe CLI to get correct secret

#### **Issue: Credits not added**

**Solution:**
1. Check webhook logs
2. Verify event type is `checkout.session.completed`
3. Check payment_transactions table status
4. Check credit_transactions table

#### **Issue: Duplicate credits added**

**Solution:**
1. Check idempotency logic in `handle_checkout_completed`
2. Verify stripe_session_id is unique
3. Check transaction status before adding credits

---

## 📝 **Test Checklist**

- [ ] Create checkout session
- [ ] Complete payment with success card
- [ ] Verify credits added
- [ ] Check payment transaction recorded
- [ ] Check credit transaction recorded
- [ ] Test with declined card
- [ ] Verify no credits added on decline
- [ ] Test webhook forwarding
- [ ] Test idempotency (duplicate webhook)
- [ ] Test payment history API
- [ ] Test payment status API
- [ ] Test predefined amounts API
- [ ] Test with different amounts ($10, $50, $100, $500)
- [ ] Test with custom amount
- [ ] Test min/max amount validation
- [ ] Test authentication required card
- [ ] Test webhook signature verification
- [ ] Test unauthorized access (wrong user)
- [ ] Check all logs
- [ ] Check database records

---

## 🚀 **Production Testing**

### **Before Go-Live:**

1. **Switch to Live Keys**
   ```env
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_SECRET_KEY=sk_live_...
   ```

2. **Setup Webhook Endpoint**
   - Go to Stripe Dashboard → Webhooks
   - Add endpoint: `https://api.smartspec.pro/api/payments/webhook`
   - Select events:
     - `checkout.session.completed`
     - `payment_intent.payment_failed`
   - Copy webhook signing secret to .env

3. **Test with Small Amount**
   - Use real card
   - Test $5 payment
   - Verify credits added
   - Verify webhook received

4. **Monitor**
   - Check Stripe Dashboard
   - Check application logs
   - Check database records
   - Setup alerts for failed payments

---

## 📚 **Resources**

- Stripe Testing: https://stripe.com/docs/testing
- Stripe CLI: https://stripe.com/docs/stripe-cli
- Stripe Webhooks: https://stripe.com/docs/webhooks
- Test Cards: https://stripe.com/docs/testing#cards

---

## ✅ **Summary**

Payment integration testing complete:

- ✅ Test environment setup
- ✅ Successful payment flow
- ✅ Failed payment handling
- ✅ Webhook testing
- ✅ Idempotency testing
- ✅ API endpoint testing
- ✅ Debugging guide
- ✅ Production checklist

**Ready for testing! 🧪**
