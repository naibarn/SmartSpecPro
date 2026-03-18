---
slug: admin-settings
title: System Settings
description: Configure system-wide settings
icon: Settings
section: admin
order: 100
pages: ["/admin/settings"]
tags: [admin, settings, configuration, system]
---

# System Settings

## Overview

System Settings allow administrators to configure platform-wide behavior including email, integrations, branding, and default user experience options.

## Settings categories

### General
- Platform name and branding.
- Default language for new users.
- Support contact email.

### Email
- SMTP server configuration for transactional email (password reset, notifications).
- Test email delivery from the settings page.
- SMTP credentials are stored encrypted.

### Credits and billing
- Default credit allocation for new users.
- Enable or disable self-service credit top-up.
- Configure credit alert thresholds.

### Security
- Session timeout duration.
- Allowed authentication methods (password, SSO).
- Password complexity requirements.

### Feature flags
- Enable or disable features platform-wide (Browser Session, Agencies, Video Editor).
- Control which features are available to specific user roles.

### Integrations
- Configure webhook endpoints for event notifications.
- API key management for external integrations.
- Storage provider configuration (S3/R2 for media files).

## Applying changes

Most settings take effect immediately. Some settings (SMTP, storage) require a service restart — the UI indicates when this is needed.

## Packages & Pricing

Manage the credit packages available to users for self-service top-up:

- Navigate to **Admin → Packages** to view and manage all packages.
- **Create a package** — set a name, credit amount, price (in your currency), and an optional description shown to users on the pricing page.
- **Featured packages** — mark one or more packages as featured; they appear prominently at the top of the pricing page.
- **Free trial credits** — configure how many credits new users receive automatically when they register. Set to 0 to disable the free trial.
- **Edit or archive** — update any package at any time, or archive it to hide it from new purchases without affecting users who already have credits.

## Service Status

Monitor the health of every platform service from one place:

- Navigate to **Admin → Services** to view the current status of all backend components.
- **Monitored services**: PostgreSQL database, Redis cache, Celery workers, LLM providers, media providers, and S3/R2 storage.
- **Status indicators**: green (healthy), yellow (degraded — some metrics above threshold), red (critical — service down or severely degraded).
- Click any service for a detailed panel showing recent metrics, connection counts, error rates, and the last 20 error log entries.
- Some services support a **Restart** action directly from this page — use this only when the service is non-responsive and you have confirmed no active jobs will be lost.

## Audit log

All admin setting changes are recorded in the audit log with timestamp, admin user, and before/after values. Access the audit log from **Admin → Audit**.
