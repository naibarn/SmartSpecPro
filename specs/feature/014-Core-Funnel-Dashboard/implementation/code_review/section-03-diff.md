diff --git a/apps/web/server/services/funnelMilestones.ts b/apps/web/server/services/funnelMilestones.ts
new file mode 100644
index 0000000..4e7cd27
--- /dev/null
+++ b/apps/web/server/services/funnelMilestones.ts
@@ -0,0 +1,198 @@
+import type { FunnelTrackInput, FunnelTrackResult } from "./funnelTracker";
+import { trackFunnelEvent } from "./funnelTracker";
+
+export interface MilestoneDeps {
+  now?: () => Date;
+  trackEvent?: (input: FunnelTrackInput) => Promise<FunnelTrackResult>;
+  hasExistingMilestone?: (input: {
+    tenantId: string;
+    userId?: number | null;
+    eventName: string;
+  }) => Promise<boolean>;
+  emitCounter?: (milestone: string, outcome: string) => void;
+  logger?: Pick<Console, "warn">;
+}
+
+export interface MilestoneInput {
+  tenantId: string;
+  domain?: string | null;
+  userId: number;
+  source: string;
+  plan?: string;
+  channel?: string;
+  attribution?: Record<string, unknown>;
+  properties?: Record<string, unknown>;
+}
+
+export interface MilestoneResult {
+  status: "inserted" | "skipped_existing" | "failed";
+  error?: string;
+}
+
+const MILESTONE_EVENTS = {
+  signupCompleted: "signup_completed",
+  emailVerified: "email_verified",
+  firstConversation: "first_conversation",
+  firstLlmRequest: "first_llm_request",
+  firstMediaGeneration: "first_media_generation",
+  purchaseCompleted: "purchase_completed",
+  subscriptionStarted: "subscription_started",
+} as const;
+
+function buildMilestoneProperties(
+  input: MilestoneInput,
+): Record<string, unknown> {
+  const props: Record<string, unknown> = {
+    source: input.source,
+    ...(input.plan != null ? { plan: input.plan } : {}),
+    ...(input.channel != null ? { channel: input.channel } : {}),
+    ...(input.attribution != null ? { attribution: input.attribution } : {}),
+    ...((input.properties as Record<string, unknown>) ?? {}),
+  };
+  return props;
+}
+
+async function trackMilestone(
+  eventName: string,
+  input: MilestoneInput,
+  deps: MilestoneDeps,
+  opts: { checkExisting: boolean },
+): Promise<MilestoneResult> {
+  const emitCounter = deps.emitCounter ?? (() => undefined);
+  const logger = deps.logger ?? console;
+
+  try {
+    if (opts.checkExisting) {
+      const hasExisting = deps.hasExistingMilestone;
+      if (hasExisting) {
+        const exists = await hasExisting({
+          tenantId: input.tenantId,
+          userId: input.userId,
+          eventName,
+        });
+        if (exists) {
+          emitCounter(eventName, "skipped_existing");
+          return { status: "skipped_existing" };
+        }
+      }
+    }
+
+    const track = deps.trackEvent ?? trackFunnelEvent;
+    const result = await track({
+      tenantId: input.tenantId,
+      domain: input.domain ?? null,
+      userId: input.userId,
+      eventName,
+      eventTime: deps.now?.() ?? new Date(),
+      properties: buildMilestoneProperties(input),
+    });
+
+    if (result.status === "duplicate_ignored") {
+      emitCounter(eventName, "skipped_existing");
+      return { status: "skipped_existing" };
+    }
+    if (result.status === "failed") {
+      emitCounter(eventName, "failed");
+      return { status: "failed", error: result.error };
+    }
+
+    emitCounter(eventName, "inserted");
+    return { status: "inserted" };
+  } catch (error) {
+    const message =
+      error instanceof Error ? error.message : String(error);
+    logger.warn(`[FunnelMilestone] ${eventName} failed`, {
+      tenantId: input.tenantId,
+      userId: input.userId,
+      error: message,
+    });
+    emitCounter(eventName, "failed");
+    return { status: "failed", error: message };
+  }
+}
+
+export async function trackSignupCompleted(
+  input: MilestoneInput,
+  deps: MilestoneDeps = {},
+): Promise<MilestoneResult> {
+  return trackMilestone(
+    MILESTONE_EVENTS.signupCompleted,
+    input,
+    deps,
+    { checkExisting: true },
+  );
+}
+
+export async function trackEmailVerified(
+  input: MilestoneInput,
+  deps: MilestoneDeps = {},
+): Promise<MilestoneResult> {
+  return trackMilestone(
+    MILESTONE_EVENTS.emailVerified,
+    input,
+    deps,
+    { checkExisting: true },
+  );
+}
+
+export async function trackFirstConversation(
+  input: MilestoneInput,
+  deps: MilestoneDeps = {},
+): Promise<MilestoneResult> {
+  return trackMilestone(
+    MILESTONE_EVENTS.firstConversation,
+    input,
+    deps,
+    { checkExisting: true },
+  );
+}
+
+export async function trackFirstLlmRequest(
+  input: MilestoneInput,
+  deps: MilestoneDeps = {},
+): Promise<MilestoneResult> {
+  return trackMilestone(
+    MILESTONE_EVENTS.firstLlmRequest,
+    input,
+    deps,
+    { checkExisting: true },
+  );
+}
+
+export async function trackFirstMediaGeneration(
+  input: MilestoneInput,
+  deps: MilestoneDeps = {},
+): Promise<MilestoneResult> {
+  return trackMilestone(
+    MILESTONE_EVENTS.firstMediaGeneration,
+    input,
+    deps,
+    { checkExisting: true },
+  );
+}
+
+export async function trackPurchaseCompleted(
+  input: MilestoneInput,
+  deps: MilestoneDeps = {},
+): Promise<MilestoneResult> {
+  return trackMilestone(
+    MILESTONE_EVENTS.purchaseCompleted,
+    input,
+    deps,
+    { checkExisting: false },
+  );
+}
+
+export async function trackSubscriptionStarted(
+  input: MilestoneInput,
+  deps: MilestoneDeps = {},
+): Promise<MilestoneResult> {
+  return trackMilestone(
+    MILESTONE_EVENTS.subscriptionStarted,
+    input,
+    deps,
+    { checkExisting: false },
+  );
+}
+
+export { MILESTONE_EVENTS };
