# Analytics & Notifications System

**SmartSpec Pro - Usage Analytics and Notification System**

## Overview

The Analytics & Notifications system provides comprehensive usage tracking, cost analysis, and multi-channel notification capabilities for SmartSpec Pro users.

## Features

### 1. Usage Analytics

**Comprehensive Usage Tracking:**
- Total requests, credits, and costs
- Breakdown by provider and model
- Time-series data for charts
- Daily/hourly granularity
- Payment history integration

**Key Metrics:**
- Total LLM requests
- Total credits consumed
- Total cost in USD
- Average credits per request
- Average cost per request
- Cost breakdown by provider
- Cost breakdown by model

**Time-Series Analysis:**
- Daily aggregation (default)
- Hourly aggregation (for detailed analysis)
- Customizable time periods (7, 30, 90 days)
- Trend visualization data

**Provider Comparison:**
- Side-by-side provider comparison
- Cost percentage breakdown
- Models used per provider
- Average cost per request by provider

**Top Models:**
- Most-used models ranked by cost
- Request count per model
- Average cost per request per model

**Data Export:**
- CSV export for external analysis
- Detailed transaction history
- Date, time, provider, model, credits, cost

### 2. Notification System

**Multi-Channel Notifications:**
- **In-app notifications** (always enabled)
- **Email notifications** (optional, configurable)
- **Webhook notifications** (optional, for integrations)

**Notification Types:**
- `info` - Informational messages
- `warning` - Warning messages (e.g., low credits)
- `error` - Error messages (e.g., payment failed)
- `success` - Success messages (e.g., payment successful)

**Built-in Notifications:**
- Low credits warning
- Payment successful
- Payment failed
- Refund processed
- Custom admin notifications

**Notification Management:**
- List all notifications
- Filter by read status
- Filter by type
- Mark as read (single or all)
- Delete notifications
- Unread count badge

## API Endpoints

### Analytics Endpoints

#### 1. Get Usage Summary

```http
GET /api/v1/analytics/summary?days=30
Authorization: Bearer <token>
```

**Response:**
```json
{
  "period": {
    "start": "2024-01-01T00:00:00",
    "end": "2024-01-31T23:59:59",
    "days": 30
  },
  "usage": {
    "total_requests": 1250,
    "total_credits": 125000,
    "total_cost_usd": 125.00,
    "avg_credits_per_request": 100.00,
    "avg_cost_per_request_usd": 0.1000
  },
  "payments": {
    "total_paid_usd": 200.00,
    "total_credits_purchased": 173913,
    "payment_count": 2
  },
  "by_provider": {
    "openai": {
      "requests": 800,
      "credits": 80000,
      "cost_usd": 80.00
    },
    "anthropic": {
      "requests": 450,
      "credits": 45000,
      "cost_usd": 45.00
    }
  },
  "by_model": {
    "openai/gpt-4": {
      "requests": 500,
      "credits": 50000,
      "cost_usd": 50.00
    }
  },
  "by_day": {
    "2024-01-15": {
      "requests": 50,
      "credits": 5000,
      "cost_usd": 5.00
    }
  }
}
```

#### 2. Get Time-Series Data

```http
GET /api/v1/analytics/time-series?days=30&granularity=day
Authorization: Bearer <token>
```

**Parameters:**
- `days` - Number of days (default: 30)
- `granularity` - `day` or `hour` (default: day)

**Response:**
```json
{
  "granularity": "day",
  "period_days": 30,
  "data_points": 30,
  "data": [
    {
      "timestamp": "2024-01-01",
      "requests": 45,
      "credits": 4500,
      "cost_usd": 4.5000
    },
    {
      "timestamp": "2024-01-02",
      "requests": 52,
      "credits": 5200,
      "cost_usd": 5.2000
    }
  ]
}
```

#### 3. Get Provider Comparison

```http
GET /api/v1/analytics/providers?days=30
Authorization: Bearer <token>
```

