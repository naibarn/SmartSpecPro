# SmartSpec Pro - User Dashboard Design

**Phase:** 0.4  
**Date:** 30 December 2025  
**Status:** Design Phase

---

## 📋 **Overview**

User Dashboard สำหรับ SmartSpec Pro ที่แสดงข้อมูลครบถ้วนเกี่ยวกับ credits, payments, และ usage

**Goals:**
- แสดง credit balance และ payment history
- แสดง usage statistics และ LLM usage breakdown
- Quick actions สำหรับ top-up และ view transactions
- Real-time updates
- Responsive design

---

## 🎨 **Dashboard Layout**

### **Main Sections:**

```
┌─────────────────────────────────────────────────────────┐
│  Header: User Info + Credit Balance + Top-up Button    │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Total Spent  │  │ Total Usage  │  │ Avg Cost     │ │
│  │  $1,234.56   │  │  1,234,567   │  │  $0.15/req   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────┤
│  Usage Chart (Last 30 Days)                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │  [Line Chart: Credits Used Over Time]          │   │
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────┐   │
│  │  LLM Usage Breakdown │  │  Provider Breakdown  │   │
│  │  [Pie Chart]         │  │  [Bar Chart]         │   │
│  └──────────────────────┘  └──────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  Recent Transactions                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Date  │  Type  │  Amount  │  Credits  │ Status │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  ...   │  ...   │  ...     │  ...      │  ...   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 **Data Requirements**

### **1. Credit Balance**
- Current balance (credits)
- Current balance (USD)
- Last updated timestamp

### **2. Summary Statistics**
- Total spent (USD)
- Total credits purchased
- Total credits used
- Total requests made
- Average cost per request
- Current month spending
- Last 30 days usage

### **3. Usage Over Time**
- Daily credits used (last 30 days)
- Daily requests made (last 30 days)
- Daily cost (last 30 days)

### **4. LLM Usage Breakdown**
- Usage by model
- Usage by provider
- Usage by task type
- Cost by model
- Cost by provider

### **5. Recent Transactions**
- Payment transactions (last 10)
- Credit transactions (last 20)
- Combined timeline

### **6. Provider Statistics**
- Requests per provider
- Cost per provider
- Success rate per provider
- Average latency per provider

---

## 🔧 **API Endpoints**

### **1. Dashboard Summary**

```http
GET /api/dashboard/summary

Response:
{
  "balance": {
    "credits": 86956,
    "usd": 86.956,
    "last_updated": "2025-12-30T12:00:00Z"
  },
  "stats": {
    "total_spent_usd": 1234.56,
    "total_credits_purchased": 1234567,
    "total_credits_used": 987654,
    "total_requests": 12345,
    "avg_cost_per_request": 0.15,
    "current_month_spending": 234.56,
    "last_30_days_usage": 123456
  }
}
```

### **2. Usage Over Time**

```http
GET /api/dashboard/usage?days=30

Response:
{
  "daily_usage": [
    {
      "date": "2025-12-01",
      "credits_used": 5000,
      "requests": 50,
      "cost_usd": 5.00
    },
    ...
  ]
}
```

### **3. LLM Usage Breakdown**

```http
GET /api/dashboard/llm-usage?days=30

Response:
{
  "by_model": [
    {
      "model": "gpt-4o",
      "requests": 100,
      "credits_used": 10000,
      "cost_usd": 10.00,
      "percentage": 25.5
    },
    ...
  ],
  "by_provider": [
    {
      "provider": "openai",
      "requests": 200,
      "credits_used": 20000,
      "cost_usd": 20.00,
      "percentage": 51.0
    },
    ...
  ],
  "by_task_type": [
    {
      "task_type": "code_generation",
      "requests": 150,
      "credits_used": 15000,
      "cost_usd": 15.00,
      "percentage": 38.3
    },
    ...
  ]
}
```

### **4. Recent Transactions**

```http
GET /api/dashboard/transactions?limit=20

Response:
{
  "transactions": [
    {
      "id": 123,
      "type": "payment",
      "date": "2025-12-30T12:00:00Z",
      "amount_usd": 100.00,
      "credits": 86956,
      "status": "completed",
      "description": "Credit top-up"
    },
    {
      "id": 124,
      "type": "usage",
      "date": "2025-12-30T11:00:00Z",
      "amount_usd": -0.15,
      "credits": -150,
      "status": "completed",
      "description": "LLM request - gpt-4o"
    },
    ...
  ]
}
```

### **5. Provider Statistics**

```http
GET /api/dashboard/providers?days=30

Response:
{
  "providers": [
    {
      "provider": "openai",
      "requests": 200,
      "credits_used": 20000,
      "cost_usd": 20.00,
      "success_rate": 99.5,
      "avg_latency_ms": 1234,
      "percentage": 51.0
    },
    ...
  ]
}
```

---

## 💻 **Dashboard Components**

### **1. DashboardHeader**
- User info (name, email)
- Credit balance display
- Top-up button
- Notifications icon

### **2. SummaryCards**
- Total Spent card
- Total Usage card
- Average Cost card
- Current Month card

### **3. UsageChart**
- Line chart for daily usage
- Time range selector (7d, 30d, 90d)
- Toggle between credits/requests/cost

### **4. LLMBreakdown**
- Pie chart for model usage
- Bar chart for provider usage
- Table for detailed breakdown

### **5. TransactionList**
- Combined payment + credit transactions
- Filter by type (all, payments, usage)
- Pagination
- Export to CSV

### **6. ProviderStats**
- Provider comparison table
- Success rate indicators
- Latency indicators

---

## 🎨 **UI/UX Design**

### **Color Scheme**

```css
/* Primary Colors */
--primary-blue: #3B82F6;
--primary-blue-dark: #2563EB;
--primary-blue-light: #DBEAFE;

