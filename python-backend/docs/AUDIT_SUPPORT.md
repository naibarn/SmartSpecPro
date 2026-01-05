# Audit Logs & Support Ticket System

**SmartSpec Pro - Comprehensive Audit Logging and User Support**

## Overview

The Audit Logs and Support Ticket System provide comprehensive tracking of all system actions and a complete user support workflow.

## Features

### 1. Audit Logs

**Comprehensive Action Tracking** for compliance, debugging, and security.

**What is Logged:**
- User authentication (login, logout, token refresh)
- API requests and responses
- Credit transactions
- Payment operations
- Admin actions
- Impersonation sessions
- Configuration changes
- Resource access

**Log Information:**
- User details (ID, email, role)
- Impersonation tracking
- Action type and resource
- Request details (method, endpoint, status)
- Additional context (JSON)
- IP address and user agent
- Timestamp

**Use Cases:**
- Security auditing
- Compliance reporting
- Debugging user issues
- Tracking admin actions
- Monitoring impersonation
- Performance analysis

### 2. Support Ticket System

**Complete User Support Workflow** from ticket creation to resolution.

**Features:**
- Create support tickets
- Track ticket status
- Add messages and attachments
- Admin assignment
- Priority management
- Category organization
- Search and filter
- Statistics and reporting

**Ticket Categories:**
- Technical issues
- Billing questions
- Feature requests
- Bug reports
- Account issues
- Other inquiries

**Ticket Statuses:**
- Open - New ticket
- In Progress - Being worked on
- Waiting User - Waiting for user response
- Resolved - Issue resolved
- Closed - Ticket closed

**Priorities:**
- Low - Minor issues
- Medium - Standard issues
- High - Important issues
- Urgent - Critical issues

## API Endpoints

### Audit Log Endpoints

#### 1. Get Audit Logs

```http
GET /api/v1/audit-logs?user_id=user123&days=30&limit=100
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "logs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user123",
      "user_email": "user@example.com",
      "user_role": "user",
      "impersonator_id": null,
      "impersonator_email": null,
      "is_impersonated": false,
      "action": "llm.request",
      "resource_type": "llm_request",
      "resource_id": "req123",
      "method": "POST",
      "endpoint": "/api/v1/llm/chat",
      "status_code": "200",
      "details": {
        "provider": "openai",
        "model": "gpt-4",
        "credits_used": 100
      },
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "timestamp": "2024-01-15T10:30:00"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

#### 2. Get User Activity

```http
GET /api/v1/audit-logs/user/{user_id}/activity?days=30
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "user_id": "user123",
  "period_days": 30,
  "total_actions": 245,
  "unique_actions": 12,
  "top_actions": [
    {
      "action": "llm.request",
      "count": 150
    },
    {
      "action": "credits.check",
      "count": 45
    }
  ],
  "first_action": "2024-01-01T08:00:00",
  "last_action": "2024-01-15T10:30:00"
}
```

#### 3. Get Impersonation Logs

```http
GET /api/v1/audit-logs/impersonations?days=30
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "logs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user123",
      "user_email": "user@example.com",
      "impersonator_id": "admin456",
      "impersonator_email": "admin@smartspec.pro",
      "is_impersonated": true,
      "action": "impersonation.start",
      "details": {
        "reason": "Customer support",
        "session_id": "session123"
      },
      "timestamp": "2024-01-15T10:00:00"
    }
  ],
  "total": 1,
  "period_days": 30
}
```

#### 4. Get Action Statistics

```http
GET /api/v1/audit-logs/statistics?days=30
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "period_days": 30,
  "total_actions": 15420,
  "unique_users": 234,
  "actions_by_type": [
    {
      "action": "llm.request",
      "count": 8500
    },
    {
      "action": "user.login",
      "count": 2340
    },
    {
      "action": "credits.check",
      "count": 1890
    }
  ]
}
```

#### 5. Search Audit Logs

```http
GET /api/v1/audit-logs/search?q=payment&limit=100
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "logs": [...],
  "total": 45,
  "search_term": "payment"
}
```

#### 6. Get My Activity

```http
GET /api/v1/audit-logs/my-activity?days=30
Authorization: Bearer <user_token>
```

**Response:**
```json
{
  "user_id": "user123",
  "period_days": 30,
  "total_actions": 245,
  "unique_actions": 12,
  "top_actions": [...]
}
```

### Support Ticket Endpoints

#### 1. Create Ticket

```http
POST /api/v1/support/tickets
Authorization: Bearer <token>
Content-Type: application/json

