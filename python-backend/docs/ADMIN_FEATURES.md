# Admin Features Documentation

**SmartSpec Pro - User Impersonation & System Health Monitoring**

## Overview

The Admin Features provide powerful tools for system administration, user support, and system monitoring. These features are restricted to admin users only and include comprehensive audit trails.

## Features

### 1. User Impersonation

**Secure Admin-to-User Login** for support and troubleshooting purposes.

**Use Cases:**
- Customer support and troubleshooting
- Reproducing user-reported issues
- Verifying user-specific configurations
- Testing user permissions

**Security Features:**
- Admin-only access
- Cannot impersonate other admins
- 2-hour session expiration
- Comprehensive audit trail
- Reason required for every impersonation
- Session tracking and monitoring

**Key Features:**
- Start impersonation session
- Stop impersonation session
- View active sessions
- View impersonation history
- Verify impersonation status

### 2. System Health Dashboard

**Real-Time System Monitoring** for infrastructure and service health.

**Monitored Components:**
- Database connectivity and performance
- Redis connectivity and memory usage
- Disk usage and capacity
- Memory usage
- CPU usage
- LLM provider availability
- Network I/O statistics

**Health Status Levels:**
- `healthy`: All systems operational
- `degraded`: Some issues detected
- `critical`: Critical systems down
- `unknown`: Unable to determine status

**Key Features:**
- Overall system health check
- Individual service health checks
- Detailed system metrics
- LLM provider health checks
- System uptime information
- Public health endpoints for load balancers

## API Endpoints

### User Impersonation Endpoints

#### 1. Start Impersonation

```http
POST /api/v1/admin/impersonate/start
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "target_user_id": "user123",
  "reason": "Customer reported issue with LLM requests, need to investigate"
}
```

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 7200,
  "impersonated_user": {
    "id": "user123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "admin": {
    "id": "admin456",
    "email": "admin@smartspec.pro",
    "name": "Admin User"
  },
  "started_at": "2024-01-15T10:30:00",
  "reason": "Customer reported issue with LLM requests, need to investigate"
}
```

**⚠️ Important:** 
- Save the `access_token` - use it to make requests as the impersonated user
- Session expires after 2 hours
- All actions are logged in audit trail

#### 2. Stop Impersonation

```http
POST /api/v1/admin/impersonate/stop
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "message": "Impersonation session stopped",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 3. Get Active Impersonations

```http
GET /api/v1/admin/impersonate/active
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "active_sessions": [
    {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "admin_id": "admin456",
      "target_user_id": "user123",
      "started_at": "2024-01-15T10:30:00",
      "expires_at": "2024-01-15T12:30:00",
      "reason": "Customer support"
    }
  ],
  "total": 1
}
```

#### 4. Get Impersonation History

```http
GET /api/v1/admin/impersonate/history?days=30&user_id=user123
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "history": [
    {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "admin_id": "admin456",
      "admin_email": "admin@smartspec.pro",
      "target_user_id": "user123",
      "target_user_email": "user@example.com",
      "action": "start",
      "reason": "Customer support",
      "timestamp": "2024-01-15T10:30:00"
    },
    {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "admin_id": "admin456",
      "action": "stop",
      "timestamp": "2024-01-15T11:00:00"
    }
  ],
  "total": 2,
  "period_days": 30
}
```

#### 5. Verify Impersonation

```http
GET /api/v1/admin/impersonate/verify
Authorization: Bearer <token>
```

**Response (Impersonated):**
```json
{
  "is_impersonated": true,
  "impersonator_id": "admin456",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "target_user_id": "user123"
}
```

**Response (Normal):**
```json
{
  "is_impersonated": false
}
```

### System Health Endpoints

#### 1. Get System Health

```http
GET /api/v1/health/system
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00",
  "response_time_ms": 45.2,
  "services": {
    "database": {
      "status": "healthy",
      "response_time_ms": 12.5,
      "pool_size": 10,
      "connections_in_use": 3,
      "message": "Database is operational"
    },
    "redis": {
      "status": "healthy",
      "response_time_ms": 5.3,
      "connected_clients": 2,
      "used_memory_mb": 15.2,
      "uptime_seconds": 86400,
      "message": "Redis is operational"
    },
    "disk": {
      "status": "healthy",
      "total_gb": 100.0,
      "used_gb": 45.2,
      "free_gb": 54.8,
      "percent_used": 45.2,
      "message": "Disk usage normal"
    },
    "memory": {
      "status": "healthy",
      "total_gb": 16.0,
      "used_gb": 8.5,
      "available_gb": 7.5,
      "percent_used": 53.1,
      "message": "Memory usage normal"
    },
    "cpu": {
      "status": "healthy",
      "percent_used": 25.3,
      "cpu_count": 8,
      "message": "CPU usage normal"
    }
  }
}
```

#### 2. Get LLM Providers Health

```http
GET /api/v1/health/llm-providers
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "timestamp": "2024-01-15T10:30:00",
  "providers": {
    "openai": {
      "status": "healthy",
      "response_time_ms": 234.5,
      "status_code": 200,
      "message": "Provider is operational"
    },
    "anthropic": {
      "status": "healthy",
      "response_time_ms": 189.2,
      "status_code": 200,
      "message": "Provider is operational"
    },
    "google": {
      "status": "degraded",
      "response_time_ms": 1250.8,
      "status_code": 200,
      "message": "Provider is operational but slow"
    }
  },
  "total_providers": 3
}
```

#### 3. Get System Metrics

