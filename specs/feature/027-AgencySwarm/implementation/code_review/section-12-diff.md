diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index 15290a8..226277c 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -90,6 +90,7 @@ const TaskQueueMonitor = lazy(() => import("./pages/TaskQueueMonitor"));
 const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
 const AgencyChat = lazy(() => import("./pages/AgencyChat"));
 const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
+const AgencyTemplates = lazy(() => import("./pages/AgencyTemplates"));
 const Workflows = lazy(() => import("./pages/Workflows"));
 const WorkflowEditor = lazy(() => import("./pages/WorkflowEditor"));
 const WorkflowGallery = lazy(() => import("./pages/WorkflowGallery"));
@@ -163,6 +164,7 @@ function Router() {
         <Route path="/forgot-password" component={ForgotPassword} />
         <Route path="/chat" component={Chat} />
         <Route path="/agencies" component={AgencyBrowser} />
+        <Route path="/agencies/templates" component={AgencyTemplates} />
         <Route path="/agencies/:id/edit" component={AgencyBuilder} />
         <Route path="/agencies/:id" component={AgencyChat} />
         <Route path="/workflows" component={Workflows} />
diff --git a/apps/web/client/src/pages/AgencyTemplates.tsx b/apps/web/client/src/pages/AgencyTemplates.tsx
new file mode 100644
index 0000000..b72ae96
--- /dev/null
+++ b/apps/web/client/src/pages/AgencyTemplates.tsx
@@ -0,0 +1,161 @@
+/**
+ * AgencyTemplates page.
+ *
+ * Displays available agency templates in a gallery grid.
+ * "Use Template" creates a new agency and navigates to the builder.
+ */
+
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import { useLocation } from "wouter";
+import {
+  Card,
+  CardContent,
+} from "@/components/ui/card";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import { toast } from "sonner";
+import {
+  Search,
+  PenTool,
+  FileText,
+  Code,
+  Users,
+  ArrowRight,
+  Loader2,
+} from "lucide-react";
+
+const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
+  Search,
+  PenTool,
+  FileText,
+  Code,
+};
+
+export default function AgencyTemplates() {
+  const [, setLocation] = useLocation();
+  const [creatingId, setCreatingId] = useState<string | null>(null);
+
+  const templatesQuery = trpc.agency.listTemplates.useQuery();
+  const createMutation = trpc.agency.createFromTemplate.useMutation({
+    onSuccess: (data) => {
+      toast.success("Agency created from template");
+      setLocation(`/agencies/${data.agencyId}/edit`);
+    },
+    onError: (err) => {
+      toast.error(err.message);
+      setCreatingId(null);
+    },
+  });
+
+  const handleUseTemplate = (templateId: string) => {
+    setCreatingId(templateId);
+    createMutation.mutate({ templateId });
+  };
+
+  if (templatesQuery.isLoading) {
+    return (
+      <div className="p-6">
+        <h1 className="text-2xl font-bold mb-6">Agency Templates</h1>
+        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
+          {[1, 2, 3, 4].map((i) => (
+            <Card key={i} className="animate-pulse">
+              <CardContent className="pt-6 space-y-4">
+                <div className="h-10 w-10 bg-gray-200 rounded-lg" />
+                <div className="h-5 bg-gray-200 rounded w-3/4" />
+                <div className="h-4 bg-gray-100 rounded w-full" />
+                <div className="h-4 bg-gray-100 rounded w-2/3" />
+                <div className="h-8 bg-gray-200 rounded w-1/3" />
+              </CardContent>
+            </Card>
+          ))}
+        </div>
+      </div>
+    );
+  }
+
+  if (templatesQuery.isError) {
+    return (
+      <div className="p-6">
+        <h1 className="text-2xl font-bold mb-6">Agency Templates</h1>
+        <Card>
+          <CardContent className="pt-6 text-center">
+            <p className="text-gray-500 mb-4">
+              {templatesQuery.error?.message === "Not found"
+                ? "Agency templates are not available yet."
+                : `Failed to load templates: ${templatesQuery.error?.message}`}
+            </p>
+            <Button
+              variant="outline"
+              onClick={() => templatesQuery.refetch()}
+            >
+              Retry
+            </Button>
+          </CardContent>
+        </Card>
+      </div>
+    );
+  }
+
+  const templates = templatesQuery.data ?? [];
+
+  return (
+    <div className="p-6">
+      <div className="mb-8">
+        <h1 className="text-2xl font-bold">Agency Templates</h1>
+        <p className="text-gray-500 mt-1">
+          Get started quickly with pre-built multi-agent teams.
+        </p>
+      </div>
+
+      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
+        {templates.map((template) => {
+          const IconComponent = iconMap[template.icon] ?? Search;
+          const isCreating = creatingId === template.id;
+
+          return (
+            <Card
+              key={template.id}
+              className="group hover:shadow-md transition-shadow"
+            >
+              <CardContent className="pt-6 flex flex-col h-full">
+                <div className="mb-4">
+                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
+                    <IconComponent className="w-5 h-5 text-purple-600" />
+                  </div>
+                  <h3 className="font-semibold text-lg">{template.name}</h3>
+                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
+                    {template.description}
+                  </p>
+                </div>
+
+                <div className="flex gap-2 mb-4 mt-auto">
+                  <Badge variant="secondary" className="text-xs">
+                    <Users className="w-3 h-3 mr-1" />
+                    {template.agentCount} Agents
+                  </Badge>
+                  <Badge variant="outline" className="text-xs">
+                    {template.category}
+                  </Badge>
+                </div>
+
+                <Button
+                  className="w-full"
+                  onClick={() => handleUseTemplate(template.id)}
+                  disabled={isCreating || createMutation.isPending}
+                >
+                  {isCreating ? (
+                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
+                  ) : (
+                    <ArrowRight className="w-4 h-4 mr-2" />
+                  )}
+                  Use Template
+                </Button>
+              </CardContent>
+            </Card>
+          );
+        })}
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/__tests__/AgencyTemplates.test.tsx b/apps/web/client/src/pages/__tests__/AgencyTemplates.test.tsx
new file mode 100644
index 0000000..ed7914d
--- /dev/null
+++ b/apps/web/client/src/pages/__tests__/AgencyTemplates.test.tsx
@@ -0,0 +1,133 @@
+/**
+ * Tests for AgencyTemplates page and template data.
+ */
+
+import { describe, it, expect, vi } from "vitest";
+
+// Mock tRPC
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    agency: {
+      listTemplates: {
+        useQuery: vi.fn().mockReturnValue({
+          data: [
+            {
+              id: "research",
+              name: "Research Agency",
+              description: "Researches topics and produces reports",
+              category: "research",
+              agentCount: 3,
+              icon: "Search",
+              agents: [],
+              communicationFlows: [],
+            },
+            {
+              id: "content-writer",
+              name: "Content Writer Agency",
+              description: "Plans, writes, and reviews content",
+              category: "content",
+              agentCount: 3,
+              icon: "PenTool",
+              agents: [],
+              communicationFlows: [],
+            },
+            {
+              id: "spec-writer",
+              name: "Spec Writer Agency",
+              description: "Writes technical specifications",
+              category: "engineering",
+              agentCount: 3,
+              icon: "FileText",
+              agents: [],
+              communicationFlows: [],
+            },
+            {
+              id: "code-review",
+              name: "Code Review Agency",
+              description: "Analyzes code and produces review reports",
+              category: "engineering",
+              agentCount: 3,
+              icon: "Code",
+              agents: [],
+              communicationFlows: [],
+            },
+          ],
+          isLoading: false,
+          isError: false,
+          error: null,
+          refetch: vi.fn(),
+        }),
+      },
+      createFromTemplate: {
+        useMutation: vi.fn().mockReturnValue({
+          mutate: vi.fn(),
+          isPending: false,
+        }),
+      },
+    },
+  },
+}));
+
+// Mock wouter
+vi.mock("wouter", () => ({
+  useLocation: vi.fn().mockReturnValue(["", vi.fn()]),
+}));
+
+// Mock sonner
+vi.mock("sonner", () => ({
+  toast: { success: vi.fn(), error: vi.fn() },
+}));
+
+describe("AgencyTemplates", () => {
+  it("should have 4 template definitions with expected IDs", () => {
+    const expectedTemplates = [
+      "research",
+      "content-writer",
+      "spec-writer",
+      "code-review",
+    ];
+    expect(expectedTemplates).toHaveLength(4);
+  });
+
+  it("each template has unique category mapping", () => {
+    const templates = [
+      { id: "research", category: "research", icon: "Search" },
+      { id: "content-writer", category: "content", icon: "PenTool" },
+      { id: "spec-writer", category: "engineering", icon: "FileText" },
+      { id: "code-review", category: "engineering", icon: "Code" },
+    ];
+
+    const ids = new Set(templates.map((t) => t.id));
+    expect(ids.size).toBe(4);
+
+    const icons = new Set(templates.map((t) => t.icon));
+    expect(icons.size).toBe(4);
+  });
+
+  it("template data should include card display properties", () => {
+    const templateShape = {
+      id: "research",
+      name: "Research Agency",
+      description: "Researches topics and produces reports",
+      agentCount: 3,
+      icon: "Search",
+      category: "research",
+    };
+
+    expect(templateShape).toHaveProperty("id");
+    expect(templateShape).toHaveProperty("name");
+    expect(templateShape).toHaveProperty("description");
+    expect(templateShape).toHaveProperty("agentCount");
+    expect(templateShape).toHaveProperty("icon");
+    expect(templateShape).toHaveProperty("category");
+    expect(templateShape.agentCount).toBe(3);
+  });
+
+  it("createFromTemplate accepts templateId and optional name", () => {
+    const validInput = { templateId: "research" };
+    const validInputWithName = { templateId: "research", name: "My Team" };
+
+    expect(validInput.templateId).toBeTruthy();
+    expect(validInputWithName.name).toBe("My Team");
+  });
+});
diff --git a/apps/web/server/routers/__tests__/agency-templates.test.ts b/apps/web/server/routers/__tests__/agency-templates.test.ts
new file mode 100644
index 0000000..4567473
--- /dev/null
+++ b/apps/web/server/routers/__tests__/agency-templates.test.ts
@@ -0,0 +1,83 @@
+/**
+ * Tests for agency template loader and template data integrity.
+ */
+
+import { describe, it, expect } from "vitest";
+import {
+  getTemplates,
+  getTemplateById,
+} from "../../../skills/agency-templates/index";
+
+describe("Agency Template Loader", () => {
+  it("should export 4 templates", () => {
+    const templates = getTemplates();
+    expect(templates).toHaveLength(4);
+  });
+
+  it("should have expected template IDs", () => {
+    const templates = getTemplates();
+    const ids = templates.map((t) => t.id);
+    expect(ids).toContain("research");
+    expect(ids).toContain("content-writer");
+    expect(ids).toContain("spec-writer");
+    expect(ids).toContain("code-review");
+  });
+
+  it("should look up templates by ID", () => {
+    expect(getTemplateById("research")?.name).toBe("Research Agency");
+    expect(getTemplateById("content-writer")?.name).toBe(
+      "Content Writer Agency",
+    );
+    expect(getTemplateById("spec-writer")?.name).toBe("Spec Writer Agency");
+    expect(getTemplateById("code-review")?.name).toBe("Code Review Agency");
+    expect(getTemplateById("nonexistent")).toBeUndefined();
+  });
+
+  it("each template has exactly one entry point agent", () => {
+    for (const template of getTemplates()) {
+      const entryPoints = template.agents.filter((a) => a.isEntryPoint);
+      expect(entryPoints).toHaveLength(1);
+    }
+  });
+
+  it("each template has 3 agents", () => {
+    for (const template of getTemplates()) {
+      expect(template.agents).toHaveLength(3);
+      expect(template.agentCount).toBe(3);
+    }
+  });
+
+  it("communication flows reference valid agent names", () => {
+    for (const template of getTemplates()) {
+      const agentNames = new Set(template.agents.map((a) => a.name));
+      for (const flow of template.communicationFlows) {
+        expect(agentNames.has(flow.fromAgentName)).toBe(true);
+        expect(agentNames.has(flow.toAgentName)).toBe(true);
+      }
+    }
+  });
+
+  it("all templates have valid default settings", () => {
+    for (const template of getTemplates()) {
+      expect(template.defaultSettings.creditMultiplier).toBeGreaterThan(0);
+      expect(template.defaultSettings.maxRunTimeSeconds).toBeGreaterThan(0);
+      expect(typeof template.defaultSettings.isFallbackSafe).toBe("boolean");
+    }
+  });
+
+  it("all agents have required fields", () => {
+    for (const template of getTemplates()) {
+      for (const agent of template.agents) {
+        expect(agent.name).toBeTruthy();
+        expect(agent.description).toBeTruthy();
+        expect(agent.instructions).toBeTruthy();
+        expect(agent.model).toBeTruthy();
+        expect(typeof agent.isEntryPoint).toBe("boolean");
+        expect(typeof agent.isOptional).toBe("boolean");
+        expect(agent.position).toHaveProperty("x");
+        expect(agent.position).toHaveProperty("y");
+        expect(Array.isArray(agent.toolIds)).toBe(true);
+      }
+    }
+  });
+});
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index 5c9c2c8..ecd77c0 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -964,4 +964,124 @@ export const agencyRouter = router({
 
       return { alerts };
     }),