**Response:**
```json
{
  "period_days": 30,
  "providers": [
    {
      "provider": "openai",
      "requests": 800,
      "credits": 80000,
      "cost_usd": 80.00,
      "cost_percentage": 64.00,
      "avg_cost_per_request": 0.1000,
      "models_used": ["gpt-4", "gpt-3.5-turbo"]
    },
    {
      "provider": "anthropic",
      "requests": 450,
      "credits": 45000,
      "cost_usd": 45.00,
      "cost_percentage": 36.00,
      "avg_cost_per_request": 0.1000,
      "models_used": ["claude-3-opus", "claude-3-sonnet"]
    }
  ],
  "total_providers": 2
}
```

#### 4. Get Top Models

```http
GET /api/v1/analytics/top-models?days=30&limit=10
Authorization: Bearer <token>
```

**Response:**
```json
{
  "period_days": 30,
  "limit": 10,
  "models": [
    {
      "model": "openai/gpt-4",
      "provider": "openai",
      "model_name": "gpt-4",
      "requests": 500,
      "credits": 50000,
      "cost_usd": 50.00,
      "avg_cost_per_request": 0.1000
    }
  ],
  "total": 5
}
```

#### 5. Export Usage to CSV

```http
GET /api/v1/analytics/export/csv?days=30
Authorization: Bearer <token>
```

**Response:**
- Content-Type: `text/csv`
- Filename: `usage_30days.csv`

**CSV Format:**
```csv
Date,Time,Provider,Model,Credits,Cost (USD),Description
2024-01-15,14:30:25,openai,gpt-4,100,0.1000,LLM completion
2024-01-15,14:32:10,anthropic,claude-3-opus,150,0.1500,LLM completion
```

### Notification Endpoints

#### 1. Create Notification (Admin)

```http
POST /api/v1/notifications
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "type": "info",
  "title": "System Maintenance",
  "message": "Scheduled maintenance on Jan 20, 2024 from 2-4 AM UTC",
  "send_email": true,
  "send_webhook": false
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user123",
  "type": "info",
  "title": "System Maintenance",
  "message": "Scheduled maintenance on Jan 20, 2024 from 2-4 AM UTC",
  "data": null,
  "is_read": false,
  "read_at": null,
  "created_at": "2024-01-15T10:30:00"
}
```

#### 2. Get Notifications

```http
GET /api/v1/notifications?is_read=false&limit=50&offset=0
Authorization: Bearer <token>
```

**Parameters:**
- `is_read` - Filter by read status (optional)
- `type` - Filter by type (optional)
- `limit` - Max results (default: 50)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "notifications": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user123",
      "type": "warning",
      "title": "Low Credits",
      "message": "Your credit balance is low (500 credits remaining).",
      "data": {
        "credits_remaining": 500
      },
      "is_read": false,
      "read_at": null,
      "created_at": "2024-01-15T10:30:00"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

#### 3. Get Unread Count

```http
GET /api/v1/notifications/unread-count
Authorization: Bearer <token>
```

**Response:**
```json
{
  "unread_count": 3
}
```

#### 4. Mark as Read

```http
PUT /api/v1/notifications/{notification_id}/read
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Notification marked as read"
}
```

#### 5. Mark All as Read

```http
PUT /api/v1/notifications/read-all
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Marked 5 notifications as read",
  "count": 5
}
```

#### 6. Delete Notification

```http
DELETE /api/v1/notifications/{notification_id}
Authorization: Bearer <token>
```

**Response:**
- Status: 204 No Content

## Database Schema

### Notifications Table

