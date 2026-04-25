---
slug: admin-users
title: User Management
description: Manage users, roles, and permissions
icon: Users
section: admin
order: 105
pages: ["/admin/users", "/admin/packages"]
tags:
  - "admin"
  - "users"
  - "roles"
  - "permissions"
  - "ban"
  - "credits"
  - "packages"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-users"
aliases:
  - "admin-users"
  - "User Management"
  - "User Management help"
---

# User Management

## Overview

User Management gives administrators full visibility and control over every account on the platform. From here you can search users, change roles, adjust credit balances, suspend accounts, and configure the credit packages available for purchase.

## User list

- The **Users table** shows all registered accounts with email, display name, role, credit balance, plan, join date, and status.
- **Search** by name or email address.
- **Filter** by role (user, admin, domain_admin), status (active, banned), or plan.
- **Sort** by any column — join date, credits, last active — by clicking the column header.
- Click a user row to open their detail panel.

## Roles

The platform uses a three-level role hierarchy:

| Role | Description |
|---|---|
| `user` | Standard account — access to chat, media, skills, and their own content. |
| `admin` | Elevated access — manage users, view audit logs, adjust credits. Cannot change system settings. |
| `domain_admin` | Full administrative access — all admin capabilities plus system settings and provider configuration. |

To change a role, open the user detail panel and select a new role from the dropdown. The change takes effect immediately.

## Actions on individual users

- **Edit role** — promote or demote a user within the role hierarchy.
- **Adjust credits** — add or subtract credits with an optional reason note (recorded in audit log).
- **Ban user** — suspends the account immediately; the user cannot log in. All their data is preserved.
- **Unban user** — restores access immediately.
- **Impersonate** (domain_admin only) — log in as the user to debug issues on their behalf. All actions taken while impersonating are flagged in the audit log.
- **Delete account** — permanently removes the user and all their data. Requires confirmation. Irreversible.

## Credit management

- Use **Adjust Credits** to manually grant or deduct credits for support, compensation, or testing purposes.
- Enter a positive number to add credits or a negative number to deduct.
- Always add a **reason note** — it is visible in the user's credit transaction history and the audit log.
- **Set credit limit** — optionally cap how many credits a user can accumulate.
- View a user's full **transaction history** from their detail panel.

## Packages

The **Packages** tab manages the credit bundle tiers available for self-service purchase.

- **Create a package** — set name, credit amount, price, currency, and whether it is active.
- **Edit** an existing package to adjust pricing or credit value.
- **Activate / deactivate** — toggle visibility in the user-facing billing UI without deleting the package.
- **Delete** — removes a package permanently; users with existing purchases are unaffected.

## Bulk actions

Select multiple users with the checkboxes to perform bulk operations:

- **Bulk credit adjustment** — apply the same credit change to all selected users at once.
- **Bulk role change** — promote or demote a group of users.
- **Bulk ban / unban** — suspend or restore a group of accounts.

All bulk actions are recorded individually in the audit log for each affected user.

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
