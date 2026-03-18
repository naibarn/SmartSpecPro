---
slug: feedback
title: Feedback & Bug Reports
description: How to submit feedback, attach files, and track your reports
icon: MessageSquarePlus
section: features
order: 48
pages: ["/chat", "/my-feedback", "/admin/feedback-hub"]
tags: [feedback, bug, report, attachment, upload, file, screenshot, feature-request]
---

# Feedback & Bug Reports

## Overview

The feedback system lets you report bugs, request features, share observations, or ask questions directly from any page. Your submissions are triaged automatically by AI and forwarded to the admin team with full context.

## How to submit feedback

1. **Click the Feedback button** in the bottom-right corner of any page (the purple button with a speech-bubble icon).
2. **Choose a type**:
   - **Bug Report** — something is broken or not working correctly.
   - **Feature Request** — suggest a new capability or improvement.
   - **Observation** — share something you noticed (good or bad).
   - **Question** — ask a question about a feature or workflow.
3. **Enter a title** that summarizes the issue in a few words.
4. **Add a description** with as much detail as possible — steps to reproduce, expected behavior, and what actually happened.
5. Click **Submit Feedback**.

## Attaching files

You can attach up to **5 files** per ticket to help explain the issue. Supported file types:

| Type | Extensions | Use case |
|------|-----------|----------|
| Images | `.jpg`, `.jpeg`, `.png`, `.webp` | Screenshots, error visuals |
| Documents | `.pdf` | Specifications, reference docs |
| Markdown | `.md` | Detailed reproduction steps |

**Size limit**: 5 MB per file.

### How to attach

- **Drag and drop** files directly onto the attachment area in the feedback dialog.
- **Click the attachment area** to open a file picker.
- Files appear as a list below the drop zone showing name, size, and a remove button.
- You can remove a file before submitting by clicking the **X** next to it.

### If upload fails

If the ticket is created but file upload fails (e.g., network issue), the dialog stays open with a **Retry Upload** button. You can:
- Click **Retry Upload** to try again.
- Click **Skip** to submit without attachments.

Your ticket is already saved — retrying only re-attempts the file upload.

## Tracking your feedback

### My Feedback page

Navigate to **My Feedback** (via the link at the bottom of the feedback dialog, or from the menu) to see all tickets you have submitted.

- **Ticket list** on the left shows status badges: New, Triaged, In Progress, Resolved, Closed.
- **Ticket detail** on the right shows your description, attachments (with thumbnail previews for images), and any replies from the support team.
- **Deep link**: share a link to a specific ticket using `?ticketId=123`.

### Notifications

You receive notifications when:
- An admin **replies** to your ticket (non-internal comments only).
- Your ticket status changes to **In Progress**, **Resolved**, or **Closed**.

Click the notification in the bell dropdown to navigate directly to the relevant page.

## What happens after you submit

1. **Auto-triage** — the system classifies your ticket by category (bug, performance, feature request, question) and priority (high, normal, low) using keyword analysis.
2. **Duplicate detection** — if a similar open ticket already exists, yours may be marked as a duplicate.
3. **Incident correlation** — if your report matches an active system incident, it is linked automatically.
4. **Admin notification** — all admins receive a notification with a direct link to your ticket.

## Tips for effective feedback

- **Include screenshots** — a picture is worth a thousand words. Attach a screenshot of the error or unexpected behavior.
- **Be specific** — "the chat doesn't work" is harder to act on than "clicking Send in chat returns a 500 error when the model is set to GPT-4".
- **One issue per ticket** — if you have multiple bugs, submit separate tickets so each can be tracked independently.
- **Check existing tickets** — before submitting, browse your My Feedback page to see if you already reported the same issue.
