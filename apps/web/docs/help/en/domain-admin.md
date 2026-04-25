---
slug: domain-admin
title: Domain Administration
description: Manage tenant settings, branding, and content
icon: Globe
section: admin
order: 125
pages: ["/domain-admin", "/domain-admin/theme", "/domain-admin/content", "/domain-admin/users", "/domain-admin/settings", "/domain-admin/blog"]
tags:
  - "domain admin"
  - "tenant"
  - "branding"
  - "theme"
  - "multi-tenant"
  - "white label"
  - "blog"
  - "content"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin"
  - "domain-admin"
aliases:
  - "domain-admin"
  - "Domain Administration"
  - "Domain Administration help"
---

# Domain Administration

## What is Domain Administration?

Domain Administration gives you full control over your organization's SmartAI Hub instance. You can customize branding, manage users, control which features are visible, and publish content — all within your domain's isolated environment.

Domain Admin is available to users with the **domain_admin** or **admin** role. Access it at **/domain-admin** or through the Admin menu.

## Sections

### Dashboard

The Dashboard gives you an at-a-glance overview of your domain:

- Active user count and new registrations
- Credit usage this month
- Recent activity feed
- Quick links to each admin section

### Theme Editor

Customize the visual appearance of your domain for all users:

- **Logo** — upload your organization's logo (PNG or SVG, recommended 200×60 px)
- **Favicon** — upload a favicon for the browser tab (32×32 px ICO or PNG)
- **Primary color** — the main accent color used for buttons and highlights
- **Secondary color** — used for backgrounds and secondary UI elements
- **Font selection** — choose from available system and Google Fonts
- **Custom CSS** — advanced users can inject CSS to override any style

Changes in the Theme Editor are previewed live and take effect for all domain users when you click **Save Theme**.

### Content

Manage the landing pages and announcement content your users see:

- **Welcome message** — the text shown on the dashboard when users first log in
- **Announcements** — banner messages displayed at the top of the interface
- **Feature highlights** — cards shown on the welcome screen to surface key features
- **Custom landing page** — a fully editable landing page for unauthenticated visitors

### Users

Manage all users registered under your domain:

- **User list** — search and filter by name, email, role, or status
- **Invite users** — send invitation emails with a pre-assigned role
- **Edit roles** — promote or demote users between member, admin, and domain_admin
- **Suspend accounts** — temporarily disable a user's access without deleting their data
- **View activity** — see per-user usage statistics and last login date
- **Credit allocation** — assign additional credits to specific users

### Settings

Configure domain-level behavior:

- **Domain name and description** — display name shown in the interface
- **Feature flags** — enable or disable specific features (agency builder, workflows, etc.) for your domain
- **Default AI model** — set the model all new users start with
- **Credit policy** — configure monthly credit grants and rollover behavior
- **Registration settings** — open registration, invite-only, or closed

### Blog

Publish articles and posts visible to users on your domain:

- **Create post** — write in the built-in markdown editor with image upload support
- **Draft mode** — save drafts before publishing
- **Schedule publishing** — set a future date and time for a post to go live
- **Categories and tags** — organize posts for easier browsing
- **Manage posts** — edit, unpublish, or delete existing posts

## Theme Editor — detailed steps

The Theme Editor gives you full visual control without touching code:

1. **Upload your logo** — click the logo upload area and select a PNG or SVG file. SVG is recommended for sharp rendering at all sizes. The recommended canvas size is 200×60 px; the logo will be constrained to fit the header.
2. **Upload a favicon** — click the favicon upload area and select a 32×32 px ICO or PNG file. The favicon appears in browser tabs and bookmarks.
3. **Pick colors** — click the color swatch next to **Primary color** or **Secondary color** to open the color picker. Enter a hex code directly or use the picker wheel. Changes are previewed live in the panel.
4. **Select a font** — use the font dropdown to choose from system fonts and Google Fonts. A sample paragraph renders immediately with your selection so you can judge readability.
5. **Custom CSS** — expand the Custom CSS editor to add overrides. CSS is injected after the platform stylesheet, so your rules take precedence. Prefix selectors with a domain-specific class to avoid collisions.
6. Click **Save Theme** to publish changes to all domain users immediately.

## Content — detailed steps

The Content section controls what users see on the dashboard and landing pages:

- **Welcome message** — written in plain text or simple markdown. Shown at the top of the dashboard for all logged-in users. Use this to communicate team-specific context, guidelines, or a warm greeting.
- **Feature toggles** — enable or disable feature highlight cards individually. If your domain does not use the Video Editor, hide that card to reduce clutter.
- **Announcements** — create one or more banner messages. Each announcement has a title, body text, severity level (info, warning, error), and an optional expiry date after which it auto-hides.
- **Custom landing page** — a full-page editor for the unauthenticated landing page. Supports markdown with embedded image URLs. Use this to describe your organization's use of SmartAI Hub to potential new users.

## Users — detailed steps

Managing your domain's user roster:

- **Invite link** — generate a sign-up link pre-scoped to your domain. Share the link via email or chat. Anyone who registers through the link is automatically added to your domain with the default role.
- **Invite by email** — send individual invitations to specific email addresses. Each invitation includes a welcome message and assigns a role (member, admin, or domain_admin) before the user even logs in.
- **Role assignment** — to change a user's role, click the user row, select the new role from the dropdown, and save. Changes take effect on the user's next page load.
- **Activity log** — click the activity icon on any user row to see their last 30 actions: logins, credit usage, feature usage, and admin operations they performed.
- **Credit allocation** — select a user and click **Allocate Credits** to add a one-time credit grant. This is useful for rewarding power users or compensating for failed tasks.

## Blog — detailed steps

Publishing posts to your domain's built-in blog:

- **Create a post** — click **New Post**, write in the markdown editor (full heading, list, code block, and table support), and upload images directly into the post using the image button in the toolbar.
- **Draft mode** — posts start as drafts. Only admins can see draft posts. Click **Publish** when the post is ready to go live.
- **Schedule publishing** — instead of clicking Publish immediately, click **Schedule**, pick a date and time, and save. The post goes live automatically at the scheduled time.
- **Categories** — create categories from the Category Manager (Blog settings) and assign posts to one or more categories. Categories appear as filter tabs on the blog index page.
- **Tags** — add comma-separated tags to each post. Tags are searchable and help users find related articles.
- **Manage posts** — from the post list, click **Edit** to revise a published post, **Unpublish** to return it to draft, or **Delete** to remove it permanently.

## Theme customization tips

- Use your brand's exact hex color codes for consistency with your other materials.
- Test your color choices in both light and dark mode if your users can switch themes.
- Keep custom CSS changes minimal — platform updates may change class names, breaking custom styles.
- Use SVG format for your logo to ensure crisp rendering at all screen densities.

## User management tips

- **Invite users with roles pre-set** — saves a step compared to promoting them after they register.
- **Use suspension instead of deletion** — suspended accounts can be reactivated; deleted accounts cannot.
- **Review inactive users periodically** — users who have not logged in for 90+ days may no longer need access.

## Blog tips

- Use the **Schedule publishing** feature to maintain a consistent posting cadence without being online at the exact publish time.
- Add descriptive tags to posts so users can find related articles easily.
- Keep announcements brief — long banners are often dismissed without being read.

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