```http
GET /api/v1/health/metrics
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "timestamp": "2024-01-15T10:30:00",
  "system": {
    "cpu": {
      "percent": 25.3,
      "count": 8,
      "per_cpu": [20.1, 25.4, 30.2, 22.8, 28.5, 19.7, 26.3, 24.1]
    },
    "memory": {
      "total_gb": 16.0,
      "used_gb": 8.5,
      "percent": 53.1
    },
    "disk": {
      "total_gb": 100.0,
      "used_gb": 45.2,
      "percent": 45.2
    },
    "network": {
      "bytes_sent": 1234567890,
      "bytes_recv": 9876543210,
      "packets_sent": 1234567,
      "packets_recv": 9876543
    }
  },
  "process": {
    "cpu_percent": 15.2,
    "memory_mb": 256.5,
    "num_threads": 12,
    "num_fds": 45
  }
}
```

#### 4. Get System Uptime

```http
GET /api/v1/health/uptime
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "boot_time": "2024-01-10T08:00:00",
  "uptime_seconds": 432000,
  "uptime_days": 5.0,
  "current_time": "2024-01-15T10:30:00"
}
```

#### 5. Basic Health Check (Public)

```http
GET /api/v1/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00",
  "service": "SmartSpec Pro API"
}
```

#### 6. Readiness Check (Public)

```http
GET /api/v1/health/ready
```

**Response (Ready):**
```json
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00"
}
```

**Response (Not Ready):**
- Status: 503 Service Unavailable

#### 7. Liveness Check (Public)

```http
GET /api/v1/health/live
```

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00"
}
```

## Usage Examples

### Using Impersonation

#### Python Example

```python
import requests

ADMIN_TOKEN = "admin_jwt_token"
BASE_URL = "https://api.smartspec.pro"

# Start impersonation
response = requests.post(
    f"{BASE_URL}/api/v1/admin/impersonate/start",
    headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    json={
        "target_user_id": "user123",
        "reason": "Investigating reported issue with LLM requests"
    }
)

impersonation = response.json()
impersonated_token = impersonation["access_token"]
session_id = impersonation["session_id"]

# Make requests as the impersonated user
user_response = requests.get(
    f"{BASE_URL}/api/v1/credits/balance",
    headers={"Authorization": f"Bearer {impersonated_token}"}
)

print(f"User balance: {user_response.json()}")

# Stop impersonation
requests.post(
    f"{BASE_URL}/api/v1/admin/impersonate/stop",
    headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    json={"session_id": session_id}
)
```

### Monitoring System Health

#### Python Example

```python
import requests

ADMIN_TOKEN = "admin_jwt_token"
BASE_URL = "https://api.smartspec.pro"

# Check system health
response = requests.get(
    f"{BASE_URL}/api/v1/health/system",
    headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
)

health = response.json()

if health["status"] != "healthy":
    print(f"⚠️ System status: {health['status']}")
    
    # Check each service
    for service, status in health["services"].items():
        if status["status"] != "healthy":
            print(f"  - {service}: {status['status']} - {status.get('message', 'No message')}")
else:
    print("✅ All systems healthy")
```

### Prometheus Integration

```python
from prometheus_client import Gauge
import requests

# Define metrics
cpu_usage = Gauge('smartspec_cpu_usage', 'CPU usage percentage')
memory_usage = Gauge('smartspec_memory_usage', 'Memory usage percentage')
disk_usage = Gauge('smartspec_disk_usage', 'Disk usage percentage')

# Fetch metrics
response = requests.get(
    f"{BASE_URL}/api/v1/health/metrics",
    headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
)

metrics = response.json()

# Update Prometheus metrics
cpu_usage.set(metrics["system"]["cpu"]["percent"])
memory_usage.set(metrics["system"]["memory"]["percent"])
disk_usage.set(metrics["system"]["disk"]["percent"])
```

## Security Considerations

### Impersonation Security

1. **Admin Only**: Only users with admin role can impersonate
2. **No Admin Impersonation**: Cannot impersonate other admins
3. **Short Sessions**: 2-hour expiration for security
4. **Audit Trail**: All actions logged
5. **Reason Required**: Must provide reason for impersonation
6. **Session Tracking**: All sessions tracked and monitorable

### Best Practices

1. **Use Sparingly**: Only impersonate when necessary
2. **Document Reason**: Provide clear, detailed reasons
3. **End Sessions**: Always stop impersonation when done
4. **Monitor Usage**: Regularly review impersonation history
5. **Limit Access**: Restrict admin access to trusted personnel

## Monitoring Integration

### Kubernetes Health Checks

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: smartspec-api
spec:
  containers:
  - name: api
    image: smartspec/api:latest
    livenessProbe:
      httpGet:
        path: /api/v1/health/live
        port: 8000
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /api/v1/health/ready
        port: 8000
      initialDelaySeconds: 5
      periodSeconds: 5
```

### Grafana Dashboard

Create dashboards using the metrics endpoint:
- CPU usage over time
- Memory usage trends
- Disk usage alerts
- Database connection pool status
- Redis memory usage
- LLM provider response times

## Troubleshooting

### Impersonation Issues

**Problem:** Cannot start impersonation

**Solutions:**
- Verify admin role
- Check target user exists
- Ensure not trying to impersonate admin
- Check reason is provided

**Problem:** Impersonation token expired

**Solutions:**
- Sessions expire after 2 hours
- Start new impersonation session
- Consider if impersonation is still needed

### Health Check Issues

**Problem:** Database shows as unhealthy

**Solutions:**
- Check database connection
- Verify credentials
- Check network connectivity
- Review database logs

**Problem:** High memory usage

**Solutions:**
- Check for memory leaks
- Review application logs
- Consider scaling up
- Optimize queries

## Support

For issues or questions:
- GitHub Issues: https://github.com/smartspec/smartspec-pro/issues
- Documentation: https://docs.smartspec.pro
- Email: support@smartspec.pro

---

**Last Updated:** January 15, 2024  
**Version:** 1.0.0  
**Status:** Production Ready
