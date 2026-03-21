/**
 * AdminWebhookManagement — Admin tenant-wide webhook management.
 * Shows tenant-scoped webhooks including auto-disabled ones.
 */

import { WebhookManagement } from "@/components/settings/WebhookManagement";

export function AdminWebhookManagement() {
  return <WebhookManagement scope="tenant" />;
}