/* Status Colors */
--success-green: #10B981;
--warning-yellow: #F59E0B;
--error-red: #EF4444;
--info-blue: #3B82F6;

/* Neutral Colors */
--gray-50: #F9FAFB;
--gray-100: #F3F4F6;
--gray-200: #E5E7EB;
--gray-300: #D1D5DB;
--gray-600: #4B5563;
--gray-900: #111827;
```

### **Typography**

```css
/* Headings */
h1: font-size: 2.25rem, font-weight: 700
h2: font-size: 1.875rem, font-weight: 600
h3: font-size: 1.5rem, font-weight: 600

/* Body */
body: font-size: 1rem, font-weight: 400
small: font-size: 0.875rem, font-weight: 400
```

### **Spacing**

```css
/* Card Padding */
card-padding: 1.5rem (24px)

/* Section Spacing */
section-spacing: 2rem (32px)

/* Element Spacing */
element-spacing: 1rem (16px)
```

---

## 📱 **Responsive Design**

### **Breakpoints**

```css
/* Mobile */
@media (max-width: 640px) {
  /* Stack cards vertically */
  /* Hide complex charts */
  /* Show simplified views */
}

/* Tablet */
@media (min-width: 641px) and (max-width: 1024px) {
  /* 2-column layout */
  /* Show all charts */
}

/* Desktop */
@media (min-width: 1025px) {
  /* 3-column layout */
  /* Show all features */
}
```

---

## 🔄 **Real-time Updates**

### **WebSocket Events**

```typescript
// Credit balance updated
{
  "event": "balance_updated",
  "data": {
    "credits": 86956,
    "usd": 86.956
  }
}

// New transaction
{
  "event": "transaction_created",
  "data": {
    "type": "payment",
    "amount_usd": 100.00,
    "credits": 86956
  }
}

// Usage event
{
  "event": "usage_recorded",
  "data": {
    "model": "gpt-4o",
    "credits_used": 150,
    "cost_usd": 0.15
  }
}
```

### **Polling Fallback**

```typescript
// Poll every 30 seconds if WebSocket not available
setInterval(() => {
  fetchDashboardSummary();
}, 30000);
```

---

## 📊 **Charts & Visualizations**

### **Libraries**

- **Recharts** - React charting library
- **Chart.js** - Alternative charting library
- **D3.js** - Advanced visualizations

### **Chart Types**

1. **Line Chart** - Usage over time
2. **Pie Chart** - LLM model breakdown
3. **Bar Chart** - Provider comparison
4. **Area Chart** - Cost over time
5. **Donut Chart** - Task type breakdown

---

## 🔐 **Security**

### **Data Access**

- User can only see their own data
- JWT token authentication required
- Rate limiting on dashboard APIs

### **Data Privacy**

- No sensitive data in frontend
- Aggregate statistics only
- No raw request/response data

---

## ⚡ **Performance**

### **Optimization**

- Cache dashboard summary (5 minutes)
- Paginate transaction list
- Lazy load charts
- Debounce real-time updates

### **Loading States**

- Skeleton screens for cards
- Loading spinners for charts
- Progressive loading

---

## 🧪 **Testing**

### **Unit Tests**

- Dashboard service tests
- API endpoint tests
- Component tests

### **Integration Tests**

- Full dashboard flow
- Real-time updates
- Chart rendering

### **E2E Tests**

- User journey
- Top-up flow
- Transaction viewing

---

## 📚 **Implementation Plan**

### **Phase 1: Backend (Day 1)**
- [ ] Create dashboard API endpoints
- [ ] Implement dashboard service
- [ ] Add data aggregation queries
- [ ] Test API endpoints

### **Phase 2: Frontend (Day 2)**
- [ ] Create dashboard layout
- [ ] Implement summary cards
- [ ] Add transaction list
- [ ] Test responsive design

### **Phase 3: Charts (Day 3)**
- [ ] Add usage chart
- [ ] Add LLM breakdown charts
- [ ] Add provider stats
- [ ] Test chart rendering

### **Phase 4: Real-time (Day 4)**
- [ ] Implement WebSocket
- [ ] Add polling fallback
- [ ] Test real-time updates
- [ ] Add notifications

### **Phase 5: Polish (Day 5)**
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add animations
- [ ] Write documentation

---

## ✅ **Success Criteria**

- [ ] Dashboard loads in < 2 seconds
- [ ] All statistics display correctly
- [ ] Charts render properly
- [ ] Real-time updates work
- [ ] Responsive on all devices
- [ ] No performance issues
- [ ] Comprehensive documentation
- [ ] All tests pass

---

## 🎉 **Summary**

Dashboard Design สำหรับ SmartSpec Pro:

- ✅ Comprehensive data display
- ✅ Multiple chart types
- ✅ Real-time updates
- ✅ Responsive design
- ✅ Performance optimized
- ✅ Security focused
- ✅ Well documented

**Ready for implementation! 🚀**