{
  "subject": "Unable to access LLM API",
  "description": "I'm getting 401 errors when trying to use the LLM API. I've checked my API key and it seems correct.",
  "category": "technical",
  "priority": "high"
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ticket_number": "TICK-20240115-1234",
  "user_id": "user123",
  "subject": "Unable to access LLM API",
  "description": "I'm getting 401 errors...",
  "category": "technical",
  "priority": "high",
  "status": "open",
  "assigned_to": null,
  "created_at": "2024-01-15T10:30:00",
  "updated_at": "2024-01-15T10:30:00",
  "resolved_at": null,
  "closed_at": null
}
```

#### 2. Get My Tickets

```http
GET /api/v1/support/tickets?status=open&limit=50
Authorization: Bearer <token>
```

**Response:**
```json
{
  "tickets": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "ticket_number": "TICK-20240115-1234",
      "subject": "Unable to access LLM API",
      "category": "technical",
      "priority": "high",
      "status": "open",
      "created_at": "2024-01-15T10:30:00"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

#### 3. Get Ticket Details

```http
GET /api/v1/support/tickets/{ticket_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ticket_number": "TICK-20240115-1234",
  "subject": "Unable to access LLM API",
  "description": "I'm getting 401 errors...",
  "category": "technical",
  "priority": "high",
  "status": "in_progress",
  "assigned_to": "admin456",
  "created_at": "2024-01-15T10:30:00",
  "updated_at": "2024-01-15T11:00:00",
  "messages": [
    {
      "id": "msg123",
      "ticket_id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user123",
      "message": "I'm getting 401 errors...",
      "is_staff_response": false,
      "attachments": [],
      "created_at": "2024-01-15T10:30:00"
    },
    {
      "id": "msg124",
      "ticket_id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "admin456",
      "message": "I'll look into this right away...",
      "is_staff_response": true,
      "attachments": [],
      "created_at": "2024-01-15T10:45:00"
    }
  ]
}
```

#### 4. Add Message

```http
POST /api/v1/support/tickets/{ticket_id}/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "I tried regenerating my API key and it's working now. Thanks!",
  "attachments": []
}
```

**Response:**
```json
{
  "id": "msg125",
  "ticket_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user123",
  "message": "I tried regenerating my API key...",
  "is_staff_response": false,
  "attachments": [],
  "created_at": "2024-01-15T11:15:00"
}
```

#### 5. Get Ticket Statistics

```http
GET /api/v1/support/statistics
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total_tickets": 15,
  "by_status": {
    "open": 3,
    "in_progress": 5,
    "waiting_user": 2,
    "resolved": 4,
    "closed": 1
  },
  "by_priority": {
    "low": 2,
    "medium": 8,
    "high": 4,
    "urgent": 1
  },
  "by_category": {
    "technical": 7,
    "billing": 3,
    "feature_request": 2,
    "bug_report": 2,
    "account": 1
  }
}
```

#### 6. Search Tickets

```http
GET /api/v1/support/search?q=API&limit=50
Authorization: Bearer <token>
```

**Response:**
```json
{
  "tickets": [...],
  "total": 5,
  "search_term": "API"
}
```

### Admin Endpoints

#### 1. Get All Tickets (Admin)

```http
GET /api/v1/admin/support/tickets?status=open&priority=high
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "tickets": [...],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

#### 2. Update Ticket (Admin)

```http
PUT /api/v1/admin/support/tickets/{ticket_id}
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "status": "in_progress",
  "priority": "high",
  "assigned_to": "admin456"
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "in_progress",
  "priority": "high",
  "assigned_to": "admin456",
  "updated_at": "2024-01-15T11:00:00"
}
```

#### 3. Add Staff Response (Admin)

```http
POST /api/v1/admin/support/tickets/{ticket_id}/messages
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "message": "I've investigated the issue and found that your API key was expired. I've extended it for you.",
  "attachments": []
}
```

**Response:**
```json
{
  "id": "msg126",
  "ticket_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "admin456",
  "message": "I've investigated the issue...",
  "is_staff_response": true,
  "attachments": [],
  "created_at": "2024-01-15T11:30:00"
}
```

## Database Schema

### Audit Logs Table

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    impersonator_id UUID,
    impersonator_email VARCHAR(255),
    is_impersonated VARCHAR(10) DEFAULT 'false',
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    method VARCHAR(10),
    endpoint VARCHAR(500),
    status_code VARCHAR(10),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

### Support Tickets Tables

```sql
CREATE TABLE support_tickets (
    id UUID PRIMARY KEY,
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    subject VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium' NOT NULL,
    status VARCHAR(20) DEFAULT 'open' NOT NULL,
    assigned_to UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP
);

CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY,
    ticket_id UUID NOT NULL,
    user_id UUID NOT NULL,
    message TEXT NOT NULL,
    is_staff_response VARCHAR(10) DEFAULT 'false',
    attachments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

## Usage Examples

### Logging Actions

```python
from app.services.audit_service import AuditService

# Log a user action
await audit_service.log_action(
    action="llm.request",
    user_id=user_id,
    user_email=user_email,
    user_role=user_role,
    resource_type="llm_request",
    resource_id=request_id,
    method="POST",
    endpoint="/api/v1/llm/chat",
    status_code=200,
    details={
        "provider": "openai",
        "model": "gpt-4",
        "credits_used": 100
    },
    ip_address=request.client.host,
    user_agent=request.headers.get("user-agent")
)
```

### Creating Support Tickets

```python
from app.services.ticket_service import TicketService

# Create a ticket
ticket = await ticket_service.create_ticket(
    user_id=user_id,
    subject="Unable to access LLM API",
    description="I'm getting 401 errors...",
    category="technical",
    priority="high"
)

# Add a message
message = await ticket_service.add_message(
    ticket_id=ticket.id,
    user_id=user_id,
    message="I tried regenerating my API key...",
    is_staff_response=False
)
```

## Best Practices

### Audit Logging

1. **Log Everything Important**: Authentication, payments, admin actions
2. **Include Context**: IP address, user agent, request details
3. **Track Impersonation**: Always log impersonation sessions
4. **Regular Review**: Review logs regularly for security
5. **Retention Policy**: Define log retention period

### Support Tickets

1. **Quick Response**: Respond to tickets within 24 hours
2. **Clear Communication**: Use clear, helpful language
3. **Priority Management**: Triage tickets by priority
4. **Status Updates**: Keep users informed of progress
5. **Knowledge Base**: Document common issues

## Troubleshooting

### Audit Log Issues

**Problem:** Logs not being created

**Solutions:**
- Check database connection
- Verify audit_service is called
- Check for exceptions in logs

### Support Ticket Issues

**Problem:** Ticket number not generated

**Solutions:**
- Check database trigger exists
- Verify ticket_number field is empty
- Check database logs

## Support

For issues or questions:
- GitHub Issues: https://github.com/smartspec/smartspec-pro/issues
- Documentation: https://docs.smartspec.pro
- Email: support@smartspec.pro

---

**Last Updated:** January 15, 2024  
**Version:** 1.0.0  
**Status:** Production Ready
