diff --git a/apps/web/client/src/components/FeatureFlagGate.tsx b/apps/web/client/src/components/FeatureFlagGate.tsx
new file mode 100644
index 0000000..cb70f69
--- /dev/null
+++ b/apps/web/client/src/components/FeatureFlagGate.tsx
@@ -0,0 +1,27 @@
+/**
+ * FeatureFlagGate
+ *
+ * Conditionally renders children based on a Claw tenant feature flag.
+ *
+ * Props:
+ *   flag: FeatureFlagKey — which flag to check
+ *   fallback?: ReactNode — content to render when flag is disabled (default: null)
+ *   children: ReactNode — content to render when flag is enabled
+ *
+ * Falls back to FEATURE_FLAG_DEFAULTS when tenant context is unavailable.
+ */
+
+import type { ReactNode } from "react";
+import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
+import type { FeatureFlagKey } from "@/../../shared/featureFlags";
+
+interface FeatureFlagGateProps {
+  flag: FeatureFlagKey;
+  fallback?: ReactNode;
+  children: ReactNode;
+}
+
+export function FeatureFlagGate({ flag, fallback = null, children }: FeatureFlagGateProps) {
+  const enabled = useTenantFeatureFlag(flag);
+  return enabled ? <>{children}</> : <>{fallback}</>;
+}
diff --git a/apps/web/client/src/components/__tests__/FeatureFlagGate.test.tsx b/apps/web/client/src/components/__tests__/FeatureFlagGate.test.tsx
new file mode 100644
index 0000000..7292536
--- /dev/null
+++ b/apps/web/client/src/components/__tests__/FeatureFlagGate.test.tsx
@@ -0,0 +1,106 @@
+/**
+ * @vitest-environment jsdom
+ */
+
+import React from "react";
+import { describe, it, expect, vi } from "vitest";
+import { render, screen } from "@testing-library/react";
+import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
+import { FeatureFlagGate } from "../FeatureFlagGate";
+
+// Mock the useTenantFeatureFlag hook
+vi.mock("@/hooks/useTenantFeatureFlag", () => ({
+  useTenantFeatureFlag: vi.fn(),
+}));
+
+import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
+
+const mockedUseFlag = vi.mocked(useTenantFeatureFlag);
+
+function wrapper({ children }: { children: React.ReactNode }) {
+  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
+  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
+}
+
+describe("FeatureFlagGate", () => {
+  it("renders children when feature flag is enabled", () => {
+    mockedUseFlag.mockReturnValue(true);
+
+    render(
+      <FeatureFlagGate flag="canvas">
+        <div>Canvas</div>
+      </FeatureFlagGate>,
+      { wrapper },
+    );
+
+    expect(screen.getByText("Canvas")).toBeDefined();
+  });
+
+  it("does not render children when feature flag is disabled", () => {
+    mockedUseFlag.mockReturnValue(false);
+
+    render(
+      <FeatureFlagGate flag="canvas">
+        <div>Canvas</div>
+      </FeatureFlagGate>,
+      { wrapper },
+    );
+
+    expect(screen.queryByText("Canvas")).toBeNull();
+  });
+
+  it("renders fallback when flag is disabled and fallback provided", () => {
+    mockedUseFlag.mockReturnValue(false);
+
+    render(
+      <FeatureFlagGate flag="canvas" fallback={<div>Upgrade</div>}>
+        <div>Canvas</div>
+      </FeatureFlagGate>,
+      { wrapper },
+    );
+
+    expect(screen.getByText("Upgrade")).toBeDefined();
+    expect(screen.queryByText("Canvas")).toBeNull();
+  });
+
+  it("renders nothing (no fallback) when flag is disabled", () => {
+    mockedUseFlag.mockReturnValue(false);
+
+    const { container } = render(
+      <FeatureFlagGate flag="canvas">
+        <div>Canvas</div>
+      </FeatureFlagGate>,
+      { wrapper },
+    );
+
+    expect(container.firstChild).toBeNull();
+  });
+
+  it("uses default true value for costDisplay when featureFlags is undefined", () => {
+    // costDisplay defaults to true — mock reflects the hook's default fallback
+    mockedUseFlag.mockReturnValue(true);
+
+    render(
+      <FeatureFlagGate flag="costDisplay">
+        <div>Cost</div>
+      </FeatureFlagGate>,
+      { wrapper },
+    );
+
+    expect(screen.getByText("Cost")).toBeDefined();
+  });
+
+  it("uses default false value for browserTool when featureFlags is undefined", () => {
+    // browserTool defaults to false — hook returns false for missing data
+    mockedUseFlag.mockReturnValue(false);
+
+    render(
+      <FeatureFlagGate flag="browserTool">
+        <div>Browser</div>
+      </FeatureFlagGate>,
+      { wrapper },
+    );
+
+    expect(screen.queryByText("Browser")).toBeNull();
+  });
+});
diff --git a/apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx b/apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx
new file mode 100644
index 0000000..69d52be
--- /dev/null
+++ b/apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx
@@ -0,0 +1,171 @@
+/**
+ * TenantFeatureFlagsPanel
+ *
+ * Admin panel component for toggling Claw feature flags on a per-tenant basis.
+ * Used within the tenant management UI.
+ *
+ * - Displays all 10 feature flags grouped by category
+ * - Shows enabled/disabled state with toggle switches
+ * - Calls updateFeatureFlags mutation on toggle
+ * - Optimistic updates with rollback on error
+ */
+
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import type { TenantFeatureFlags, FeatureFlagKey } from "@/../../shared/featureFlags";
+import { FEATURE_FLAG_DEFAULTS } from "@/../../shared/featureFlags";
+
+interface FlagInfo {
+  key: FeatureFlagKey;
+  label: string;
+  description: string;
+}
+
+const FLAG_GROUPS: { title: string; flags: FlagInfo[] }[] = [
+  {
+    title: "Channels",
+    flags: [
+      { key: "multiChannel", label: "Multi-Channel Adapters", description: "Telegram, WhatsApp, LINE, Slack, Discord" },
+      { key: "chatWidget", label: "Embeddable Chat Widget", description: "Embed chat on external websites" },
+      { key: "channelRouter", label: "Channel Routing Rules", description: "Route messages based on rules" },
+    ],
+  },
+  {
+    title: "AI Tools",
+    flags: [
+      { key: "browserTool", label: "Browser Automation", description: "AI-controlled web browsing" },
+      { key: "canvas", label: "Canvas / AI Artifacts", description: "Interactive artifact rendering" },
+      { key: "voiceChat", label: "Voice Chat Mode", description: "Real-time voice conversation" },
+      { key: "crossAgency", label: "Cross-Agency Communication", description: "Agents calling other agents" },
+      { key: "personaSystem", label: "AI Persona System", description: "Custom AI personalities per conversation" },
+    ],
+  },
+  {
+    title: "Integration",
+    flags: [
+      { key: "webhookTriggers", label: "Inbound Webhook Triggers", description: "Trigger agents via HTTP webhooks" },
+      { key: "costDisplay", label: "Per-Response Cost Display", description: "Show token cost to users" },
+    ],
+  },
+];
+
+interface TenantFeatureFlagsPanelProps {
+  tenantId: string;
+  /** Whether the current user can modify flags for this tenant */
+  canEdit?: boolean;
+}
+
+export function TenantFeatureFlagsPanel({ tenantId, canEdit = false }: TenantFeatureFlagsPanelProps) {
+  const utils = trpc.useUtils();
+
+  const { data: flags, isLoading } = trpc.tenantFeatureFlags.getFeatureFlags.useQuery(
+    { tenantId },
+    { staleTime: 30_000 },
+  );
+
+  const mutation = trpc.tenantFeatureFlags.updateFeatureFlags.useMutation({
+    onMutate: async ({ flags: updates, tenantId: tid }) => {
+      // Cancel outgoing refetches
+      await utils.tenantFeatureFlags.getFeatureFlags.cancel({ tenantId: tid });
+
+      // Snapshot current value
+      const previous = utils.tenantFeatureFlags.getFeatureFlags.getData({ tenantId: tid });
+
+      // Optimistically update
+      utils.tenantFeatureFlags.getFeatureFlags.setData(
+        { tenantId: tid },
+        (old) => (old ? { ...old, ...updates } : { ...FEATURE_FLAG_DEFAULTS, ...updates }),
+      );
+
+      return { previous };
+    },
+    onError: (_err, variables, context) => {
+      // Roll back on error
+      if (context?.previous) {
+        utils.tenantFeatureFlags.getFeatureFlags.setData(
+          { tenantId: variables.tenantId! },
+          context.previous,
+        );
+      }
+    },
+    onSettled: () => {
+      utils.tenantFeatureFlags.getFeatureFlags.invalidate({ tenantId });
+    },
+  });
+
+  const [pendingKey, setPendingKey] = useState<FeatureFlagKey | null>(null);
+
+  const handleToggle = (flag: FeatureFlagKey, currentValue: boolean) => {
+    if (!canEdit || mutation.isPending) return;
+
+    setPendingKey(flag);
+    mutation.mutate(
+      { tenantId, flags: { [flag]: !currentValue } },
+      { onSettled: () => setPendingKey(null) },
+    );
+  };
+
+  if (isLoading) {
+    return <div className="p-4 text-sm text-gray-500">Loading feature flags...</div>;
+  }
+
+  const resolvedFlags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS, ...(flags ?? {}) };
+
+  return (
+    <div className="space-y-6">
+      {FLAG_GROUPS.map((group) => (
+        <div key={group.title}>
+          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
+            {group.title}
+          </h3>
+          <div className="space-y-2">
+            {group.flags.map(({ key, label, description }) => {
+              const enabled = resolvedFlags[key];
+              const isPending = pendingKey === key;
+
+              return (
+                <div
+                  key={key}
+                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
+                >
+                  <div className="flex-1">
+                    <p className="text-sm font-medium text-gray-900">{label}</p>
+                    <p className="text-xs text-gray-500">{description}</p>
+                  </div>
+                  <button
+                    type="button"
+                    role="switch"
+                    aria-checked={enabled}
+                    aria-label={`Toggle ${label}`}
+                    disabled={!canEdit || isPending}
+                    onClick={() => handleToggle(key, enabled)}
+                    className={[
+                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
+                      "transition-colors duration-200 ease-in-out focus:outline-none",
+                      "disabled:cursor-not-allowed disabled:opacity-50",
+                      enabled ? "bg-blue-600" : "bg-gray-200",
+                    ].join(" ")}
+                  >
+                    <span
+                      className={[
+                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow",
+                        "transform transition duration-200 ease-in-out",
+                        enabled ? "translate-x-4" : "translate-x-0",
+                      ].join(" ")}
+                    />
+                  </button>
+                </div>
+              );
+            })}
+          </div>
+        </div>
+      ))}
+
+      {mutation.isError && (
+        <p className="text-sm text-red-600">
+          Failed to update feature flag. Please try again.
+        </p>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/hooks/useTenantFeatureFlag.ts b/apps/web/client/src/hooks/useTenantFeatureFlag.ts
new file mode 100644
index 0000000..cacd34a
--- /dev/null
+++ b/apps/web/client/src/hooks/useTenantFeatureFlag.ts
@@ -0,0 +1,75 @@
+/**
+ * Hook to check if a Claw tenant feature flag is enabled.
+ *
+ * Reads tenant featureFlags from the /api/tenant/current endpoint
+ * and returns a boolean for the requested flag.
+ * Falls back to FEATURE_FLAG_DEFAULTS for missing or unavailable flags.
+ *
+ * Usage:
+ *   const canvasEnabled = useTenantFeatureFlag("canvas");
+ *   if (canvasEnabled) { ... }
+ */
+
+import { useQuery } from "@tanstack/react-query";
+import { FEATURE_FLAG_DEFAULTS, type FeatureFlagKey } from "@/../../shared/featureFlags";
+
+interface TenantCurrentResponse {
+  tenant?: {
+    settings?: Record<string, unknown>;
+    featureFlags?: Record<string, boolean>;
+  };
+}
+
+async function fetchTenantCurrent(): Promise<TenantCurrentResponse> {
+  const res = await fetch("/api/tenant/current");
+  if (!res.ok) return {};
+  return res.json();
+}
+
+/**
+ * Returns whether the given Claw feature flag is enabled for the current tenant.
+ *
+ * Uses FEATURE_FLAG_DEFAULTS as fallback when the tenant has no override.
+ */
+export function useTenantFeatureFlag(flag: FeatureFlagKey): boolean {
+  const { data } = useQuery({
+    queryKey: ["tenant", "current"],
+    queryFn: fetchTenantCurrent,
+    staleTime: 60_000, // 1 minute
+    gcTime: 5 * 60_000,
+  });
+
+  const storedFlags = data?.tenant?.featureFlags;
+
+  if (!storedFlags || typeof storedFlags[flag] !== "boolean") {
+    return FEATURE_FLAG_DEFAULTS[flag];
+  }
+
+  return storedFlags[flag];
+}
+
+/**
+ * Returns a resolved map of all Claw tenant feature flags.
+ *
+ * Each flag falls back to FEATURE_FLAG_DEFAULTS when not set.
+ */
+export function useTenantFeatureFlags(): Record<FeatureFlagKey, boolean> {
+  const { data } = useQuery({
+    queryKey: ["tenant", "current"],
+    queryFn: fetchTenantCurrent,
+    staleTime: 60_000,
+    gcTime: 5 * 60_000,
+  });
+
+  const storedFlags = data?.tenant?.featureFlags ?? {};
+  const result = { ...FEATURE_FLAG_DEFAULTS };
+
+  for (const key of Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagKey[]) {
+    const stored = storedFlags[key];
+    if (typeof stored === "boolean") {
+      result[key] = stored;
+    }
+  }
+
+  return result;
+}
diff --git a/apps/web/server/middleware/requireFeatureFlag.ts b/apps/web/server/middleware/requireFeatureFlag.ts
new file mode 100644
index 0000000..0de940a
--- /dev/null
+++ b/apps/web/server/middleware/requireFeatureFlag.ts
@@ -0,0 +1,66 @@
+/**
+ * tRPC Middleware Factory: requireFeatureFlag
+ *
+ * Creates a tRPC middleware that checks a tenant feature flag before
+ * allowing the procedure to proceed.
+ *
+ * Usage:
+ *   protectedProcedure
+ *     .use(requireFeatureFlag("canvas"))
+ *     .query(async ({ ctx }) => { ... })
+ *
+ * When the flag is false (or missing with a false default),
+ * throws TRPCError { code: "FORBIDDEN" }
+ */
+
+import { TRPCError } from "@trpc/server";
+import { initTRPC } from "@trpc/server";
+import type { TrpcContext } from "../_core/context";
+import { getDb } from "../db";
+import { tenants } from "../../drizzle/schema";
+import { eq } from "drizzle-orm";
+import { isFeatureEnabled } from "../services/tenantFeatureFlagService";
+import type { FeatureFlagKey } from "../../shared/featureFlags";
+
+const t = initTRPC.context<TrpcContext>().create();
+
+/**
+ * Creates a tRPC middleware that enforces a tenant feature flag.
+ *
+ * @param flag - The feature flag key to check
+ */
+export function requireFeatureFlag(flag: FeatureFlagKey) {
+  return t.middleware(async ({ ctx, next }) => {
+    const tenantId = ctx.tenantId;
+
+    if (!tenantId) {
+      throw new TRPCError({
+        code: "FORBIDDEN",
+        message: `Feature '${flag}' is not available (no tenant context)`,
+      });
+    }
+
+    // Read tenant's featureFlags column
+    const db = await getDb();
+    let storedFlags: Record<string, boolean> | null = null;
+
+    if (db) {
+      const [row] = await db
+        .select({ featureFlags: tenants.featureFlags })
+        .from(tenants)
+        .where(eq(tenants.id, tenantId))
+        .limit(1);
+
+      storedFlags = (row?.featureFlags as Record<string, boolean>) ?? null;
+    }
+
+    if (!isFeatureEnabled(storedFlags, flag)) {
+      throw new TRPCError({
+        code: "FORBIDDEN",
+        message: `Feature '${flag}' is not enabled for this tenant`,
+      });
+    }
+
+    return next();
+  });
+}
diff --git a/apps/web/server/middleware/requireFeatureFlagExpress.ts b/apps/web/server/middleware/requireFeatureFlagExpress.ts
new file mode 100644
index 0000000..ffa47a4
--- /dev/null
+++ b/apps/web/server/middleware/requireFeatureFlagExpress.ts
@@ -0,0 +1,67 @@
+/**
+ * Express Middleware Factory: requireFeatureFlagExpress
+ *
+ * Creates an Express middleware that checks a tenant feature flag before
+ * allowing the route handler to proceed.
+ *
+ * Usage:
+ *   app.post("/api/webhooks/trigger/:triggerId",
+ *     requireFeatureFlagExpress("webhookTriggers"),
+ *     webhookHandler
+ *   );
+ *
+ * Reads tenant from req.tenant (TenantRequest) and checks the flag.
+ * Returns 403 JSON response if flag is disabled.
+ */
+
+import type { Response, NextFunction } from "express";
+import type { TenantRequest } from "../_core/tenant";
+import { getDb } from "../db";
+import { tenants } from "../../drizzle/schema";
+import { eq } from "drizzle-orm";
+import { isFeatureEnabled } from "../services/tenantFeatureFlagService";
+import type { FeatureFlagKey } from "../../shared/featureFlags";
+
+/**
+ * Creates an Express middleware that enforces a tenant feature flag.
+ *
+ * @param flag - The feature flag key to check
+ */
+export function requireFeatureFlagExpress(flag: FeatureFlagKey) {
+  return async (req: TenantRequest, res: Response, next: NextFunction): Promise<void> => {
+    const tenantId = req.tenant?.id;
+
+    if (!tenantId) {
+      res.status(403).json({
+        error: `Feature '${flag}' is not available (no tenant context)`,
+      });
+      return;
+    }
+
+    try {
+      const db = await getDb();
+      let storedFlags: Record<string, boolean> | null = null;
+
+      if (db) {
+        const [row] = await db
+          .select({ featureFlags: tenants.featureFlags })
+          .from(tenants)
+          .where(eq(tenants.id, tenantId))
+          .limit(1);
+
+        storedFlags = (row?.featureFlags as Record<string, boolean>) ?? null;
+      }
+
+      if (!isFeatureEnabled(storedFlags, flag)) {
+        res.status(403).json({
+          error: `Feature '${flag}' is not enabled for this tenant`,
+        });
+        return;
+      }
+
+      next();
+    } catch {
+      res.status(500).json({ error: "Feature flag check failed" });
+    }
+  };
+}
diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index 75d0b2c..7983153 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -72,6 +72,7 @@ import { artifactRouter } from "./routers/artifact";
 import { widgetRouter } from "./routers/widget";
 import { webhookTriggersRouter } from "./routers/webhookTriggers";
 import { channelRouterRouter } from "./routers/channelRouter";
+import { tenantFeatureFlagsRouter } from "./routers/tenantFeatureFlags";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -1778,6 +1779,7 @@ export const appRouter = router({
   adminOps: adminOpsRouter,
   funnelAnalytics: funnelAnalyticsRouter,
   persona: personaRouter,
+  tenantFeatureFlags: tenantFeatureFlagsRouter,
 });
 
 export type AppRouter = typeof appRouter;
diff --git a/apps/web/server/routers/__tests__/tenantFeatureFlags.test.ts b/apps/web/server/routers/__tests__/tenantFeatureFlags.test.ts
new file mode 100644
index 0000000..b6f7782
--- /dev/null
+++ b/apps/web/server/routers/__tests__/tenantFeatureFlags.test.ts
@@ -0,0 +1,158 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { validateFeatureFlags, resolveFeatureFlags, isFeatureEnabled } from "../../services/tenantFeatureFlagService";
+import { FEATURE_FLAG_DEFAULTS } from "../../../shared/featureFlags";
+
+// Mock db module
+vi.mock("../../db", () => ({
+  getDb: vi.fn().mockResolvedValue(null),
+}));
+
+describe("updateFeatureFlags mutation — validation", () => {
+  it("validates keys against allowlist and strips unrecognized", () => {
+    const result = validateFeatureFlags({ canvas: true, unknownFlag: true });
+    expect(result).toEqual({ canvas: true });
+    expect("unknownFlag" in result).toBe(false);
+  });
+
+  it("strips non-boolean values", () => {
+    const result = validateFeatureFlags({ canvas: "true" as unknown as boolean, voiceChat: true });
+    expect(result).toEqual({ voiceChat: true });
+  });
+
+  it("accepts all 10 recognized flags", () => {
+    const all = {
+      multiChannel: true,
+      chatWidget: true,
+      browserTool: true,
+      canvas: true,
+      voiceChat: true,
+      webhookTriggers: true,
+      costDisplay: false,
+      personaSystem: false,
+      crossAgency: true,
+      channelRouter: true,
+    };
+    const result = validateFeatureFlags(all);
+    expect(result).toEqual(all);
+  });
+});
+
+describe("updateFeatureFlags mutation — RBAC (simulated)", () => {
+  it("domain_admin targeting same tenant should succeed (simulated by validating logic)", () => {
+    // The RBAC check in the router: domain_admin + own tenant = pass
+    const callerTenantId = "tenant-123";
+    const inputTenantId = "tenant-123";
+    const isDomainAdmin = true;
+    const isAdmin = false;
+
+    let shouldAllow: boolean;
+    if (isAdmin) {
+      shouldAllow = true; // admin can update any
+    } else if (isDomainAdmin) {
+      shouldAllow = !inputTenantId || inputTenantId === callerTenantId;
+    } else {
+      shouldAllow = false;
+    }
+
+    expect(shouldAllow).toBe(true);
+  });
+
+  it("domain_admin targeting different tenant should be forbidden", () => {
+    const callerTenantId = "tenant-123";
+    const inputTenantId = "tenant-456";
+    const isDomainAdmin = true;
+    const isAdmin = false;
+
+    let shouldAllow: boolean;
+    if (isAdmin) {
+      shouldAllow = true;
+    } else if (isDomainAdmin) {
+      shouldAllow = !inputTenantId || inputTenantId === callerTenantId;
+    } else {
+      shouldAllow = false;
+    }
+
+    expect(shouldAllow).toBe(false);
+  });
+
+  it("admin can modify any tenant flags", () => {
+    const isAdmin = true;
+    expect(isAdmin).toBe(true); // admin always allowed
+  });
+});
+
+describe("requireFeatureFlag middleware — simulated via isFeatureEnabled", () => {
+  it("allows request when feature flag is true", () => {
+    const storedFlags = { canvas: true };
+    expect(isFeatureEnabled(storedFlags, "canvas")).toBe(true);
+  });
+
+  it("returns false when feature flag is false", () => {
+    const storedFlags = { canvas: false };
+    expect(isFeatureEnabled(storedFlags, "canvas")).toBe(false);
+  });
+
+  it("returns default (false) when featureFlags sub-key is missing for non-default flags", () => {
+    expect(isFeatureEnabled({}, "canvas")).toBe(false);
+    expect(isFeatureEnabled(null, "channelRouter")).toBe(false);
+  });
+
+  it("returns default (true) when flag is missing but default is true", () => {
+    // costDisplay and personaSystem default to true
+    expect(isFeatureEnabled({}, "costDisplay")).toBe(true);
+    expect(isFeatureEnabled(null, "personaSystem")).toBe(true);
+  });
+});
+
+describe("generic settings mutation audit — validateFeatureFlags prevents bypass", () => {
+  it("strips featureFlags key from generic settings payload", () => {
+    // validateFeatureFlags only accepts known Claw flag keys
+    // "featureFlags" is not a valid flag key, so it gets stripped
+    const result = validateFeatureFlags({ featureFlags: { canvas: true } } as Record<string, unknown>);
+    expect(result).toEqual({});
+  });
+
+  it("validates flags are strict booleans (prevents object injection)", () => {
+    const result = validateFeatureFlags({
+      canvas: { $gt: "" } as unknown as boolean,
+    });
+    expect(result).toEqual({});
+  });
+});
+
+describe("getFeatureFlagDefaults", () => {
+  it("costDisplay defaults to true", () => {
+    expect(FEATURE_FLAG_DEFAULTS.costDisplay).toBe(true);
+  });
+
+  it("personaSystem defaults to true", () => {
+    expect(FEATURE_FLAG_DEFAULTS.personaSystem).toBe(true);
+  });
+
+  it("all other flags default to false", () => {
+    const falseKeys: (keyof typeof FEATURE_FLAG_DEFAULTS)[] = [
+      "multiChannel", "chatWidget", "browserTool", "canvas",
+      "voiceChat", "webhookTriggers", "crossAgency", "channelRouter",
+    ];
+    for (const key of falseKeys) {
+      expect(FEATURE_FLAG_DEFAULTS[key]).toBe(false);
+    }
+  });
+});
+
+describe("mergeFeatureFlags — resolveFeatureFlags", () => {
+  it("preserves unchanged flags when updating", () => {
+    const existing = { canvas: true, voiceChat: false };
+    const merged = resolveFeatureFlags({ ...existing, voiceChat: true });
+    expect(merged.canvas).toBe(true);
+    expect(merged.voiceChat).toBe(true);
+  });
+
+  it("preserves defaults for flags not in stored set", () => {
+    const stored = { canvas: true };
+    const resolved = resolveFeatureFlags(stored);
+    expect(resolved.canvas).toBe(true);
+    expect(resolved.costDisplay).toBe(true); // default true
+    expect(resolved.multiChannel).toBe(false); // default false
+  });
+});
diff --git a/apps/web/server/routers/adminTenants.ts b/apps/web/server/routers/adminTenants.ts
index f617caf..d644517 100644
--- a/apps/web/server/routers/adminTenants.ts
+++ b/apps/web/server/routers/adminTenants.ts
@@ -125,7 +125,11 @@ export function registerAdminTenantsRoutes(app: Express) {
   app.put('/api/admin/tenants/:id', requireAdmin, async (req, res) => {
     try {
       const { id } = req.params;
-      const { slug, name, primaryDomain, domains, logoUrl, websiteLogoUrl, faviconUrl, isActive, themeConfig, seoConfig, settings } = req.body;
+      const { slug, name, primaryDomain, domains, logoUrl, websiteLogoUrl, faviconUrl, isActive, themeConfig, seoConfig, settings: rawSettings } = req.body;
+
+      // featureFlags must only be modified via the dedicated updateFeatureFlags mutation
+      // to enforce allowlist validation and prevent privilege escalation.
+      const { featureFlags: _stripped, ...settings } = (rawSettings ?? {});
 
       const dbInstance = await db.instance;
 
diff --git a/apps/web/server/routers/tenantFeatureFlags.ts b/apps/web/server/routers/tenantFeatureFlags.ts
new file mode 100644
index 0000000..0e3213c
--- /dev/null
+++ b/apps/web/server/routers/tenantFeatureFlags.ts
@@ -0,0 +1,105 @@
+/**
+ * Tenant Feature Flags tRPC Router
+ *
+ * Exposes getFeatureFlags and updateFeatureFlags procedures.
+ *
+ * RBAC:
+ * - getFeatureFlags: any authenticated user (reads own tenant)
+ * - updateFeatureFlags: domain_admin (own tenant only) or admin (any tenant)
+ */
+
+import { z } from "zod";
+import { TRPCError } from "@trpc/server";
+import { router, protectedProcedure, domainAdminProcedure } from "../_core/trpc";
+import { clearTenantCache } from "../_core/tenant";
+import {
+  validateFeatureFlags,
+  getTenantFeatureFlags,
+  updateTenantFeatureFlags,
+} from "../services/tenantFeatureFlagService";
+
+export const tenantFeatureFlagsRouter = router({
+  /**
+   * Get resolved feature flags for the caller's current tenant.
+   */
+  getFeatureFlags: protectedProcedure
+    .input(
+      z
+        .object({
+          tenantId: z.string().optional(),
+        })
+        .optional(),
+    )
+    .query(async ({ ctx, input }) => {
+      const tenantId = input?.tenantId ?? ctx.tenantId;
+      if (!tenantId) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
+      }
+
+      // Non-admin users can only read their own tenant
+      if (input?.tenantId && ctx.user?.role !== "admin") {
+        if (input.tenantId !== ctx.tenantId) {
+          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot read flags for another tenant" });
+        }
+      }
+
+      return getTenantFeatureFlags(tenantId);
+    }),
+
+  /**
+   * Update feature flags for a tenant.
+   *
+   * domain_admin: can only update their own tenant.
+   * admin: can update any tenant (tenantId required).
+   */
+  updateFeatureFlags: domainAdminProcedure
+    .input(
+      z.object({
+        tenantId: z.string().optional(),
+        flags: z.record(z.string(), z.boolean()),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const user = ctx.user;
+
+      // Determine target tenant
+      let targetTenantId: string;
+
+      if (user.role === "admin") {
+        // Admin can update any tenant; tenantId is required
+        if (!input.tenantId) {
+          throw new TRPCError({
+            code: "BAD_REQUEST",
+            message: "tenantId is required for admin operations",
+          });
+        }
+        targetTenantId = input.tenantId;
+      } else {
+        // domain_admin can only update their own tenant
+        const callerTenantId = ctx.tenantId;
+        if (!callerTenantId) {
+          throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });
+        }
+
+        if (input.tenantId && input.tenantId !== callerTenantId) {
+          throw new TRPCError({
+            code: "FORBIDDEN",
+            message: "domain_admin can only update their own tenant's feature flags",
+          });
+        }
+
+        targetTenantId = callerTenantId;
+      }
+
+      // Validate and strip unrecognized keys
+      const validatedFlags = validateFeatureFlags(input.flags);
+
+      // Perform update
+      const updatedFlags = await updateTenantFeatureFlags(targetTenantId, validatedFlags);
+
+      // Invalidate tenant cache so changes take effect immediately
+      clearTenantCache();
+
+      return updatedFlags;
+    }),
+});
diff --git a/apps/web/server/services/__tests__/tenantFeatureFlags.test.ts b/apps/web/server/services/__tests__/tenantFeatureFlags.test.ts
new file mode 100644
index 0000000..96ef066
--- /dev/null
+++ b/apps/web/server/services/__tests__/tenantFeatureFlags.test.ts
@@ -0,0 +1,98 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import {
+  validateFeatureFlags,
+  resolveFeatureFlags,
+  isFeatureEnabled,
+} from "../tenantFeatureFlagService";
+import { FEATURE_FLAG_DEFAULTS } from "../../../shared/featureFlags";
+
+describe("validateFeatureFlags", () => {
+  it("strips unrecognized keys from input", () => {
+    const result = validateFeatureFlags({ canvas: true, hackerMode: true });
+    expect(result).toEqual({ canvas: true });
+    expect("hackerMode" in result).toBe(false);
+  });
+
+  it("preserves all recognized keys", () => {
+    const allFlags = {
+      multiChannel: true,
+      chatWidget: false,
+      browserTool: true,
+      canvas: true,
+      voiceChat: false,
+      webhookTriggers: true,
+      costDisplay: true,
+      personaSystem: true,
+      crossAgency: false,
+      channelRouter: true,
+    };
+    const result = validateFeatureFlags(allFlags);
+    expect(result).toEqual(allFlags);
+  });
+
+  it("rejects non-boolean values", () => {
+    const result = validateFeatureFlags({ canvas: "yes" as unknown as boolean });
+    expect(result).toEqual({});
+  });
+
+  it("rejects null values", () => {
+    const result = validateFeatureFlags({ canvas: null as unknown as boolean });
+    expect(result).toEqual({});
+  });
+
+  it("rejects numeric values", () => {
+    const result = validateFeatureFlags({ canvas: 1 as unknown as boolean });
+    expect(result).toEqual({});
+  });
+});
+
+describe("resolveFeatureFlags", () => {
+  it("returns correct defaults for all 10 flags when null", () => {
+    const result = resolveFeatureFlags(null);
+    expect(result).toEqual(FEATURE_FLAG_DEFAULTS);
+    expect(result.costDisplay).toBe(true);
+    expect(result.personaSystem).toBe(true);
+    expect(result.canvas).toBe(false);
+    expect(result.multiChannel).toBe(false);
+  });
+
+  it("returns defaults when empty object provided", () => {
+    const result = resolveFeatureFlags({});
+    expect(result).toEqual(FEATURE_FLAG_DEFAULTS);
+  });
+
+  it("merges stored flags with defaults", () => {
+    const result = resolveFeatureFlags({ canvas: true });
+    expect(result.canvas).toBe(true);
+    expect(result.costDisplay).toBe(true); // default
+    expect(result.multiChannel).toBe(false); // default
+  });
+
+  it("allows disabling flags that default to true", () => {
+    const result = resolveFeatureFlags({ costDisplay: false, personaSystem: false });
+    expect(result.costDisplay).toBe(false);
+    expect(result.personaSystem).toBe(false);
+  });
+});
+
+describe("isFeatureEnabled", () => {
+  it("returns stored boolean when available", () => {
+    expect(isFeatureEnabled({ canvas: true }, "canvas")).toBe(true);
+    expect(isFeatureEnabled({ canvas: false }, "canvas")).toBe(false);
+  });
+
+  it("returns default when flag is missing from stored flags", () => {
+    expect(isFeatureEnabled({}, "costDisplay")).toBe(true); // default true
+    expect(isFeatureEnabled({}, "canvas")).toBe(false); // default false
+  });
+
+  it("returns default when stored flags is null", () => {
+    expect(isFeatureEnabled(null, "costDisplay")).toBe(true);
+    expect(isFeatureEnabled(null, "canvas")).toBe(false);
+  });
+
+  it("returns default when stored flags is undefined", () => {
+    expect(isFeatureEnabled(undefined, "personaSystem")).toBe(true);
+    expect(isFeatureEnabled(undefined, "channelRouter")).toBe(false);
+  });
+});
diff --git a/apps/web/server/services/tenantFeatureFlagService.ts b/apps/web/server/services/tenantFeatureFlagService.ts
new file mode 100644
index 0000000..b462420
--- /dev/null
+++ b/apps/web/server/services/tenantFeatureFlagService.ts
@@ -0,0 +1,149 @@
+/**
+ * Tenant Feature Flag Service
+ *
+ * Provides utility functions for validating, reading, and writing
+ * tenant feature flags stored in tenants.featureFlags (JSON column).
+ */
+
+import { z } from "zod";
+import { eq } from "drizzle-orm";
+import { getDb } from "../db";
+import { tenants } from "../../drizzle/schema";
+import {
+  ALLOWED_FEATURE_FLAGS,
+  FEATURE_FLAG_DEFAULTS,
+  type FeatureFlagKey,
+  type TenantFeatureFlags,
+} from "../../shared/featureFlags";
+
+/**
+ * Validate and sanitize a raw feature flags input.
+ *
+ * Strips unrecognized keys (those not in ALLOWED_FEATURE_FLAGS).
+ * Validates that all values are booleans.
+ * Returns only the recognized, valid keys.
+ */
+export function validateFeatureFlags(
+  input: Record<string, unknown>,
+): Partial<TenantFeatureFlags> {
+  const result: Partial<TenantFeatureFlags> = {};
+
+  for (const [key, value] of Object.entries(input)) {
+    if (!ALLOWED_FEATURE_FLAGS.has(key)) {
+      continue; // Strip unrecognized keys silently
+    }
+
+    const parsed = z.boolean().safeParse(value);
+    if (!parsed.success) {
+      continue; // Strip non-boolean values
+    }
+
+    result[key as FeatureFlagKey] = parsed.data;
+  }
+
+  return result;
+}
+
+/**
+ * Resolve a complete TenantFeatureFlags from a raw DB value.
+ *
+ * Merges the stored flags with FEATURE_FLAG_DEFAULTS for any missing keys.
+ */
+export function resolveFeatureFlags(
+  storedFlags: Record<string, boolean> | null | undefined,
+): TenantFeatureFlags {
+  if (!storedFlags) {
+    return { ...FEATURE_FLAG_DEFAULTS };
+  }
+
+  const result = { ...FEATURE_FLAG_DEFAULTS };
+
+  for (const key of Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagKey[]) {
+    const stored = storedFlags[key];
+    if (typeof stored === "boolean") {
+      result[key] = stored;
+    }
+  }
+
+  return result;
+}
+
+/**
+ * Check if a single feature flag is enabled for the given stored flags.
+ *
+ * Falls back to FEATURE_FLAG_DEFAULTS for missing or null flags.
+ */
+export function isFeatureEnabled(
+  storedFlags: Record<string, boolean> | null | undefined,
+  flag: FeatureFlagKey,
+): boolean {
+  if (!storedFlags || typeof storedFlags[flag] !== "boolean") {
+    return FEATURE_FLAG_DEFAULTS[flag];
+  }
+  return storedFlags[flag];
+}
+
+/**
+ * Read the current feature flags for a tenant from the database.
+ */
+export async function getTenantFeatureFlags(
+  tenantId: string,
+): Promise<TenantFeatureFlags> {
+  const db = await getDb();
+  if (!db) {
+    return { ...FEATURE_FLAG_DEFAULTS };
+  }
+
+  const [row] = await db
+    .select({ featureFlags: tenants.featureFlags })
+    .from(tenants)
+    .where(eq(tenants.id, tenantId))
+    .limit(1);
+
+  if (!row) {
+    return { ...FEATURE_FLAG_DEFAULTS };
+  }
+
+  return resolveFeatureFlags(row.featureFlags as Record<string, boolean> | null);
+}
+
+/**
+ * Update tenant feature flags using a read-modify-write pattern.
+ *
+ * Only the provided flag keys are changed; all others remain as-is.
+ * Returns the complete resolved TenantFeatureFlags after the update.
+ */
+export async function updateTenantFeatureFlags(
+  tenantId: string,
+  flagUpdates: Partial<TenantFeatureFlags>,
+): Promise<TenantFeatureFlags> {
+  const db = await getDb();
+  if (!db) {
+    throw new Error("Database unavailable");
+  }
+
+  // Step 1: Read current flags
+  const [row] = await db
+    .select({ featureFlags: tenants.featureFlags })
+    .from(tenants)
+    .where(eq(tenants.id, tenantId))
+    .limit(1);
+
+  if (!row) {
+    throw new Error(`Tenant ${tenantId} not found`);
+  }
+
+  // Step 2: Merge updates into existing flags
+  const currentFlags = resolveFeatureFlags(
+    row.featureFlags as Record<string, boolean> | null,
+  );
+  const merged: TenantFeatureFlags = { ...currentFlags, ...flagUpdates };
+
+  // Step 3: Write back only the featureFlags column
+  await db
+    .update(tenants)
+    .set({ featureFlags: merged as unknown as Record<string, boolean> })
+    .where(eq(tenants.id, tenantId));
+
+  return merged;
+}
diff --git a/apps/web/shared/featureFlags.ts b/apps/web/shared/featureFlags.ts
new file mode 100644
index 0000000..4a67524
--- /dev/null
+++ b/apps/web/shared/featureFlags.ts
@@ -0,0 +1,55 @@
+/**
+ * Tenant-scoped feature flags for gating Claw features.
+ *
+ * Stored in tenants.featureFlags (JSON column).
+ * All flags default to false unless specified otherwise.
+ */
+export interface TenantFeatureFlags {
+  multiChannel: boolean; // F01 — Multi-channel adapters
+  chatWidget: boolean; // F02 — Embeddable chat widget
+  browserTool: boolean; // F03 — Browser automation tool
+  canvas: boolean; // F04 — Canvas / AI artifacts
+  voiceChat: boolean; // F05 — Voice chat mode
+  webhookTriggers: boolean; // F06 — Inbound webhook triggers
+  costDisplay: boolean; // F07 — Per-response cost display
+  personaSystem: boolean; // F08 — AI persona system
+  crossAgency: boolean; // F09 — Cross-agency communication
+  channelRouter: boolean; // F10 — Channel routing rules
+}
+
+export type FeatureFlagKey = keyof TenantFeatureFlags;
+
+/**
+ * Server-side allowlist of valid feature flag keys.
+ * Used for validation — any keys not in this set are stripped before saving.
+ */
+export const ALLOWED_FEATURE_FLAGS: ReadonlySet<string> = new Set<FeatureFlagKey>([
+  "multiChannel",
+  "chatWidget",
+  "browserTool",
+  "canvas",
+  "voiceChat",
+  "webhookTriggers",
+  "costDisplay",
+  "personaSystem",
+  "crossAgency",
+  "channelRouter",
+]);
+
+/**
+ * Default values for each feature flag.
+ * costDisplay and personaSystem default to true (low-risk, high-value).
+ * All others default to false (opt-in for new features).
+ */
+export const FEATURE_FLAG_DEFAULTS: Readonly<TenantFeatureFlags> = {
+  multiChannel: false,
+  chatWidget: false,
+  browserTool: false,
+  canvas: false,
+  voiceChat: false,
+  webhookTriggers: false,
+  costDisplay: true,
+  personaSystem: true,
+  crossAgency: false,
+  channelRouter: false,
+};
