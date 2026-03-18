---
slug: admin-channel-router
title: Channel Router
description: Configure message routing between external channels and AI agents
icon: GitFork
section: admin
order: 62
pages: ["/admin/channel-router"]
tags: [channel, router, telegram, slack, line, whatsapp, discord, routing]
---

# Channel Router

## Overview

The Channel Router connects external messaging platforms to your AI agents. When a message arrives on a configured channel (for example, a Telegram bot or a Slack workspace), the router evaluates your rules and forwards the message to the appropriate agent or skill. The agent's reply is sent back to the originating channel automatically.

This lets users interact with your AI assistants through the tools they already use, without opening the web app.

## Supported Channels

| Channel | Protocol | Notes |
|---------|----------|-------|
| **Telegram** | Bot API (webhook) | Supports text, photos, and documents |
| **Slack** | Events API | Requires Slack App with bot token |
| **LINE** | Messaging API | Webhook-based |
| **WhatsApp** | Cloud API (Meta) | Requires verified WhatsApp Business Account |
| **Discord** | Gateway API | Bot token with message intent |

## Creating a Route

1. Click **New Route**.
2. Select the **source channel** (e.g., Telegram).
3. Enter the channel credentials (bot token, webhook secret, etc.).
4. Select the **target** — either an agent persona or a skill.
5. Configure optional **filters** (see below).
6. Click **Save and Activate**.

The platform automatically registers the webhook with the external channel on save.

> **Tip:** You can create multiple routes for the same channel. The router evaluates rules top-to-bottom and uses the first matching route.

## Filters

Filters let you route different messages to different agents on the same channel.

### Keyword Matching

Add one or more keywords or phrases. The route only fires if the incoming message contains at least one of them.

Examples:
- Route messages containing `support` to a helpdesk persona.
- Route messages containing `order` or `invoice` to a billing assistant.

Keyword matching is case-insensitive.

### User Filtering

Restrict a route to specific users by entering their channel-specific user IDs (Telegram user ID, Slack member ID, etc.). Leave empty to allow all users.

## Fallback Behavior

When an incoming message matches no route:

| Setting | Behavior |
|---------|---------|
| **Ignore** | Message is silently dropped. No reply is sent. |
| **Default reply** | Sends a configured static text response (e.g., "I'm not sure how to help with that."). |
| **Default agent** | Forwards to a designated fallback agent persona. |

Configure fallback behavior per channel in the channel's settings panel.

## Testing a Route

Before going live, verify your route works:

1. Open the route and click **Send Test Message**.
2. Enter a sample message (e.g., `Hello, can you help me?`).
3. Click **Send**.

The test runner shows:
- Which route was matched (and why).
- The payload forwarded to the agent.
- The agent's reply.
- Whether the reply was successfully sent back to the channel.

> **Note:** Test messages do not reach the external channel. They are processed internally and the result is shown in the test panel only.

## Monitoring

The **Activity Log** tab on each route shows the last 100 messages processed, with:
- Timestamp and channel user ID (masked for privacy).
- Which route was matched.
- Agent or skill that handled it.
- Response status and latency.

Use this log to debug unexpected routing or identify high-volume users.
