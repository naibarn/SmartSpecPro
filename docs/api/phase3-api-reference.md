# SmartSpec Pro - Phase 3 API Reference

## Overview

This document describes the API endpoints introduced in Phase 3 (SaaS Readiness) of SmartSpec Pro, including Multi-tenancy, RBAC, and Approval Gates.

**Base URL:** `https://api.smartspec.pro` (Production) or `http://localhost:8000` (Development)

**Authentication:** All endpoints require Bearer token authentication unless otherwise noted.

```
Authorization: Bearer <access_token>
```

---

## Table of Contents

1. [Multi-tenancy API](#multi-tenancy-api)
2. [RBAC API](#rbac-api)
3. [Approvals API](#approvals-api)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)

---

## Multi-tenancy API

### Tenant Management

#### Get Current Tenant

```http
GET /api/v1/tenants/current
```

Returns the tenant associated with the current user.

**Response:**
```json
{
  "id": "tenant_abc123",
  "name": "acme-corp",
  "slug": "acme-corp",
  "display_name": "Acme Corporation",
  "plan": "professional",
  "status": "active",
  "settings": {
    "isolation_level": "row",
    "features": ["multi-user", "api-access", "custom-models"]
  },
  "usage": {
    "users_count": 15,
    "projects_count": 42,
    "storage_used_gb": 25.5,
    "api_calls_this_month": 45000
  },
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### List Tenants (Admin)

```http
GET /api/v1/tenants
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `active`, `suspended`, `pending` |
| `plan` | string | Filter by plan: `free`, `starter`, `professional`, `enterprise` |
| `page` | integer | Page number (default: 1) |
| `page_size` | integer | Items per page (default: 20, max: 100) |

#### Create Tenant

```http
POST /api/v1/tenants
```

**Request Body:**
```json
{
  "name": "new-company",
  "display_name": "New Company Inc.",
  "plan": "starter",
  "settings": {
    "isolation_level": "row"
  }
}
```

#### Update Tenant

```http
PATCH /api/v1/tenants/{tenant_id}
```

**Request Body:**
```json
{
  "display_name": "Updated Company Name",
  "settings": {
    "features": ["multi-user", "api-access"]
  }
}
```

#### Get Tenant Usage

```http
GET /api/v1/tenants/{tenant_id}/usage
```

**Response:**
```json
{
  "users_count": 15,
  "projects_count": 42,
  "storage_used_gb": 25.5,
  "api_calls_this_month": 45000,
  "limits": {
    "max_users": 100,
    "max_projects": 500,
    "max_storage_gb": 1000,
    "max_api_calls_per_month": 1000000
  }
}
```

#### Invite User to Tenant

```http
POST /api/v1/tenants/{tenant_id}/invitations
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "role_id": "role_developer"
}
```

---

## RBAC API

### Role Management

#### List Roles

```http
GET /api/v1/rbac/roles
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `include_system` | boolean | Include system roles (default: true) |

**Response:**
```json
[
  {
    "id": "role_owner",
    "name": "owner",
    "display_name": "Owner",
    "description": "Full access to all resources",
    "scope": "tenant",
    "permissions": ["*:*"],
    "is_system": true,
    "is_default": false,
    "priority": 100
  },
  {
    "id": "role_developer",
    "name": "developer",
    "display_name": "Developer",
    "description": "Can create and edit projects",
    "scope": "tenant",
    "permissions": ["projects:read", "projects:write", "executions:*"],
    "is_system": true,
    "is_default": true,
    "priority": 50
  }
]
```

#### Create Custom Role

```http
POST /api/v1/rbac/roles
```

**Request Body:**
```json
{
  "name": "qa-engineer",
  "display_name": "QA Engineer",
  "description": "Can view and test projects",
  "permissions": ["projects:read", "executions:read", "tests:*"]
}
```

#### Update Role

```http
PATCH /api/v1/rbac/roles/{role_id}
```

**Request Body:**
```json
{
  "display_name": "Updated Role Name",
  "permissions": ["projects:read", "projects:write"]
}
```

#### Delete Role

```http
DELETE /api/v1/rbac/roles/{role_id}
```

> **Note:** System roles cannot be deleted.

### Role Assignments

#### Assign Role to User

```http
POST /api/v1/rbac/assignments
```

**Request Body:**
```json
{
  "user_id": "user_abc123",
  "role_id": "role_developer",
  "project_id": "proj_xyz789",
  "reason": "New team member",
  "expires_at": "2025-12-31T23:59:59Z"
}
```

#### List Role Assignments

```http
GET /api/v1/rbac/assignments
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `user_id` | string | Filter by user |
| `role_id` | string | Filter by role |
| `project_id` | string | Filter by project |

#### Revoke Role Assignment

```http
DELETE /api/v1/rbac/assignments/{assignment_id}
```

### Permission Checking

#### Check Permission

```http
POST /api/v1/rbac/check
```

**Request Body:**
```json
{
  "permission": "projects:write",
  "resource_id": "proj_xyz789"
}
```

**Response:**
```json
{
  "allowed": true,
  "permission": "projects:write",
  "reason": "User has developer role with projects:write permission"
}
```

#### Get My Roles

```http
GET /api/v1/rbac/me/roles
```

#### Get My Permissions

```http
GET /api/v1/rbac/me/permissions
```

**Response:**
```json
[
  "projects:read",
  "projects:write",
  "executions:read",
  "executions:write",
  "executions:delete"
]
```

---

## Approvals API

### Approval Requests

#### Create Approval Request

```http
POST /api/v1/approvals/requests
```

**Request Body:**
```json
{
  "request_type": "deployment",
  "title": "Deploy v2.0 to Production",
  "description": "Release new features to production environment",
  "project_id": "proj_xyz789",
  "payload": {
    "version": "2.0.0",
    "environment": "production",
    "changes": ["Feature A", "Bug fix B"]
  },
  "risk_level": "high",
  "required_approvers": 2,
  "timeout_minutes": 120
}
```

**Response:**
```json
{
  "id": "approval_abc123",
  "request_type": "deployment",
  "title": "Deploy v2.0 to Production",
  "status": "pending",
  "risk_level": "high",
  "required_approvers": 2,
  "current_approvals": 0,
  "expires_at": "2024-01-15T14:30:00Z",
  "created_at": "2024-01-15T12:30:00Z"
}
```

#### List Approval Requests

```http
GET /api/v1/approvals/requests
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status_filter` | string | Filter by status: `pending`, `approved`, `rejected`, `expired`, `cancelled` |
| `request_type` | string | Filter by request type |
| `project_id` | string | Filter by project |
| `page` | integer | Page number (default: 1) |
| `page_size` | integer | Items per page (default: 20) |

#### List Pending Approvals (for current user)

```http
GET /api/v1/approvals/requests/pending
```

Returns approval requests that the current user can approve.

#### Get Approval Request

```http
GET /api/v1/approvals/requests/{request_id}
```

#### Respond to Approval Request

```http
POST /api/v1/approvals/requests/{request_id}/respond
```

**Request Body:**
```json
{
  "decision": "approve",
  "comment": "Looks good, approved for deployment"
}
```

**Response:**
```json
{
  "id": "approval_abc123",
  "status": "approved",
  "current_approvals": 2,
  "resolved_at": "2024-01-15T13:00:00Z"
}
```

#### Cancel Approval Request

```http
POST /api/v1/approvals/requests/{request_id}/cancel
```

> **Note:** Only the requester can cancel a pending request.

#### List Approval Responses

```http
GET /api/v1/approvals/requests/{request_id}/responses
```

**Response:**
```json
[
  {
    "id": "response_001",
    "approver_id": "user_manager1",
    "decision": "approve",
    "comment": "Approved",
    "created_at": "2024-01-15T12:45:00Z"
  },
  {
    "id": "response_002",
    "approver_id": "user_manager2",
    "decision": "approve",
    "comment": "LGTM",
    "created_at": "2024-01-15T13:00:00Z"
  }
]
```

### Approval Rules

#### Create Approval Rule

```http
POST /api/v1/approvals/rules
```

**Request Body:**
```json
{
  "name": "Production Deployment Rule",
  "description": "Require approval for production deployments",
  "trigger_type": "deployment",
  "conditions": {
    "environment": "production"
  },
  "approver_roles": ["admin", "tech-lead"],
  "approver_users": [],
  "required_approvals": 2,
  "timeout_minutes": 120,
  "timeout_action": "reject"
}
```

#### List Approval Rules

```http
GET /api/v1/approvals/rules
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | string | Filter by project |
| `trigger_type` | string | Filter by trigger type |
| `is_active` | boolean | Filter by active status |

#### Update Approval Rule

```http
PATCH /api/v1/approvals/rules/{rule_id}
```

#### Delete Approval Rule

```http
DELETE /api/v1/approvals/rules/{rule_id}
```

#### Toggle Approval Rule

```http
POST /api/v1/approvals/rules/{rule_id}/toggle?is_active=true
```

---

## Error Handling

All API errors follow a consistent format:

```json
{
  "detail": "Error message describing what went wrong",
  "error_code": "SPECIFIC_ERROR_CODE",
  "timestamp": "2024-01-15T12:30:00Z"
}
```

### Common Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `BAD_REQUEST` | Invalid request parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource already exists |
| 422 | `VALIDATION_ERROR` | Request validation failed |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Rate Limiting

API requests are rate limited per tenant:

| Plan | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Free | 60 | 1,000 |
| Starter | 300 | 10,000 |
| Professional | 1,000 | 100,000 |
| Enterprise | Custom | Custom |

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1705323600
```

---

## Changelog

### v3.0.0 (2024-01-15)
- Added Multi-tenancy API
- Added RBAC API
- Added Approvals API
- Added rate limiting per tenant

### v2.0.0 (2024-01-01)
- Added OpenCode Gateway API
- Added Quality Gates
- Added Hybrid RAG

### v1.0.0 (2023-12-01)
- Initial release
