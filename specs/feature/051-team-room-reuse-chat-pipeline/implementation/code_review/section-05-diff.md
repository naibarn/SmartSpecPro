diff --git a/apps/web/client/src/components/settings/NotificationPreferencesPanel.test.tsx b/apps/web/client/src/components/settings/NotificationPreferencesPanel.test.tsx
index c7c629de..360388ea 100644
--- a/apps/web/client/src/components/settings/NotificationPreferencesPanel.test.tsx
+++ b/apps/web/client/src/components/settings/NotificationPreferencesPanel.test.tsx
@@ -57,6 +57,24 @@ vi.mock("sonner", () => ({
   toast: { success: vi.fn(), error: vi.fn() },
 }));
 
+vi.mock("@tanstack/react-query", async () => {
+  const actual = await vi.importActual("@tanstack/react-query");
+  return {
+    ...actual,
+    useQuery: (opts: any) => {
+      // Mock the tenant feature flag query
+      if (opts.queryKey?.[0] === "tenant") {
+        return {
+          data: {
+            tenant: { featureFlags: { notificationPreferences: true } },
+          },
+        };
+      }
+      return { data: undefined };
+    },
+  };
+});
+
 const CATEGORIES = [
   "system_health", "media_jobs", "workflow", "skill",
   "feedback", "agency", "follow", "scheduled",
diff --git a/apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx b/apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx
index 424b2e01..9c0f96d8 100644
--- a/apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx
+++ b/apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx
@@ -5,6 +5,7 @@
  */
 
 import { useState } from "react";
+import { useQuery } from "@tanstack/react-query";
 import { trpc } from "@/lib/trpc";
 import { Button } from "@/components/ui/button";
 import { Switch } from "@/components/ui/switch";
@@ -116,13 +117,39 @@ function formatMutedUntil(mutedUntil: string | Date): string {
   return d.toLocaleString();
 }
 
+/**
+ * Check if notification preferences feature is enabled for the current tenant.
+ * Uses the tenant feature flags system — section-13 will add the formal
+ * `notificationPreferences` key to TenantFeatureFlags. Until then, the flag
+ * defaults to true (enabled) since the backend endpoints already exist.
+ */
+function useNotificationPreferencesEnabled(): boolean {
+  const { data } = useQuery({
+    queryKey: ["tenant", "current"],
+    queryFn: async () => {
+      const res = await fetch("/api/tenant/current");
+      if (!res.ok) return {};
+      return res.json();
+    },
+    staleTime: 60_000,
+    gcTime: 5 * 60_000,
+  });
+  const flags = data?.tenant?.featureFlags as Record<string, boolean> | undefined;
+  // Default to true — section-13 will add the formal flag
+  return flags?.notificationPreferences !== false;
+}
+
 export function NotificationPreferencesPanel() {
+  const isEnabled = useNotificationPreferencesEnabled();
   const utils = trpc.useUtils();
   const [mutatingCategories, setMutatingCategories] = useState<Set<string>>(
     new Set(),
   );
 
-  const prefsQuery = trpc.notificationPreferences.getPreferences.useQuery();
+  const prefsQuery = trpc.notificationPreferences.getPreferences.useQuery(
+    undefined,
+    { enabled: isEnabled },
+  );
 
   const upsertMutation =
     trpc.notificationPreferences.upsertPreference.useMutation({
@@ -232,6 +259,21 @@ export function NotificationPreferencesPanel() {
     snoozeMutation.mutate({ category, mutedUntil: null });
   }
 
+  if (!isEnabled) {
+    return (
+      <div className="space-y-6">
+        <div>
+          <h2 className="text-2xl font-bold text-gray-900 mb-2">
+            Notification Preferences
+          </h2>
+          <p className="text-gray-600">
+            Notification preferences are not yet enabled for your organization.
+          </p>
+        </div>
+      </div>
+    );
+  }
+
   if (prefsQuery.isLoading) {
     return (
       <div className="space-y-6">
diff --git a/apps/web/client/src/pages/AdminAlertRules.tsx b/apps/web/client/src/pages/AdminAlertRules.tsx
index df211124..5a4e6b56 100644
--- a/apps/web/client/src/pages/AdminAlertRules.tsx
+++ b/apps/web/client/src/pages/AdminAlertRules.tsx
@@ -275,42 +275,48 @@ function AlertRulesTab() {
       )}
 
       {/* Create Dialog */}
-      <AlertRuleFormDialog
-        open={isCreateOpen}
-        onOpenChange={setIsCreateOpen}
-        title="Create Alert Rule"
-        onSubmit={(data) => {
-          const payload = {
-            ...data,
-            targetUserId:
-              typeof data.targetUserId === "number"
-                ? data.targetUserId
-                : undefined,
-          };
-          createMutation.mutate(payload as any);
-        }}
-        isLoading={createMutation.isPending}
-      />
+      {isCreateOpen && (
+        <AlertRuleFormDialog
+          key="create-rule"
+          open={isCreateOpen}
+          onOpenChange={setIsCreateOpen}
+          title="Create Alert Rule"
+          onSubmit={(data) => {
+            const payload = {
+              ...data,
+              targetUserId:
+                typeof data.targetUserId === "number"
+                  ? data.targetUserId
+                  : undefined,
+            };
+            createMutation.mutate(payload as any);
+          }}
+          isLoading={createMutation.isPending}
+        />
+      )}
 
       {/* Edit Dialog */}
-      <AlertRuleFormDialog
-        open={!!editingRule}
-        onOpenChange={(open) => !open && setEditingRule(null)}
-        title="Edit Alert Rule"
-        defaultValues={editingRule}
-        onSubmit={(data) => {
-          const payload = {
-            id: editingRule!.id,
-            ...data,
-            targetUserId:
-              typeof data.targetUserId === "number"
-                ? data.targetUserId
-                : undefined,
-          };
-          updateMutation.mutate(payload as any);
-        }}
-        isLoading={updateMutation.isPending}
-      />
+      {editingRule && (
+        <AlertRuleFormDialog
+          key={`edit-rule-${editingRule.id}`}
+          open={!!editingRule}
+          onOpenChange={(open) => !open && setEditingRule(null)}
+          title="Edit Alert Rule"
+          defaultValues={editingRule}
+          onSubmit={(data) => {
+            const payload = {
+              id: editingRule!.id,
+              ...data,
+              targetUserId:
+                typeof data.targetUserId === "number"
+                  ? data.targetUserId
+                  : undefined,
+            };
+            updateMutation.mutate(payload as any);
+          }}
+          isLoading={updateMutation.isPending}
+        />
+      )}
 
       {/* Delete Confirmation */}
       <AlertDialog
@@ -520,7 +526,7 @@ function AlertRuleFormDialog({
             <Label>Channels *</Label>
             <div className="flex gap-3 mt-1">
               {CHANNELS.map((ch) => {
-                const channelValues = form.watch("channels") ?? [];
+                const channelValues = form.getValues("channels") ?? [];
                 return (
                   <label
                     key={ch}
@@ -777,44 +783,50 @@ function EscalationPoliciesTab() {
       )}
 
       {/* Create Dialog */}
-      <EscalationPolicyFormDialog
-        open={isCreateOpen}
-        onOpenChange={setIsCreateOpen}
-        title="Create Escalation Policy"
-        onSubmit={(data) => {
-          const payload = {
-            ...data,
-            escalateToUserId:
-              typeof data.escalateToUserId === "number"
-                ? data.escalateToUserId
-                : undefined,
-            escalateToRole: data.escalateToRole || undefined,
-          };
-          createMutation.mutate(payload as any);
-        }}
-        isLoading={createMutation.isPending}
-      />
+      {isCreateOpen && (
+        <EscalationPolicyFormDialog
+          key="create-policy"
+          open={isCreateOpen}
+          onOpenChange={setIsCreateOpen}
+          title="Create Escalation Policy"
+          onSubmit={(data) => {
+            const payload = {
+              ...data,
+              escalateToUserId:
+                typeof data.escalateToUserId === "number"
+                  ? data.escalateToUserId
+                  : undefined,
+              escalateToRole: data.escalateToRole || undefined,
+            };
+            createMutation.mutate(payload as any);
+          }}
+          isLoading={createMutation.isPending}
+        />
+      )}
 
       {/* Edit Dialog */}
-      <EscalationPolicyFormDialog
-        open={!!editingPolicy}
-        onOpenChange={(open) => !open && setEditingPolicy(null)}
-        title="Edit Escalation Policy"
-        defaultValues={editingPolicy}
-        onSubmit={(data) => {
-          const payload = {
-            id: editingPolicy!.id,
-            ...data,
-            escalateToUserId:
-              typeof data.escalateToUserId === "number"
-                ? data.escalateToUserId
-                : undefined,
-            escalateToRole: data.escalateToRole || undefined,
-          };
-          updateMutation.mutate(payload as any);
-        }}
-        isLoading={updateMutation.isPending}
-      />
+      {editingPolicy && (
+        <EscalationPolicyFormDialog
+          key={`edit-policy-${editingPolicy.id}`}
+          open={!!editingPolicy}
+          onOpenChange={(open) => !open && setEditingPolicy(null)}
+          title="Edit Escalation Policy"
+          defaultValues={editingPolicy}
+          onSubmit={(data) => {
+            const payload = {
+              id: editingPolicy!.id,
+              ...data,
+              escalateToUserId:
+                typeof data.escalateToUserId === "number"
+                  ? data.escalateToUserId
+                  : undefined,
+              escalateToRole: data.escalateToRole || undefined,
+            };
+            updateMutation.mutate(payload as any);
+          }}
+          isLoading={updateMutation.isPending}
+        />
+      )}
 
       {/* Delete Confirmation */}
       <AlertDialog
@@ -992,7 +1004,7 @@ function EscalationPolicyFormDialog({
             <Label>Channels *</Label>
             <div className="flex gap-3 mt-1">
               {CHANNELS.map((ch) => {
-                const channelValues = form.watch("escalateChannels") ?? [];
+                const channelValues = form.getValues("escalateChannels") ?? [];
                 return (
                   <label
                     key={ch}
diff --git a/apps/web/drizzle/0105_stop_legacy_team_runs.sql b/apps/web/drizzle/0105_stop_legacy_team_runs.sql
new file mode 100644
index 00000000..83418aa3
--- /dev/null
+++ b/apps/web/drizzle/0105_stop_legacy_team_runs.sql
@@ -0,0 +1,10 @@
+-- Migration 051: Stop legacy team runs that used the old Python-bridge pipeline.
+-- These runs cannot continue under the new Node.js-only pipeline.
+-- Time-bound guard (MED-1): only stop runs started more than 5 minutes ago
+-- to avoid stopping newly created runs during staggered deployment.
+UPDATE team_runs
+SET status = 'stopped',
+    "stopReason" = 'system_migration_051',
+    "endedAt" = NOW()
+WHERE status IN ('running', 'paused')
+  AND "startedAt" < NOW() - INTERVAL '5 minutes';
diff --git a/apps/web/drizzle/meta/_journal.json b/apps/web/drizzle/meta/_journal.json
index c36f84b9..94fae968 100644
--- a/apps/web/drizzle/meta/_journal.json
+++ b/apps/web/drizzle/meta/_journal.json
@@ -736,6 +736,13 @@
       "when": 1774034015155,
       "tag": "0104_mean_power_man",
       "breakpoints": true
+    },
+    {
+      "idx": 105,
+      "version": "7",
+      "when": 1774256850000,
+      "tag": "0105_stop_legacy_team_runs",
+      "breakpoints": true
     }
   ]
 }
\ No newline at end of file
diff --git a/apps/web/server/services/__tests__/internalSkills.cleanup.test.ts b/apps/web/server/services/__tests__/internalSkills.cleanup.test.ts
new file mode 100644
index 00000000..e32bbc06
--- /dev/null
+++ b/apps/web/server/services/__tests__/internalSkills.cleanup.test.ts
@@ -0,0 +1,29 @@
+import { describe, it, expect } from "vitest";
+import * as fs from "node:fs";
+import * as path from "node:path";
+import {
+  getInternalSkillDefinitions,
+  isInternalSkillId,
+} from "../internalSkills";
+
+describe("internalSkills — post-migration", () => {
+  it("should return empty array from getInternalSkillDefinitions()", () => {
+    expect(getInternalSkillDefinitions()).toEqual([]);
+  });
+
+  it("should return false from isInternalSkillId for team-discussion-assistant", () => {
+    expect(isInternalSkillId("team-discussion-assistant")).toBe(false);
+  });
+
+  it("should return false from isInternalSkillId for any string", () => {
+    expect(isInternalSkillId("some-skill")).toBe(false);
+    expect(isInternalSkillId("")).toBe(false);
+  });
+
+  it("should not export TEAM_DISCUSSION_SKILL_ID", () => {
+    const sourceFile = path.resolve(__dirname, "../internalSkills.ts");
+    const source = fs.readFileSync(sourceFile, "utf-8");
+    expect(source).not.toContain("TEAM_DISCUSSION_SKILL_ID");
+    expect(source).not.toContain("team-discussion-assistant");
+  });
+});
diff --git a/apps/web/server/services/__tests__/roomIntentRouter.test.ts b/apps/web/server/services/__tests__/roomIntentRouter.test.ts
index 308e78c2..8bca5496 100644
--- a/apps/web/server/services/__tests__/roomIntentRouter.test.ts
+++ b/apps/web/server/services/__tests__/roomIntentRouter.test.ts
@@ -1,5 +1,5 @@
 import { beforeEach, describe, expect, it, vi } from "vitest";
-import { TEAM_DISCUSSION_SKILL_ID } from "../internalSkills";
+import { FALLBACK_CONTENT_SKILL_ID } from "../roomIntentRouter";
 
 vi.mock("../skillDetector", () => ({
   detectSkill: vi.fn(),
@@ -49,7 +49,7 @@ describe("roomIntentRouter", () => {
     // detectSkill IS called for assistant origin (skill detection runs for all origins)
     expect(mockDetectSkill).toHaveBeenCalledTimes(1);
     // selectedSkillId should NOT be team-discussion-assistant
-    expect(decision.selectedSkillId).not.toBe(TEAM_DISCUSSION_SKILL_ID);
+    expect(decision.selectedSkillId).toBe(FALLBACK_CONTENT_SKILL_ID);
     expect(mockClassifyIntent).not.toHaveBeenCalled();
   });
 
diff --git a/apps/web/server/services/__tests__/runEngine.migration.test.ts b/apps/web/server/services/__tests__/runEngine.migration.test.ts
new file mode 100644
index 00000000..ba9b4991
--- /dev/null
+++ b/apps/web/server/services/__tests__/runEngine.migration.test.ts
@@ -0,0 +1,129 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import * as fs from "node:fs";
+import * as path from "node:path";
+
+// Mock db module before imports
+const mockUpdate = vi.fn();
+const mockSet = vi.fn();
+const mockWhere = vi.fn();
+const mockSelect = vi.fn();
+const mockFrom = vi.fn();
+
+vi.mock("../../db", () => ({
+  getDb: vi.fn(() => ({
+    update: mockUpdate,
+    select: mockSelect,
+  })),
+}));
+
+// Mock schema imports
+vi.mock("../../../drizzle/schema", () => ({
+  teamRuns: { id: "id", status: "status", stopReason: "stopReason", endedAt: "endedAt", roomId: "roomId", executionMode: "executionMode", startedAt: "startedAt" },
+  teamRooms: { id: "id", tenantId: "tenantId" },
+  teamRoomMessages: {},
+  assistantProfiles: {},
+  agentActivityEvents: { runId: "runId", eventType: "eventType", createdAt: "createdAt" },
+  agentRunSummaries: {},
+  teamWorkItems: {},
+  personaTemplates: {},
+  agencyAgents: {},
+}));
+
+// Mock drizzle-orm
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
+  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
+  sql: vi.fn(),
+  count: vi.fn(),
+  desc: vi.fn(),
+  inArray: vi.fn((...args: unknown[]) => ({ type: "inArray", args })),
+  or: vi.fn((...args: unknown[]) => ({ type: "or", args })),
+}));
+
+// Mock other imports used by runEngine
+vi.mock("../turnOrderEngine", () => ({
+  getCoordinatorProfile: vi.fn(),
+  getNextSpeaker: vi.fn(),
+}));
+vi.mock("../workItemService", () => ({}));
+vi.mock("../roomService", () => ({}));
+vi.mock("../monitoringService", () => ({}));
+
+describe("migration — stop old runs", () => {
+  it("should have migration SQL file for stopping legacy team runs", () => {
+    const migrationDir = path.resolve(__dirname, "../../../drizzle");
+    const files = fs.readdirSync(migrationDir);
+    const migrationFile = files.find(
+      (f) => f.includes("stop_legacy_team_runs") && f.endsWith(".sql"),
+    );
+    expect(migrationFile).toBeDefined();
+  });
+
+  it("migration SQL should target running and paused statuses", () => {
+    const migrationDir = path.resolve(__dirname, "../../../drizzle");
+    const files = fs.readdirSync(migrationDir);
+    const migrationFile = files.find(
+      (f) => f.includes("stop_legacy_team_runs") && f.endsWith(".sql"),
+    );
+    expect(migrationFile).toBeDefined();
+    const sql = fs.readFileSync(
+      path.join(migrationDir, migrationFile!),
+      "utf-8",
+    );
+    expect(sql).toContain("running");
+    expect(sql).toContain("paused");
+    expect(sql).toContain("system_migration_051");
+    expect(sql).toContain("stopped");
+  });
+
+  it("migration SQL should include time-bound guard", () => {
+    const migrationDir = path.resolve(__dirname, "../../../drizzle");
+    const files = fs.readdirSync(migrationDir);
+    const migrationFile = files.find(
+      (f) => f.includes("stop_legacy_team_runs") && f.endsWith(".sql"),
+    );
+    expect(migrationFile).toBeDefined();
+    const sql = fs.readFileSync(
+      path.join(migrationDir, migrationFile!),
+      "utf-8",
+    );
+    // MED-1: time-bound guard to prevent stopping newly created runs
+    expect(sql).toContain("INTERVAL");
+  });
+
+  it("should not affect already stopped or completed runs", () => {
+    const migrationDir = path.resolve(__dirname, "../../../drizzle");
+    const files = fs.readdirSync(migrationDir);
+    const migrationFile = files.find(
+      (f) => f.includes("stop_legacy_team_runs") && f.endsWith(".sql"),
+    );
+    expect(migrationFile).toBeDefined();
+    const sql = fs.readFileSync(
+      path.join(migrationDir, migrationFile!),
+      "utf-8",
+    );
+    // WHERE clause only targets running/paused — extract WHERE clause and verify
+    const whereClause = sql.split(/WHERE/i)[1] ?? "";
+    expect(whereClause).toContain("running");
+    expect(whereClause).toContain("paused");
+    // WHERE should not target stopped/completed/failed directly
+    expect(whereClause).not.toMatch(/IN\s*\([^)]*'stopped'/);
+    expect(whereClause).not.toMatch(/IN\s*\([^)]*'completed'/);
+    expect(whereClause).not.toMatch(/IN\s*\([^)]*'failed'/);
+  });
+});
+
+describe("migration — journal entry", () => {
+  it("should have journal entry for the migration", () => {
+    const journalPath = path.resolve(
+      __dirname,
+      "../../../drizzle/meta/_journal.json",
+    );
+    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
+    const entry = journal.entries.find((e: { tag: string }) =>
+      e.tag.includes("stop_legacy_team_runs"),
+    );
+    expect(entry).toBeDefined();
+    expect(entry.version).toBe("7");
+  });
+});
diff --git a/apps/web/server/services/__tests__/runEngine.test.ts b/apps/web/server/services/__tests__/runEngine.test.ts
index 02b1d350..b2c1822b 100644
--- a/apps/web/server/services/__tests__/runEngine.test.ts
+++ b/apps/web/server/services/__tests__/runEngine.test.ts
@@ -37,6 +37,126 @@ describe("RunEngine", () => {
       expect(runEngine.DEFAULT_STOP_POLICY.maxBudgetCredits).toBe(100);
       expect(runEngine.DEFAULT_STOP_POLICY.idleTimeoutSeconds).toBe(120);
     });
+
+    it("derives a stable kickoff work item title from the run objective", () => {
+      expect(runEngine.deriveInitialWorkItemTitle("Research the latest solar market updates")).toBe(
+        "Kickoff: Research the latest solar market updates",
+      );
+    });
+
+    it("maps execution modes to turn strategies", () => {
+      expect(runEngine.mapExecutionModeToTurnStrategy("auto_team")).toBe("lead_directed");
+      expect(runEngine.mapExecutionModeToTurnStrategy("team_chat")).toBe("handoff");
+      expect(runEngine.mapExecutionModeToTurnStrategy("review")).toBe("priority");
+    });
+
+    it("continues the auto-team loop only when a running auto_team made progress", () => {
+      expect(runEngine.shouldContinueAutoTeamLoop({
+        runStatus: "running",
+        executionMode: "auto_team",
+        completedTurns: 1,
+        shouldStop: false,
+      })).toBe(true);
+
+      expect(runEngine.shouldContinueAutoTeamLoop({
+        runStatus: "paused",
+        executionMode: "auto_team",
+        completedTurns: 1,
+        shouldStop: false,
+      })).toBe(false);
+
+      expect(runEngine.shouldContinueAutoTeamLoop({
+        runStatus: "running",
+        executionMode: "team_chat",
+        completedTurns: 1,
+        shouldStop: false,
+      })).toBe(false);
+
+      expect(runEngine.shouldContinueAutoTeamLoop({
+        runStatus: "running",
+        executionMode: "auto_team",
+        completedTurns: 0,
+        shouldStop: false,
+      })).toBe(false);
+
+      expect(runEngine.shouldContinueAutoTeamLoop({
+        runStatus: "running",
+        executionMode: "auto_team",
+        completedTurns: 1,
+        shouldStop: true,
+      })).toBe(false);
+    });
+
+    it("keeps looping when assistant-owned work remains actionable", () => {
+      expect(runEngine.evaluateAutoTeamLoopDecision({
+        runStatus: "running",
+        executionMode: "auto_team",
+        completedTurns: 1,
+        shouldStop: false,
+        openWorkItems: [
+          {
+            status: "in_progress",
+            assignedMemberKind: "assistant",
+          },
+        ],
+      })).toEqual({
+        continueLoop: true,
+        pauseRun: false,
+        reason: null,
+      });
+    });
+
+    it("auto-pauses when only human approval remains", () => {
+      expect(runEngine.evaluateAutoTeamLoopDecision({
+        runStatus: "running",
+        executionMode: "auto_team",
+        completedTurns: 1,
+        shouldStop: false,
+        openWorkItems: [
+          {
+            status: "awaiting_approval",
+            approverMemberKind: "human",
+          },
+        ],
+      })).toEqual({
+        continueLoop: false,
+        pauseRun: true,
+        reason: "awaiting_human_approval",
+      });
+    });
+
+    it("auto-pauses when only external connector work remains", () => {
+      expect(runEngine.evaluateAutoTeamLoopDecision({
+        runStatus: "running",
+        executionMode: "auto_team",
+        completedTurns: 1,
+        shouldStop: false,
+        openWorkItems: [
+          {
+            status: "awaiting_approval",
+            approverMemberKind: "external_connector",
+          },
+        ],
+      })).toEqual({
+        continueLoop: false,
+        pauseRun: true,
+        reason: "awaiting_external_member",
+      });
+    });
+
+    it("stops queueing more turns when no actionable work is left", () => {
+      expect(runEngine.evaluateAutoTeamLoopDecision({
+        runStatus: "running",
+        executionMode: "auto_team",
+        completedTurns: 1,
+        shouldStop: false,
+        openWorkItems: [],
+      })).toEqual({
+        continueLoop: false,
+        pauseRun: false,
+        reason: "no_actionable_work_items",
+      });
+    });
   });
 
   describe("evaluateStopConditions (pure function)", () => {
diff --git a/apps/web/server/services/internalSkills.ts b/apps/web/server/services/internalSkills.ts
index 3d2c0e9e..9d9f10b4 100644
--- a/apps/web/server/services/internalSkills.ts
+++ b/apps/web/server/services/internalSkills.ts
@@ -1,41 +1,9 @@
 import type { SkillDefinition } from "@smartspec/skills";
 
-export const TEAM_DISCUSSION_SKILL_ID = "team-discussion-assistant";
-
-const TEAM_DISCUSSION_SYSTEM_PROMPT = [
-  "You are a virtual collaborator inside a multi-agent team room.",
-  "Your job is to help other assistants coordinate work, clarify the objective, synthesize progress, and propose the next best step.",
-  "Treat the conversation as agent-to-agent discussion, not human customer support.",
-  "Be concise, actionable, and role-aware.",
-  "When a discussion should become a multi-step workflow, say so explicitly and recommend escalation.",
-  "When there is a clear next action, state it directly.",
-].join(" ");
-
-const TEAM_DISCUSSION_SKILL: SkillDefinition = {
-  id: TEAM_DISCUSSION_SKILL_ID,
-  name: "Team Discussion Assistant",
-  description: "Internal team-room discussion skill for assistant-to-assistant coordination.",
-  icon: "bot",
-  type: "chat-assistant",
-  category: "team_orchestration",
-  triggers: [],
-  requiresExplicit: true,
-  creditMultiplier: 1,
-  enabledByDefault: false,
-  priority: 999,
-  internalOnly: true,
-  surfaceScopes: ["team_room", "team_run", "agency"],
-  interactionModes: ["agent_to_agent", "work_item"],
-  teamRunEligible: true,
-  systemPrompt: TEAM_DISCUSSION_SYSTEM_PROMPT,
-  skillContent: TEAM_DISCUSSION_SYSTEM_PROMPT,
-  executionMode: "llm-only",
-};
-
 export function getInternalSkillDefinitions(): SkillDefinition[] {
-  return [TEAM_DISCUSSION_SKILL];
+  return [];
 }
 
-export function isInternalSkillId(skillId: string): boolean {
-  return skillId === TEAM_DISCUSSION_SKILL_ID;
+export function isInternalSkillId(_skillId: string): boolean {
+  return false;
 }
diff --git a/apps/web/server/services/runEngine.ts b/apps/web/server/services/runEngine.ts
index 88f2143b..cae00335 100644
--- a/apps/web/server/services/runEngine.ts
+++ b/apps/web/server/services/runEngine.ts
@@ -24,7 +24,6 @@ import { getCoordinatorProfile } from "./turnOrderEngine";
 import * as workItemService from "./workItemService";
 import * as roomService from "./roomService";
 import * as monitoringService from "./monitoringService";
-import type { PromptMessage } from "./promptComposer";
 import { agencyAgents, personaTemplates } from "../../drizzle/schema";
 import { getNextSpeaker, type TurnStrategy } from "./turnOrderEngine";
 import type { WorkItemStatus } from "./workItemService";
@@ -138,15 +137,6 @@ export function mapExecutionModeToTurnStrategy(
   }
 }
 
-export function formatPromptMessagesForAgent(messages: PromptMessage[]): string {
-  return messages
-    .map((message) => {
-      const label = message.role.toUpperCase();
-      return `[${label}]\n${message.content}`.trim();
-    })
-    .join("\n\n");
-}
-
 export function shouldContinueAutoTeamLoop(params: {
   runStatus: TeamRun["status"] | "idle";
   executionMode: StartRunInput["executionMode"] | TeamRun["executionMode"];
@@ -1300,6 +1290,30 @@ export async function recoverActiveRunsOnStartup(): Promise<void> {
   const db = await getDb();
   if (!db) throw new Error("Database not available");
 
+  // Safety net: stop legacy runs from the pre-migration Python-bridge pipeline.
+  // This catches any runs missed by the 0105 SQL migration (e.g. manual deploy without migration).
+  const legacyRuns = await db
+    .update(teamRuns)
+    .set({
+      status: "stopped",
+      stopReason: "system_migration_051",
+      endedAt: new Date(),
+    })
+    .where(
+      and(
+        inArray(teamRuns.status, ["running", "paused"]),
+        sql`${teamRuns.stopReason} IS NULL`,
+        sql`${teamRuns.startedAt} < NOW() - INTERVAL '5 minutes'`,
+      ),
+    )
+    .returning({ id: teamRuns.id });
+
+  if (legacyRuns.length > 0) {
+    console.log(
+      `[RunRecovery] Stopped ${legacyRuns.length} legacy runs from pre-migration pipeline`,
+    );
+  }
+
   const activeRuns = await db
     .select({
       runId: teamRuns.id,
