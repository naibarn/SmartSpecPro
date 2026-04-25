---
slug: admin-tenants
title: Tenant Management
description: White-label multi-tenant administration
icon: Building2
section: admin
order: 86
pages: ["/admin/tenants"]
tags:
  - "admin"
  - "tenants"
  - "white-label"
  - "branding"
  - "domain"
  - "feature-flags"
  - "multi-tenant"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-tenants"
aliases:
  - "admin-tenants"
  - "Tenant Management"
  - "Tenant Management help"
---

# Tenant Management

## Overview

Tenant Management allows system administrators to create, configure, and manage white-label tenants. Each tenant can have its own domain, branding, feature set, and user base.

## Creating a tenant

1. Click **New Tenant**.
2. Fill in the tenant details:
   - **Name** — display name for the tenant organization.
   - **Slug** — URL-safe identifier (auto-generated from name).
   - **Domain** — custom domain for tenant access (e.g., `app.clientname.com`).
3. Click **Create**.

## Branding

Customize the tenant's visual identity:

- **Logo** — upload a primary logo (displayed in the header).
- **Favicon** — browser tab icon.
- **Primary color** — accent color for buttons and highlights.
- **Login page** — custom welcome text and background.

Upload assets by clicking the upload area or dragging files.

## Feature flags

Enable or disable platform features per tenant:

| Flag | Description |
|------|-------------|
| Agency Swarm | Enable AI agency marketplace |
| Automation Copilot | Enable browser automation |
| Channel Router | Enable multi-channel routing |
| Webhook Triggers | Enable webhook-based automations |

Toggle switches control each feature. Changes take effect immediately.

## Domain configuration

- **Primary domain** — the main access URL for the tenant.
- **SSL** — managed automatically via Nginx reverse proxy.
- **DNS** — tenant must point their domain's CNAME to the platform.

## Managing users

View the user count per tenant. Click **Manage Users** to navigate to the tenant's user administration page.

## Deleting a tenant

Click **Delete** to permanently remove a tenant and all its data. This requires confirmation and cannot be undone.

<!-- knowledge-graph:related:start -->
## Related Help

- [[admin-advanced|Advanced Administration]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[admin-agencies|Agency Management]]
- [[admin-alert-rules|Alert Rules & Escalation]]
- [[admin-approvals|Approvals]]
- [[admin-audit|Audit Logs]]
<!-- knowledge-graph:related:end -->
