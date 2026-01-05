# SmartSpec Pro - Dashboard Guide

**Version:** 0.4.0  
**Date:** 30 December 2025

---

## 📋 **Overview**

Complete guide สำหรับ User Dashboard ของ SmartSpec Pro

**Features:**
- Credit balance display
- Usage statistics
- Payment history
- LLM usage breakdown
- Real-time updates (future)
- Responsive design

---

## 🎯 **Dashboard Sections**

### **1. Header**
- User information
- Current credit balance
- Quick top-up button
- Notifications (future)

### **2. Summary Cards**
- **Total Spent:** Total amount paid
- **Total Usage:** Total credits used + requests made
- **Average Cost:** Cost per request
- **This Month:** Current month spending

### **3. Usage Chart**
- Line chart showing daily usage
- Toggle between credits/requests/cost
- Time range selector (7d, 30d, 90d)

### **4. Transaction List**
- Combined payment + usage transactions
- Filter by type (all, payment, usage)
- Pagination support

---

## 🔧 **API Endpoints**

### **1. Get Dashboard Summary**

```http
GET /api/dashboard/summary
Authorization: Bearer <token>
```

**Response:**
```json
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

### **2. Get Usage Over Time**

```http
GET /api/dashboard/usage?days=30
Authorization: Bearer <token>
```

**Response:**
```json
{
  "daily_usage": [
    {
      "date": "2025-12-01",
      "credits_used": 5000,
      "requests": 50,
      "cost_usd": 5.00
    },
    ...
  ],
  "days": 30,
  "start_date": "2025-11-30T12:00:00Z",
  "end_date": "2025-12-30T12:00:00Z"
}
```

### **3. Get Recent Transactions**

```http
GET /api/dashboard/transactions?limit=20&type=all
Authorization: Bearer <token>
```

**Response:**
```json
{
  "transactions": [
    {
      "id": "payment_123",
      "type": "payment",
      "date": "2025-12-30T12:00:00Z",
      "amount_usd": 100.00,
      "credits": 86956,
      "status": "completed",
      "description": "Credit top-up - $100.0"
    },
    {
      "id": "usage_124",
      "type": "usage",
      "date": "2025-12-30T11:00:00Z",
      "amount_usd": -0.15,
      "credits": -150,
      "status": "completed",
      "description": "LLM usage"
    }
  ],
  "total": 20,
  "limit": 20,
  "type": "all"
}
```

---

## 💻 **Frontend Implementation**

### **Installation**

```bash
# Install dependencies
npm install recharts axios

# Or with yarn
yarn add recharts axios
```

### **Basic Usage**

```typescript
import { DashboardPage } from '@/components/Dashboard';

function App() {
  return <DashboardPage />;
}
```

### **API Client Setup**

```typescript
// lib/api.ts
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### **Custom Hooks**

```typescript
// hooks/useDashboard.ts
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export const useDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/dashboard/summary');
      setSummary(response.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    loadSummary();
  };

  return { summary, loading, error, refresh };
};
```

---

## 📊 **Chart Configuration**

