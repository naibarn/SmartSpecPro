---
slug: profile
title: Profile & Account
description: Manage your profile, security, and account preferences
icon: User
section: features
order: 49
pages: ["/profile"]
tags:
  - "profile"
  - "account"
  - "security"
  - "2fa"
  - "password"
  - "theme"
  - "language"
  - "api-key"
  - "avatar"
  - "help"
  - "help/en"
  - "help/account"
aliases:
  - "profile"
  - "Profile & Account"
  - "Profile & Account help"
---

# Profile & Account

## Overview

The Profile page lets you manage your personal information, security settings, notification preferences, and API keys. Access it by clicking your avatar in the sidebar or navigating to **Profile**.

## Profile information

- **Display name** — shown in chat messages and comments.
- **Email** — your login email (changes require verification).
- **Company** — optional organization name.
- **Avatar** — upload a profile picture (JPG, PNG, WebP; max 2 MB).

Click **Save Changes** after making updates.

## Security

### Password
Change your password by entering your current password and choosing a new one. Passwords must be at least 8 characters.

### Two-Factor Authentication (2FA)
1. Click **Enable 2FA** in the Security tab.
2. Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.).
3. Enter the 6-digit code to verify.
4. Save your **recovery codes** in a safe place — they are shown only once.

To disable 2FA, enter your current password and a valid authenticator code.

## Notifications

Configure which notifications you receive:

- **Email** — digest of important updates.
- **Bell icon** — in-app notification dropdown.
- **Telegram** — real-time push notifications (requires linking your Telegram account).

## Preferences

- **Theme** — light, dark, or system default.
- **Language** — English or Thai (affects UI labels, not AI output).

## API keys

Generate personal API keys for programmatic access:

1. Go to the **API Keys** tab.
2. Click **Generate New Key**.
3. Copy the key immediately — it is only shown once.
4. Use the key in the `Authorization: Bearer <key>` header.

Revoke keys by clicking the trash icon next to them.

## Account deletion

At the bottom of the Account tab, click **Delete Account** to permanently remove your account and all associated data. This action cannot be undone.

<!-- knowledge-graph:related:start -->
## Related Help

- [[settings|Settings & Preferences]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[api-keys|API Keys]]
- [[credits|Credits System]]
- [[notification-settings|Notification Preferences]]
- [[usage-analytics|Usage Analytics & Task Monitor]]
<!-- knowledge-graph:related:end -->
