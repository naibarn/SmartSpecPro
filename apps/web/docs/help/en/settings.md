---
slug: settings
title: Settings & Preferences
description: Manage your profile, security, and preferences
icon: Settings
section: features
order: 65
pages: ["/settings", "/settings/personas", "/profile"]
tags: [settings, profile, security, 2fa, preferences, theme, language, api keys, billing, integrations]
---

# Settings & Preferences

## Overview

Settings is your personal control panel for everything that affects how SmartAI Hub behaves for you — from your identity and security to billing, integrations, and AI behavior preferences. Access it from the sidebar or top navigation.

## Profile

- Update your **display name** and **avatar** — shown in shared content and team contexts.
- Change your **email address** — a verification email will be sent before the change takes effect.
- Change your **password** — enter your current password, then set a new one (minimum 8 characters).
- Verified email badge appears once your email address is confirmed.

## Account

- View your account creation date, current plan, and unique user ID.
- **Email verification** — resend the confirmation email if you have not verified yet.
- Account deletion — permanently removes all data; this action is irreversible.

## Security

Two-factor authentication (2FA) significantly reduces the risk of unauthorized access.

- **Enable TOTP 2FA** — scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password).
- **Recovery codes** — save the one-time recovery codes when you first enable 2FA. These let you regain access if you lose your device.
- **Disable 2FA** — requires entering your current TOTP code to confirm.
- **Active sessions** — view and revoke sessions on other devices.

## Preferences

- **Language** — choose English or Thai (ภาษาไทย). The UI, help documentation, and AI default responses adjust accordingly.
- **Theme** — Light, Dark, or System (follows your OS setting).
- **Notification settings** — control email notifications for completed jobs, credit alerts, and system announcements.

## Automation

- **Browser Session defaults** — set your preferred browser resolution and default behavior for approval steps.
- **Auto-save conversations** — toggle whether chat sessions are saved to history automatically.
- **Default skill mode** — choose whether skills auto-detect from messages or require explicit activation.

## API

- **Personal API keys** — create tokens for programmatic access to the SmartAI Hub API.
- Each key has a name, creation date, and last-used timestamp.
- Keys are shown once at creation — copy and store them immediately.
- **Revoke keys** individually or all at once if you suspect a key has been compromised.
- API access requires credits — usage is billed the same way as UI interactions.

## Billing

- **Credit balance** — current available credits and pending usage.
- **Transaction history** — itemized log of credits earned, spent, and purchased.
- **Top-up** — purchase additional credits directly from the billing tab.
- **Budget alerts** — set a low-credit threshold to receive email warnings before you run out.
- **Payment methods** — add or remove credit cards for self-service top-ups.

## Integrations

- **Google Drive** — authorize access to import documents directly into chats and skills.
- **OneDrive / SharePoint** — connect Microsoft storage for the same import capability.
- **Third-party connections** — manage OAuth authorizations granted to external services.
- Revoke any integration at any time; this immediately removes access without deleting your data.

## Personas

The Personas tab is a shortcut to managing your custom AI personalities. See the [AI Personas](./personas.md) guide for full details on creating, editing, and using personas in chat.

## Tips

- Changes to language and theme take effect immediately without a page reload.
- Keep recovery codes in a password manager — there is no way to recover a 2FA-locked account without them.
- API keys created here share your credit pool — scope them carefully if sharing with third-party services.