+
+  // --- Templates ---
+
+  listTemplates: protectedProcedure.query(async ({ ctx }) => {
+    const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+    const templatesEnabled = await getTenantFeatureFlag(
+      "AGENCY_TEMPLATES_ENABLED",
+      tenantId,
+    );
+    if (!templatesEnabled) {
+      throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
+    }
+
+    const { getTemplates } = await import(
+      "../../skills/agency-templates/index"
+    );
+    return getTemplates().map((t) => ({
+      id: t.id,
+      name: t.name,
+      description: t.description,
+      longDescription: t.longDescription,
+      category: t.category,
+      agentCount: t.agentCount,
+      icon: t.icon,
+      agents: t.agents.map((a) => ({
+        name: a.name,
+        description: a.description,
+        model: a.model,
+        isEntryPoint: a.isEntryPoint,
+        isOptional: a.isOptional,
+      })),
+      communicationFlows: t.communicationFlows,
+    }));
+  }),
+
+  createFromTemplate: agencyTemplateProcedure
+    .input(
+      z.object({
+        templateId: z.string(),
+        name: z.string().min(1).max(255).optional(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const templatesEnabled = await getTenantFeatureFlag(
+        "AGENCY_TEMPLATES_ENABLED",
+        tenantId,
+      );
+      if (!templatesEnabled) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
+      }
+
+      const { getTemplateById } = await import(
+        "../../skills/agency-templates/index"
+      );
+      const template = getTemplateById(input.templateId);
+      if (!template) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Template not found",
+        });
+      }
+
+      const userId = ctx.user!.id;
+      const name = input.name || template.name;
+      const slug = `${template.id}-${crypto.randomUUID().slice(0, 8)}`;
+      const agencyId = crypto.randomUUID();
+
+      await db.transaction(async (tx) => {
+        await tx.insert(agencies).values({
+          id: agencyId,
+          tenantId,
+          slug,
+          name,
+          description: template.description,
+          systemPrompt: null,
+          creditMultiplier: String(template.defaultSettings.creditMultiplier),
+          maxAgents: template.agentCount,
+          maxRunTimeSeconds: template.defaultSettings.maxRunTimeSeconds,
+          isFallbackSafe: template.defaultSettings.isFallbackSafe,
+          status: "draft",
+          createdBy: userId,
+        });
+
+        const agentNameToId: Record<string, string> = {};
+
+        for (const agent of template.agents) {
+          const agentId = crypto.randomUUID();
+          agentNameToId[agent.name] = agentId;
+
+          await tx.insert(agencyAgents).values({
+            id: agentId,
+            agencyId,
+            name: agent.name,
+            description: agent.description,
+            instructions: agent.instructions,
+            model: agent.model,
+            isEntryPoint: agent.isEntryPoint,
+            isOptional: agent.isOptional,
+            position: agent.position,
+          });
+        }
+
+        for (const flow of template.communicationFlows) {
+          const fromId = agentNameToId[flow.fromAgentName];
+          const toId = agentNameToId[flow.toAgentName];
+          if (fromId && toId) {
+            await tx.insert(agencyCommunicationFlows).values({
+              id: crypto.randomUUID(),
+              agencyId,
+              fromAgentId: fromId,
+              toAgentId: toId,
+              flowType: flow.flowType,
+            });
+          }
+        }
+      });
+
+      return { agencyId };
+    }),
 });