### **Line Chart (Usage Over Time)**

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={320}>
  <LineChart data={usageData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Line type="monotone" dataKey="credits_used" stroke="#3B82F6" />
  </LineChart>
</ResponsiveContainer>
```

### **Pie Chart (LLM Breakdown)**

```typescript
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie
      data={modelData}
      dataKey="percentage"
      nameKey="model"
      cx="50%"
      cy="50%"
      outerRadius={80}
      label
    >
      {modelData.map((entry, index) => (
        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
      ))}
    </Pie>
    <Tooltip />
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

---

## 🎨 **Styling**

### **Tailwind CSS Configuration**

```javascript
// tailwind.config.js
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },
      },
    },
  },
  plugins: [],
};
```

### **Custom CSS**

```css
/* styles/dashboard.css */
.dashboard-card {
  @apply bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow;
}

.stat-value {
  @apply text-2xl font-bold text-gray-900;
}

.stat-label {
  @apply text-sm font-medium text-gray-500;
}

.chart-container {
  @apply bg-white rounded-lg shadow p-6;
}
```

---

## 🔄 **Real-time Updates (Future)**

### **WebSocket Connection**

```typescript
// lib/websocket.ts
import { io } from 'socket.io-client';

export const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000');

// Listen for balance updates
socket.on('balance_updated', (data) => {
  console.log('Balance updated:', data);
  // Update UI
});

// Listen for new transactions
socket.on('transaction_created', (data) => {
  console.log('New transaction:', data);
  // Update UI
});
```

### **Polling Fallback**

```typescript
// hooks/useRealtimeBalance.ts
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export const useRealtimeBalance = (interval = 30000) => {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    const fetchBalance = async () => {
      const response = await api.get('/api/dashboard/summary');
      setBalance(response.data.balance);
    };

    fetchBalance();
    const timer = setInterval(fetchBalance, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return balance;
};
```

---

## 📱 **Responsive Design**

### **Breakpoints**

```typescript
// Mobile: < 640px
// Tablet: 640px - 1024px
// Desktop: > 1024px

// Example responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {/* Cards */}
</div>
```

### **Mobile Optimizations**

- Stack cards vertically
- Simplify charts
- Hide less important data
- Use bottom navigation
- Touch-friendly buttons

---

## 🧪 **Testing**

### **Unit Tests**

```typescript
// __tests__/Dashboard.test.tsx
import { render, screen } from '@testing-library/react';
import { DashboardPage } from '@/components/Dashboard';

describe('Dashboard', () => {
  it('renders dashboard header', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays credit balance', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Credit Balance/i)).toBeInTheDocument();
  });
});
```

### **Integration Tests**

```typescript
// __tests__/integration/dashboard.test.ts
import { api } from '@/lib/api';

describe('Dashboard API', () => {
  it('fetches dashboard summary', async () => {
    const response = await api.get('/api/dashboard/summary');
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('balance');
    expect(response.data).toHaveProperty('stats');
  });
});
```

---

## 🚀 **Deployment**

### **Environment Variables**

```env
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://api.smartspec.pro
NEXT_PUBLIC_WS_URL=wss://api.smartspec.pro

# Backend (.env)
CORS_ORIGINS=["https://app.smartspec.pro"]
```

### **Build**

```bash
# Build frontend
npm run build

# Start production server
npm run start
```

---

## 📚 **Examples**

### **Example 1: Simple Dashboard**

```typescript
import { useDashboard } from '@/hooks/useDashboard';

export const SimpleDashboard = () => {
  const { summary, loading } = useDashboard();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Balance: {summary.balance.credits} credits</h1>
      <p>Total Spent: ${summary.stats.total_spent_usd}</p>
    </div>
  );
};
```

### **Example 2: Custom Chart**

```typescript
import { LineChart, Line } from 'recharts';
import { useUsageData } from '@/hooks/useUsageData';

export const CustomChart = () => {
  const { data } = useUsageData(30);

  return (
    <LineChart width={600} height={300} data={data}>
      <Line type="monotone" dataKey="credits_used" stroke="#3B82F6" />
    </LineChart>
  );
};
```

### **Example 3: Transaction Filter**

```typescript
import { useState } from 'react';
import { useTransactions } from '@/hooks/useTransactions';

export const TransactionFilter = () => {
  const [type, setType] = useState('all');
  const { transactions } = useTransactions({ type });

  return (
    <div>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="all">All</option>
        <option value="payment">Payments</option>
        <option value="usage">Usage</option>
      </select>
      <ul>
        {transactions.map((t) => (
          <li key={t.id}>{t.description}</li>
        ))}
      </ul>
    </div>
  );
};
```

---

## 🔍 **Troubleshooting**

### **Issue: Dashboard not loading**

**Solution:**
1. Check API endpoint is accessible
2. Verify auth token is valid
3. Check CORS configuration
4. Check browser console for errors

### **Issue: Charts not rendering**

**Solution:**
1. Ensure recharts is installed
2. Check data format matches chart requirements
3. Verify ResponsiveContainer parent has height
4. Check for JavaScript errors

### **Issue: Real-time updates not working**

**Solution:**
1. Check WebSocket connection
2. Verify WebSocket URL is correct
3. Check firewall/proxy settings
4. Use polling fallback

---

## ✅ **Best Practices**

1. **Performance**
   - Cache dashboard data (5 minutes)
   - Lazy load charts
   - Debounce real-time updates
   - Use pagination for transactions

2. **UX**
   - Show loading states
   - Handle errors gracefully
   - Provide feedback for actions
   - Use skeleton screens

3. **Security**
   - Validate all API responses
   - Sanitize user input
   - Use HTTPS in production
   - Implement rate limiting

4. **Accessibility**
   - Use semantic HTML
   - Add ARIA labels
   - Ensure keyboard navigation
   - Test with screen readers

---

## 📖 **References**

- **Recharts:** https://recharts.org/
- **Tailwind CSS:** https://tailwindcss.com/
- **React:** https://react.dev/
- **Next.js:** https://nextjs.org/

---

## 🎉 **Summary**

Dashboard Guide สำหรับ SmartSpec Pro:

- ✅ Complete API documentation
- ✅ Frontend implementation guide
- ✅ Chart configuration examples
- ✅ Real-time updates (future)
- ✅ Responsive design
- ✅ Testing guide
- ✅ Deployment instructions
- ✅ Troubleshooting tips

**Ready to use! 🚀**
