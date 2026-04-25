---
slug: api-keys
title: API Keys
description: Manage API access keys for programmatic use
icon: Key
section: advanced
order: 78
pages: ["/settings", "/admin/api-keys"]
tags:
  - "api"
  - "keys"
  - "token"
  - "access"
  - "programmatic"
  - "integration"
  - "developer"
  - "openapi"
  - "help"
  - "help/en"
  - "help/account"
  - "account"
  - "api-keys"
aliases:
  - "api-keys"
  - "API Keys"
  - "API Keys help"
---

# API Keys

## What are API keys?

API keys are authentication tokens that allow you to access SmartAI Hub programmatically — from your own scripts, integrations, or third-party tools. Instead of logging in through the browser, you authenticate each request with a key.

## User API keys

Manage your personal API keys at **Settings → API**.

### Generating a new key

1. Go to **Settings → API**.
2. Click **Generate New Key**.
3. Enter a descriptive name (e.g., "My automation script", "Zapier integration").
4. Optionally set an expiration date. Keys without an expiration remain active until revoked.
5. Click **Generate**.
6. **Copy the key immediately** — it is shown only once and cannot be retrieved again. Store it in a secure location such as a password manager or environment variable.

### Revoking a key

- Find the key in your key list at **Settings → API**.
- Click **Revoke** next to the key you want to deactivate.
- The key stops working immediately. Any service using it will receive `401 Unauthorized` responses.

### Rate limits

Each key is subject to rate limits to prevent abuse. The default limits are shown on the API settings page. Contact your admin if you need higher limits for automated workflows.

## Admin API key management

Admins can manage all user keys at **/admin/api-keys**:

- View all active keys across all users
- See usage statistics per key (request count, last used date)
- Set global rate limits that apply to all keys
- Revoke any key immediately if needed
- Monitor for unusual usage patterns

## Using the API

### Base URL

```
https://smartaihub.app/v1/
```

### Authentication

Include your API key in the `Authorization` header of every request:

```
Authorization: Bearer <your-api-key>
```

### API documentation

Interactive API documentation (Swagger UI) is available at:

```
https://smartaihub.app/v1/docs
```

### Available endpoints

| Endpoint group | Description |
|---|---|
| `/v1/skills` | Execute skills and retrieve skill definitions |
| `/v1/agencies` | Run agencies and retrieve results |
| `/v1/presentations` | Create and manage presentations |
| `/v1/media` | Generate images and video |
| `/v1/chat` | Send messages and retrieve conversation history |

### Example request

```bash
curl https://smartaihub.app/v1/chat \
  -H "Authorization: Bearer sk-your-key-here" \
  -H "Content-Type: application/json" \
  -d '{"message": "Summarize this paragraph in three bullet points."}'
```

## Credit consumption

API calls consume credits at the same rate as equivalent actions in the UI. The credit cost for each request is returned in the `X-Credits-Used` response header so you can monitor consumption in your integration.

## Best practices

- **Never hardcode keys in source code** — use environment variables or a secrets manager instead.
- **Set expiration dates** — rotating keys on a schedule limits the damage if a key is ever exposed.
- **Use one key per integration** — separate keys make it easy to revoke access for a single integration without affecting others.
- **Monitor usage regularly** — check the key usage stats at **Settings → API** to spot unexpected spikes.
- **Don't share keys** — each person or service should have its own key so access can be revoked individually.
- **Prefer short-lived keys** — for one-off scripts, generate a key with a 24-hour expiration rather than using a long-lived key.

<!-- knowledge-graph:related:start -->
## Related Help

- [[settings|Settings & Preferences]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[credits|Credits System]]
- [[notification-settings|Notification Preferences]]
- [[profile|Profile & Account]]
- [[usage-analytics|Usage Analytics & Task Monitor]]
<!-- knowledge-graph:related:end -->
