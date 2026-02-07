# Interview Transcript — Telegram Alert Notifications

## Q1: Verification Flow

**Question:** The spec says send-only (no webhook). But for verification, the bot needs to RECEIVE /start commands from users. Should we: (A) add a lightweight webhook/polling endpoint just for verification, (B) use a completely code-based flow where user copies a code from Telegram bot info and pastes it in the web app, or (C) use Telegram Login Widget on the web page?

**Answer:** Webhook for /start only — Add a minimal webhook endpoint (Python FastAPI) that only handles /start verification commands.

## Q2: Backend for Notification Delivery

**Question:** Should the notification delivery live primarily in the Node.js side (BullMQ queue, hook into existing notification creation) or Python/Celery side?

**Answer:** Node.js (BullMQ) — Hook directly into scheduler.ts notification creation, new BullMQ queue for Telegram. Simpler, single codebase.

## Q3: Expected Scale

**Question:** What scale should we design for? How many users might link Telegram, and what's the expected notification volume?

**Answer:** Small (< 100 users) — Simple implementation, basic rate limiting sufficient.

## Q4: Webhook Host

**Question:** For the webhook endpoint receiving /start from Telegram: should it live on the Python FastAPI side or add a new Express route on the Node.js side?

**Answer:** Python FastAPI (recommended) — Add /webhook/telegram route to existing FastAPI app. Already has its own port.

## Q5: Bot Setup Model

**Question:** Should the admin need to register their own Telegram bot via @BotFather, or should we provide a default/pre-configured bot?

**Answer:** Admin creates own bot — Admin registers bot via @BotFather, enters token in Admin Settings. More flexible, standard approach.

## Q6: App URL for Inline Buttons

**Question:** For the 'View in SmartSpecPro' button in Telegram messages, what base URL should it use?

**Answer:** Use system_settings — Store app base URL in system_settings (e.g., 'telegram' category, 'app_url' key). Admin configures it.

## Q7: UI Location for User Settings

**Question:** Should the user settings for Telegram be on a new dedicated page, or added as a section within an existing settings/profile page?

**Answer:** Section in existing Settings page — Add 'Telegram Notifications' section to the existing user settings/profile page.

## Q8: Failure Handling

**Question:** When a Telegram message fails to deliver (user blocked bot, network error after retries), should the system auto-unlink the user's Telegram, just log it, or show an in-app warning?

**Answer:** Log + in-app warning — Keep linked but show a warning in notification settings that delivery is failing.
