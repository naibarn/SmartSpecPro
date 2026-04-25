---
slug: webhooks
title: Webhooks & Integrations
description: Set up webhooks to connect SmartAI Hub with external services
icon: Webhook
section: advanced
order: 76
pages: ["/webhook-triggers"]
tags:
  - "webhooks"
  - "integrations"
  - "triggers"
  - "api"
  - "external"
  - "automation"
  - "events"
  - "help"
  - "help/en"
  - "help/automation"
aliases:
  - "webhooks"
  - "Webhooks & Integrations"
  - "Webhooks & Integrations help"
---

# Webhooks & Integrations

## What are webhooks?

Webhooks are HTTP callbacks that SmartAI Hub sends to a URL of your choice when specific events occur on the platform. They let you connect SmartAI Hub to external services — Slack, Zapier, your own backend, a CRM — without polling the platform for updates.

When an event fires, SmartAI Hub sends a POST request with a JSON payload to your endpoint. Your service receives it and reacts however you need.

## Setting up a webhook

1. Go to **/webhook-triggers** (or **Settings → Webhooks**).
2. Click **Add Webhook**.
3. Enter the **Endpoint URL** — the HTTPS URL that will receive the events.
4. Choose the **events** you want to subscribe to (see list below).
5. Enter a **secret** — a string used to sign the payload so your server can verify it came from SmartAI Hub.
6. Click **Save** to activate the webhook.

## Available trigger events

| Event | When it fires |
|---|---|
| `message.created` | A new chat message is created in any conversation |
| `media.completed` | A media generation task (image, video, audio) finishes successfully |
| `media.failed` | A media generation task fails |
| `agency.finished` | An agency run completes and the preview is ready |
| `presentation.exported` | A presentation is exported to PDF or video |
| `user.created` | A new user registers on the platform |
| `credits.low` | A user's credit balance drops below the configured threshold |

## Webhook payload format

Every webhook request includes a JSON body:

```json
{
  "event": "media.completed",
  "timestamp": "2026-03-18T10:30:00Z",
  "webhookId": "wh_abc123",
  "data": {
    "taskId": "task_xyz789",
    "userId": "usr_456",
    "mediaType": "image",
    "outputUrl": "https://..."
  }
}
```

The `data` object shape varies by event type.

## Testing webhooks

Use the **Send Test** button next to any active webhook to send a sample payload immediately. This is useful for:

- Verifying your endpoint URL is reachable.
- Checking that your server correctly parses the payload.
- Confirming signature verification is working.

The test fires a synthetic event of each subscribed type.

## Managing webhooks

From the Webhook list you can:

- **Edit** — update the URL, secret, or subscribed events.
- **Disable / Enable** — pause delivery without deleting the webhook.
- **View delivery log** — see recent delivery attempts, response codes, and response times.
- **Delete** — permanently remove the webhook.

## Security — webhook secrets

SmartAI Hub signs every webhook request using HMAC-SHA256 with your secret. The signature is included in the `X-SmartAI-Signature` request header.

To verify a request on your server:

1. Compute `HMAC-SHA256(secret, raw_request_body)`.
2. Compare it to the value in `X-SmartAI-Signature`.
3. Reject the request if they do not match.

**Never skip signature verification** — without it, anyone who discovers your endpoint URL can send fake events.

## Retry policy

If your endpoint returns a non-2xx HTTP status or does not respond within 10 seconds, SmartAI Hub automatically retries:

- Retry 1: after 1 minute
- Retry 2: after 5 minutes
- Retry 3: after 30 minutes

After 3 failed retries, the delivery is marked as failed in the delivery log. The webhook itself remains active for future events.

## Use cases

- **Slack notifications** — post a message to a Slack channel when an agency run or media export finishes.
- **CRM updates** — update a contact record when a user sends a specific message type.
- **Pipeline triggers** — kick off a CI/CD pipeline or data processing job when a presentation is exported.
- **Credit alerts** — send an email or SMS when a user's balance is low.

<!-- knowledge-graph:related:start -->
## Related Help

- [[workflows|Workflows & Automation]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[automation|Process Automation]]
- [[factory|SaaS Factory]]
- [[work-os|Work OS Guide]]
- [[workflow-editor|Workflow Editor]]
<!-- knowledge-graph:related:end -->