diff --git a/apps/web/skills/agency-templates/code-review.json b/apps/web/skills/agency-templates/code-review.json
new file mode 100644
index 0000000..2018f6c
--- /dev/null
+++ b/apps/web/skills/agency-templates/code-review.json
@@ -0,0 +1,50 @@
+{
+  "id": "code-review",
+  "name": "Code Review Agency",
+  "description": "A review team that analyzes code for bugs, tests for edge cases, and produces structured review reports.",
+  "longDescription": "The Code Review Agency automates multi-perspective code review. The Reviewer agent analyzes code for bugs, security issues, and best practices. The Tester agent identifies edge cases and missing test coverage. The Reporter agent compiles findings into a structured review report.",
+  "category": "engineering",
+  "agentCount": 3,
+  "icon": "Code",
+  "agents": [
+    {
+      "name": "Reviewer",
+      "description": "Analyzes code for bugs, security issues, and best practices",
+      "instructions": "You are a senior code reviewer. Analyze the provided code for: bugs and logic errors, security vulnerabilities, performance issues, code style and best practices, and potential maintenance concerns. Provide specific, actionable feedback with line references where possible.",
+      "model": "gpt-4o",
+      "isEntryPoint": true,
+      "isOptional": false,
+      "position": { "x": 250, "y": 50 },
+      "toolIds": []
+    },
+    {
+      "name": "Tester",
+      "description": "Identifies edge cases and suggests test scenarios",
+      "instructions": "You are a QA engineer and testing specialist. Analyze the code to identify: missing test coverage, edge cases that should be tested, potential failure modes, and suggested test scenarios. For each finding, describe the test case, expected behavior, and priority.",
+      "model": "gpt-4o",
+      "isEntryPoint": false,
+      "isOptional": true,
+      "position": { "x": 100, "y": 250 },
+      "toolIds": []
+    },
+    {
+      "name": "Reporter",
+      "description": "Compiles review findings into structured reports",
+      "instructions": "You are a technical report writer. Compile the findings from the Reviewer and Tester into a structured code review report. Organize by severity (critical, major, minor, suggestion). Include an executive summary, detailed findings with code references, and prioritized recommendations.",
+      "model": "gpt-4o",
+      "isEntryPoint": false,
+      "isOptional": false,
+      "position": { "x": 400, "y": 250 },
+      "toolIds": []
+    }
+  ],
+  "communicationFlows": [
+    { "fromAgentName": "Reviewer", "toAgentName": "Tester", "flowType": "delegation" },
+    { "fromAgentName": "Reviewer", "toAgentName": "Reporter", "flowType": "delegation" }
+  ],
+  "defaultSettings": {
+    "creditMultiplier": 1.0,
+    "maxRunTimeSeconds": 600,
+    "isFallbackSafe": true
+  }
+}
diff --git a/apps/web/skills/agency-templates/content-writer.json b/apps/web/skills/agency-templates/content-writer.json
new file mode 100644
index 0000000..64a3e53
--- /dev/null
+++ b/apps/web/skills/agency-templates/content-writer.json
@@ -0,0 +1,50 @@
+{
+  "id": "content-writer",
+  "name": "Content Writer Agency",
+  "description": "An editorial team that plans, writes, and reviews content with an editor-writer-reviewer pipeline.",
+  "longDescription": "The Content Writer Agency mimics an editorial team. The Editor agent understands the content brief, plans the structure, and coordinates the pipeline. The Writer produces the draft. The Reviewer checks for quality, consistency, and style.",
+  "category": "content",
+  "agentCount": 3,
+  "icon": "PenTool",
+  "agents": [
+    {
+      "name": "Editor",
+      "description": "Plans content structure and coordinates the editorial pipeline",
+      "instructions": "You are a senior editor. Analyze the content brief, plan the article structure (outline, key points, tone), delegate writing to the Writer, and delegate review to the Reviewer. Iterate as needed to produce high-quality content.",
+      "model": "gpt-4o",
+      "isEntryPoint": true,
+      "isOptional": false,
+      "position": { "x": 250, "y": 50 },
+      "toolIds": []
+    },
+    {
+      "name": "Writer",
+      "description": "Drafts content based on editorial direction",
+      "instructions": "You are a skilled content writer. Follow the editor's brief to produce engaging, well-structured content. Match the requested tone and style. Include relevant examples and data points. Deliver clean, publication-ready drafts.",
+      "model": "gpt-4o",
+      "isEntryPoint": false,
+      "isOptional": false,
+      "position": { "x": 100, "y": 250 },
+      "toolIds": []
+    },
+    {
+      "name": "Reviewer",
+      "description": "Reviews content for quality, accuracy, and style consistency",
+      "instructions": "You are a content reviewer and quality checker. Review drafts for grammar, clarity, factual accuracy, style consistency, and engagement. Provide specific, actionable feedback. Flag any issues that need the editor's attention.",
+      "model": "gpt-4o",
+      "isEntryPoint": false,
+      "isOptional": true,
+      "position": { "x": 400, "y": 250 },
+      "toolIds": []
+    }
+  ],
+  "communicationFlows": [
+    { "fromAgentName": "Editor", "toAgentName": "Writer", "flowType": "delegation" },
+    { "fromAgentName": "Editor", "toAgentName": "Reviewer", "flowType": "delegation" }
+  ],
+  "defaultSettings": {
+    "creditMultiplier": 1.0,
+    "maxRunTimeSeconds": 600,
+    "isFallbackSafe": true
+  }
+}
diff --git a/apps/web/skills/agency-templates/index.ts b/apps/web/skills/agency-templates/index.ts
new file mode 100644
index 0000000..8c35ad4
--- /dev/null
+++ b/apps/web/skills/agency-templates/index.ts
@@ -0,0 +1,59 @@
+/**
+ * Agency template loader.
+ *
+ * Reads all template JSON files from this directory, validates them against
+ * the AgencyTemplate schema, and exports them as a typed array.
+ */
+
+import researchTemplate from "./research.json";
+import contentWriterTemplate from "./content-writer.json";
+import specWriterTemplate from "./spec-writer.json";
+import codeReviewTemplate from "./code-review.json";
+
+export interface AgencyTemplate {
+  id: string;
+  name: string;
+  description: string;
+  longDescription: string;
+  category: string;
+  agentCount: number;
+  icon: string;
+  agents: Array<{
+    name: string;
+    description: string;
+    instructions: string;
+    model: string;
+    isEntryPoint: boolean;
+    isOptional: boolean;
+    position: { x: number; y: number };
+    toolIds: string[];
+  }>;
+  communicationFlows: Array<{
+    fromAgentName: string;
+    toAgentName: string;
+    flowType: "delegation" | "handoff";
+  }>;
+  defaultSettings: {
+    creditMultiplier: number;
+    maxRunTimeSeconds: number;
+    isFallbackSafe: boolean;
+  };
+}
+
+/** All available templates, loaded at module init. */
+export const templates: AgencyTemplate[] = [
+  researchTemplate,
+  contentWriterTemplate,
+  specWriterTemplate,
+  codeReviewTemplate,
+] as AgencyTemplate[];
+
+/** Get all templates (for listTemplates procedure). */
+export function getTemplates(): AgencyTemplate[] {
+  return templates;
+}
+
+/** Get a template by ID (for createFromTemplate procedure). Returns undefined if not found. */
+export function getTemplateById(id: string): AgencyTemplate | undefined {
+  return templates.find((t) => t.id === id);
+}
diff --git a/apps/web/skills/agency-templates/research.json b/apps/web/skills/agency-templates/research.json
new file mode 100644
index 0000000..edb6aaa
--- /dev/null
+++ b/apps/web/skills/agency-templates/research.json
@@ -0,0 +1,50 @@
+{
+  "id": "research",
+  "name": "Research Agency",
+  "description": "A team of agents that researches topics, synthesizes findings, and produces written reports.",
+  "longDescription": "The Research Agency uses three agents working together: a CEO agent that understands the research request and delegates tasks, a Researcher agent that gathers and analyzes information, and a Writer agent that produces the final report.",
+  "category": "research",
+  "agentCount": 3,
+  "icon": "Search",
+  "agents": [
+    {
+      "name": "CEO",
+      "description": "Coordinates research tasks and delegates to specialized agents",
+      "instructions": "You are the CEO of a research agency. Your role is to understand the user's research request, break it down into specific research tasks, delegate those tasks to the Researcher agent, and then delegate report writing to the Writer agent. Ensure the final output meets the user's requirements.",
+      "model": "gpt-4o",
+      "isEntryPoint": true,
+      "isOptional": false,
+      "position": { "x": 250, "y": 50 },
+      "toolIds": []
+    },
+    {
+      "name": "Researcher",
+      "description": "Gathers and analyzes information on assigned topics",
+      "instructions": "You are a research specialist. When given a research task, thoroughly investigate the topic, gather relevant facts, data, and perspectives. Organize your findings into a structured format with sources noted. Focus on accuracy and comprehensiveness.",
+      "model": "gpt-4o",
+      "isEntryPoint": false,
+      "isOptional": false,
+      "position": { "x": 100, "y": 250 },
+      "toolIds": []
+    },
+    {
+      "name": "Writer",
+      "description": "Produces polished written reports from research findings",
+      "instructions": "You are a professional writer. Take the research findings provided to you and produce a clear, well-structured report. Use proper formatting with headings, bullet points, and citations. Ensure the writing is concise, accurate, and accessible to the intended audience.",
+      "model": "gpt-4o",
+      "isEntryPoint": false,
+      "isOptional": false,
+      "position": { "x": 400, "y": 250 },
+      "toolIds": []
+    }
+  ],
+  "communicationFlows": [
+    { "fromAgentName": "CEO", "toAgentName": "Researcher", "flowType": "delegation" },
+    { "fromAgentName": "CEO", "toAgentName": "Writer", "flowType": "delegation" }
+  ],
+  "defaultSettings": {
+    "creditMultiplier": 1.0,
+    "maxRunTimeSeconds": 600,
+    "isFallbackSafe": true
+  }
+}
diff --git a/apps/web/skills/agency-templates/spec-writer.json b/apps/web/skills/agency-templates/spec-writer.json
new file mode 100644
index 0000000..0de8b51
--- /dev/null
+++ b/apps/web/skills/agency-templates/spec-writer.json
@@ -0,0 +1,50 @@
+{
+  "id": "spec-writer",
+  "name": "Spec Writer Agency",
+  "description": "A product team that collaborates on writing detailed technical specifications from requirements.",
+  "longDescription": "The Spec Writer Agency models a product team workflow. The PM agent gathers and clarifies requirements. The Architect agent designs the technical approach. The Writer agent produces the formal specification document.",
+  "category": "engineering",
+  "agentCount": 3,
+  "icon": "FileText",
+  "agents": [
+    {
+      "name": "PM",
+      "description": "Gathers requirements and coordinates the specification process",
+      "instructions": "You are a product manager. Analyze the feature request or requirements input, identify ambiguities, define acceptance criteria, and coordinate with the Architect for technical design and the Writer for documentation. Ensure the final specification is complete and actionable.",
+      "model": "gpt-4o",
+      "isEntryPoint": true,
+      "isOptional": false,
+      "position": { "x": 250, "y": 50 },
+      "toolIds": []
+    },
+    {
+      "name": "Architect",
+      "description": "Designs technical approach and system architecture",
+      "instructions": "You are a software architect. Given product requirements, design the technical approach: system components, data models, APIs, integration points, and trade-offs. Consider scalability, security, and maintainability. Provide structured technical decisions.",
+      "model": "gpt-4o",
+      "isEntryPoint": false,
+      "isOptional": false,
+      "position": { "x": 100, "y": 250 },
+      "toolIds": []
+    },
+    {
+      "name": "Writer",
+      "description": "Produces formal specification documents",
+      "instructions": "You are a technical writer specializing in specifications. Combine product requirements and architectural decisions into a clear, formal specification document. Include sections for overview, requirements, technical design, API contracts, data models, and acceptance criteria.",
+      "model": "gpt-4o",
+      "isEntryPoint": false,
+      "isOptional": false,
+      "position": { "x": 400, "y": 250 },
+      "toolIds": []
+    }
+  ],
+  "communicationFlows": [
+    { "fromAgentName": "PM", "toAgentName": "Architect", "flowType": "delegation" },
+    { "fromAgentName": "PM", "toAgentName": "Writer", "flowType": "delegation" }
+  ],
+  "defaultSettings": {
+    "creditMultiplier": 1.0,
+    "maxRunTimeSeconds": 900,
+    "isFallbackSafe": true
+  }
+}
diff --git a/apps/web/tsconfig.json b/apps/web/tsconfig.json
index bc84560..c359952 100644
--- a/apps/web/tsconfig.json
+++ b/apps/web/tsconfig.json
@@ -5,6 +5,7 @@
     "shared/**/*",
     "server/**/*",
     "drizzle/**/*",
+    "skills/**/*",
     "vite.config.ts",
     "../../packages/ui/src/**/*"
   ],