```sql
CREATE TABLE notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSON,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_notifications_user_id (user_id),
    INDEX idx_notifications_type (type),
    INDEX idx_notifications_is_read (is_read),
    INDEX idx_notifications_created_at (created_at),
    INDEX idx_notifications_user_unread (user_id, is_read, created_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Usage Examples

### Frontend Integration

#### Display Usage Chart

```javascript
// Fetch time-series data
const response = await fetch('/api/v1/analytics/time-series?days=30&granularity=day', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const { data } = await response.json();

// Use with Chart.js or similar
const chartData = {
  labels: data.map(d => d.timestamp),
  datasets: [{
    label: 'Daily Cost (USD)',
    data: data.map(d => d.cost_usd),
    borderColor: 'rgb(75, 192, 192)',
    tension: 0.1
  }]
};
```

#### Display Notifications

```javascript
// Fetch unread notifications
const response = await fetch('/api/v1/notifications?is_read=false', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const { notifications } = await response.json();

// Display in UI
notifications.forEach(notif => {
  displayNotification(notif.type, notif.title, notif.message);
});
```

#### Notification Badge

```javascript
// Get unread count for badge
const response = await fetch('/api/v1/notifications/unread-count', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const { unread_count } = await response.json();

// Update badge
document.getElementById('notification-badge').textContent = unread_count;
```

### Backend Integration

#### Send Custom Notification

```python
from app.services.notification_service import NotificationService

async def send_custom_notification(db, user_id: str):
    service = NotificationService(db)
    
    await service.create_notification(
        user_id=user_id,
        type="info",
        title="New Feature Available",
        message="Check out our new model comparison feature!",
        send_email=True,
        send_webhook=False
    )
```

#### Trigger Low Credits Warning

```python
from app.services.notification_service import notify_low_credits

async def check_credits(db, user_id: str, credits: int):
    if credits < 1000:  # Threshold
        await notify_low_credits(db, user_id, credits)
```

## Configuration

### Email Configuration

Set environment variables for email notifications:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@smartspec.pro
SMTP_USE_TLS=true
```

### Webhook Configuration

Webhook URLs are stored in user preferences (future feature).

## Performance Considerations

### Analytics Queries

- **Indexes:** All analytics queries use indexed columns (user_id, created_at, type)
- **Aggregation:** Time-series data is aggregated in-memory for flexibility
- **Caching:** Consider caching summary data for frequently accessed periods

### Notification Delivery

- **Async:** Email and webhook notifications are sent asynchronously
- **Error Handling:** Failures in email/webhook don't affect in-app notifications
- **Rate Limiting:** Consider rate limiting for webhook calls

## Security

### Authorization

- All endpoints require JWT authentication
- Users can only access their own analytics and notifications
- Admin endpoints require admin role (future feature)

### Data Privacy

- Analytics data is user-specific
- No cross-user data leakage
- Notifications are private to each user

## Future Enhancements

### Analytics

- [ ] Cost predictions based on usage trends
- [ ] Budget alerts and spending limits
- [ ] Model performance comparison (latency, quality)
- [ ] Custom date ranges
- [ ] PDF report generation

### Notifications

- [ ] User notification preferences (per-type)
- [ ] Webhook URL configuration in user settings
- [ ] SMS notifications (Twilio integration)
- [ ] Push notifications (mobile app)
- [ ] Notification templates
- [ ] Scheduled notifications

## Testing

### Unit Tests

```bash
# Test analytics service
pytest tests/services/test_analytics_service.py

# Test notification service
pytest tests/services/test_notification_service.py
```

### Integration Tests

```bash
# Test analytics endpoints
pytest tests/api/test_analytics.py

# Test notification endpoints
pytest tests/api/test_notifications.py
```

### Manual Testing

```bash
# Start server
uvicorn app.main:app --reload

# Test analytics
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/analytics/summary?days=30

# Test notifications
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/notifications
```

## Troubleshooting

### No Analytics Data

**Problem:** Analytics endpoints return empty data

**Solution:**
- Ensure LLM requests are being tracked in credit_transactions
- Check that metadata includes provider and model information
- Verify date range includes actual usage

### Email Not Sending

**Problem:** Email notifications not being received

**Solution:**
- Check SMTP configuration in environment variables
- Verify SMTP credentials are correct
- Check spam folder
- Review server logs for SMTP errors

### Webhook Failures

**Problem:** Webhook notifications failing

**Solution:**
- Verify webhook URL is accessible
- Check webhook endpoint accepts POST requests
- Review timeout settings (default: 5 seconds)
- Check webhook endpoint logs

## Support

For issues or questions:
- GitHub Issues: https://github.com/smartspec/smartspec-pro/issues
- Documentation: https://docs.smartspec.pro
- Email: support@smartspec.pro

---

**Last Updated:** January 15, 2024  
**Version:** 1.0.0  
**Status:** Production Ready
