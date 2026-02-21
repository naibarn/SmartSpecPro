diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index 5af5bcb..dd15dbd 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -82,6 +82,7 @@ import UsageAnalytics from "./pages/UsageAnalytics";
 import TaskQueueMonitor from "./pages/TaskQueueMonitor";
 import Workflows from "./pages/Workflows";
 import WorkflowEditor from "./pages/WorkflowEditor";
+import WorkflowGallery from "./pages/WorkflowGallery";

 function PostHogPageViewTracker() {
   const [location] = useLocation();
@@ -151,6 +152,7 @@ function Router() {
       <Route path="/chat" component={Chat} />
       <Route path="/workflows" component={Workflows} />
       <Route path="/workflows/editor" component={WorkflowEditor} />
+      <Route path="/workflows/gallery" component={WorkflowGallery} />
       <Route path="/workflows/editor/:id" component={WorkflowEditor} />
       <Route path="/dashboard" component={Dashboard} />
       <Route path="/generate/:type?" component={Generate} />
diff --git a/apps/web/client/src/components/workflow/GalleryCategories.tsx b/apps/web/client/src/components/workflow/GalleryCategories.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/client/src/components/workflow/GalleryCategories.tsx
@@ -0,0 +1,57 @@
+interface GalleryCategoriesProps {
+  categories: Array<{ id: number; name: string; templateCount: number }>;
+  totalCount: number;
+  selectedCategory: string | null;
+  onSelect: (category: string | null) => void;
+  isLoading: boolean;
+}
+
+export function GalleryCategories({
+  categories,
+  totalCount,
+  selectedCategory,
+  onSelect,
+  isLoading,
+}: GalleryCategoriesProps) {
+  if (isLoading) {
+    return (
+      <div className="space-y-2">
+        {Array.from({ length: 5 }).map((_, i) => (
+          <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />
+        ))}
+      </div>
+    );
+  }
+
+  return (
+    <div className="space-y-1">
+      <button
+        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
+          selectedCategory === null
+            ? "bg-blue-50 text-blue-700 font-semibold"
+            : "hover:bg-muted"
+        }`}
+        onClick={() => onSelect(null)}
+      >
+        <span>All</span>
+        <span className="text-xs text-muted-foreground">({totalCount})</span>
+      </button>
+      {categories.map((cat) => (
+        <button
+          key={cat.id}
+          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
+            selectedCategory === cat.name
+              ? "bg-blue-50 text-blue-700 font-semibold"
+              : "hover:bg-muted"
+          }`}
+          onClick={() => onSelect(cat.name)}
+        >
+          <span>{cat.name}</span>
+          <span className="text-xs text-muted-foreground">
+            ({cat.templateCount})
+          </span>
+        </button>
+      ))}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/workflow/GalleryDetailDrawer.tsx b/apps/web/client/src/components/workflow/GalleryDetailDrawer.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/client/src/components/workflow/GalleryDetailDrawer.tsx
@@ -0,0 +1,185 @@
+import { useLocation } from "wouter";
+import { Loader2 } from "lucide-react";
+import { toast } from "sonner";
+import { trpc } from "@/lib/trpc";
+import {
+  Sheet,
+  SheetContent,
+  SheetHeader,
+  SheetTitle,
+  SheetFooter,
+} from "@/components/ui/sheet";
+import { Button } from "@/components/ui/button";
+import {
+  NODE_TYPE_CATEGORY_COLORS,
+  DEFAULT_NODE_COLOR,
+  CATEGORY_COLOR_MAP,
+  DEFAULT_CATEGORY_COLOR,
+} from "./galleryConstants";
+
+interface GalleryDetailDrawerProps {
+  open: boolean;
+  templateId: number | null;
+  onClose: () => void;
+}
+
+function svgToDataUrl(svgString: string): string {
+  const base64 = btoa(unescape(encodeURIComponent(svgString)));
+  return `data:image/svg+xml;base64,${base64}`;
+}
+
+export function GalleryDetailDrawer({
+  open,
+  templateId,
+  onClose,
+}: GalleryDetailDrawerProps) {
+  const [, setLocation] = useLocation();
+
+  const { data: template, isLoading } = trpc.workflow.getTemplate.useQuery(
+    { id: templateId! },
+    { enabled: open && templateId !== null }
+  );
+
+  const useTemplateMutation = trpc.workflow.useTemplate.useMutation();
+
+  async function handleUseTemplate() {
+    if (!template) return;
+    try {
+      const result = await useTemplateMutation.mutateAsync({
+        templateId: template.id,
+      });
+      onClose();
+      toast.success("Template loaded — configure your connections and run.");
+      setLocation(`/workflows/editor/${result.id}`);
+    } catch {
+      toast.error("Could not load template. Please try again.");
+    }
+  }
+
+  const categoryColors = template?.categoryId
+    ? Object.values(CATEGORY_COLOR_MAP)[0] // Fallback — we don't have category name in full record
+    : DEFAULT_CATEGORY_COLOR;
+
+  // Extract unique node types from workflowJson
+  const nodeTypes = template?.workflowJson?.nodes
+    ? [
+        ...new Set(
+          template.workflowJson.nodes.map(
+            (n: any) => n.data?.nodeType as string
+          )
+        ),
+      ].filter(Boolean)
+    : [];
+
+  return (
+    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
+      <SheetContent side="right" className="w-[520px] overflow-y-auto">
+        {isLoading ? (
+          <div className="space-y-4 py-6">
+            <div className="h-6 w-3/4 rounded bg-muted animate-pulse" />
+            <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
+            <div className="h-48 w-full rounded bg-muted animate-pulse" />
+            <div className="h-4 w-full rounded bg-muted animate-pulse" />
+            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
+          </div>
+        ) : template ? (
+          <>
+            <SheetHeader>
+              <SheetTitle>{template.name}</SheetTitle>
+              <div className="flex items-center gap-2 text-sm text-muted-foreground">
+                {template.stepCount != null && (
+                  <span>{template.stepCount} steps</span>
+                )}
+                {template.estimatedSetupMinutes != null && (
+                  <>
+                    <span>·</span>
+                    <span>~{template.estimatedSetupMinutes} min setup</span>
+                  </>
+                )}
+                {template.downloadCount > 0 && (
+                  <>
+                    <span>·</span>
+                    <span>{template.downloadCount} uses</span>
+                  </>
+                )}
+              </div>
+            </SheetHeader>
+
+            <div className="mt-4 space-y-4">
+              {/* SVG Preview */}
+              {template.previewSvg && (
+                <img
+                  src={svgToDataUrl(template.previewSvg)}
+                  alt="Workflow topology diagram"
+                  className="w-full rounded-lg border"
+                />
+              )}
+
+              {/* Description */}
+              {template.description && (
+                <p className="text-sm text-muted-foreground">
+                  {template.description}
+                </p>
+              )}
+
+              {/* Node type badges */}
+              {nodeTypes.length > 0 && (
+                <div>
+                  <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2">
+                    Node Types
+                  </h4>
+                  <div className="flex flex-wrap gap-1.5">
+                    {nodeTypes.map((nt: string) => (
+                      <span
+                        key={nt}
+                        className="inline-flex items-center px-2 py-0.5 rounded text-xs text-white"
+                        style={{
+                          backgroundColor:
+                            NODE_TYPE_CATEGORY_COLORS[nt] ?? DEFAULT_NODE_COLOR,
+                        }}
+                      >
+                        {nt}
+                      </span>
+                    ))}
+                  </div>
+                </div>
+              )}

+              {/* Industry tags */}
+              {template.industry && template.industry.length > 0 && (
+                <div>
+                  <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2">
+                    Industries
+                  </h4>
+                  <div className="flex flex-wrap gap-1.5">
+                    {(template.industry as string[]).map((ind: string) => (
+                      <span
+                        key={ind}
+                        className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground"
+                      >
+                        {ind}
+                      </span>
+                    ))}
+                  </div>
+                </div>
+              )}
+            </div>
+
+            <SheetFooter className="mt-6">
+              <Button
+                className="w-full"
+                onClick={handleUseTemplate}
+                disabled={useTemplateMutation.isPending}
+              >
+                {useTemplateMutation.isPending && (
+                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
+                )}
+                Use This Template
+              </Button>
+            </SheetFooter>
+          </>
+        ) : null}
+      </SheetContent>
+    </Sheet>
+  );
+}
diff --git a/apps/web/client/src/components/workflow/GalleryTemplateCard.tsx b/apps/web/client/src/components/workflow/GalleryTemplateCard.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/client/src/components/workflow/GalleryTemplateCard.tsx
@@ -0,0 +1,88 @@
+import {
+  CATEGORY_COLOR_MAP,
+  DEFAULT_CATEGORY_COLOR,
+} from "./galleryConstants";
+
+interface GalleryTemplateCardProps {
+  template: {
+    id: number;
+    name: string;
+    description: string | null;
+    category?: string | null;
+    stepCount: number | null;
+    estimatedSetupMinutes: number | null;
+    industry: string[] | null;
+    tags: string[] | null;
+    downloadCount: number | null;
+    templateKey: string | null;
+  };
+  onSelect: (id: number) => void;
+}
+
+export function GalleryTemplateCard({
+  template,
+  onSelect,
+}: GalleryTemplateCardProps) {
+  const categoryColors = template.category
+    ? CATEGORY_COLOR_MAP[template.category] ?? DEFAULT_CATEGORY_COLOR
+    : DEFAULT_CATEGORY_COLOR;
+
+  return (
+    <article
+      className="group relative flex flex-col rounded-lg border bg-card p-4 cursor-pointer transition-shadow hover:shadow-md"
+      onClick={() => onSelect(template.id)}
+    >
+      <h3 className="font-semibold text-sm line-clamp-1">{template.name}</h3>
+
+      {template.description && (
+        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
+          {template.description}
+        </p>
+      )}
+
+      <div className="mt-3 flex flex-wrap items-center gap-1.5">
+        {template.category && (
+          <span
+            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors.bg} ${categoryColors.text}`}
+          >
+            {template.category}
+          </span>
+        )}
+
+        {template.stepCount != null && (
+          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
+            {template.stepCount} steps
+          </span>
+        )}
+      </div>
+
+      {template.industry && template.industry.length > 0 && (
+        <div className="mt-2 flex flex-wrap gap-1">
+          {template.industry.slice(0, 3).map((ind) => (
+            <span
+              key={ind}
+              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted/50 text-muted-foreground"
+            >
+              {ind}
+            </span>
+          ))}
+        </div>
+      )}
+
+      <div className="mt-auto pt-3 flex items-center justify-between">
+        <span className="text-xs text-muted-foreground">
+          {template.downloadCount ?? 0} uses
+        </span>
+        <button
+          className="text-xs font-medium text-primary hover:underline"
+          onClick={(e) => {
+            e.stopPropagation();
+            onSelect(template.id);
+          }}
+        >
+          Preview
+        </button>
+      </div>
+    </article>
+  );
+}
diff --git a/apps/web/client/src/components/workflow/galleryConstants.ts b/apps/web/client/src/components/workflow/galleryConstants.ts
new file mode 100644
--- /dev/null
+++ b/apps/web/client/src/components/workflow/galleryConstants.ts
@@ -0,0 +1,45 @@
+/** Category name → Tailwind background / text classes for gallery badges */
+export const CATEGORY_COLOR_MAP: Record<string, { bg: string; text: string }> = {
+  "Sales & Marketing":        { bg: "bg-blue-100",   text: "text-blue-800" },
+  "HR & People":              { bg: "bg-purple-100", text: "text-purple-800" },
+  "Finance & Accounting":     { bg: "bg-green-100",  text: "text-green-800" },
+  "IT & DevOps":              { bg: "bg-orange-100", text: "text-orange-800" },
+  "Healthcare":               { bg: "bg-red-100",    text: "text-red-800" },
+  "Education":                { bg: "bg-yellow-100", text: "text-yellow-800" },
+  "Government & Public":      { bg: "bg-gray-100",   text: "text-gray-800" },
+  "Personal Productivity":    { bg: "bg-teal-100",   text: "text-teal-800" },
+  "Real Estate":              { bg: "bg-amber-100",  text: "text-amber-800" },
+  "Logistics & Supply Chain": { bg: "bg-cyan-100",   text: "text-cyan-800" },
+  "Content & Media":          { bg: "bg-pink-100",   text: "text-pink-800" },
+  "Food & Restaurant":        { bg: "bg-lime-100",   text: "text-lime-800" },
+  "Legal & Compliance":       { bg: "bg-indigo-100", text: "text-indigo-800" },
+  "Customer Service":         { bg: "bg-sky-100",    text: "text-sky-800" },
+  "AI & Automation":          { bg: "bg-violet-100", text: "text-violet-800" },
+};
+
+export const DEFAULT_CATEGORY_COLOR = { bg: "bg-gray-100", text: "text-gray-700" };
+
+/** Maps nodeType → hex color for detail drawer badges */
+export const NODE_TYPE_CATEGORY_COLORS: Record<string, string> = {
+  manual_trigger: "#10B981", schedule_trigger: "#10B981",
+  webhook_trigger: "#10B981", event_trigger: "#10B981",
+  form_input: "#10B981",
+  llm_call: "#3B82F6", rag_query: "#3B82F6", embedding_generator: "#3B82F6",
+  multi_model_router: "#3B82F6", prompt_template: "#3B82F6", output_parser: "#3B82F6",
+  conditional: "#8B5CF6", loop: "#8B5CF6", parallel: "#8B5CF6",
+  join: "#8B5CF6", subworkflow: "#8B5CF6", retry: "#8B5CF6",
+  switch: "#8B5CF6", circuit_breaker: "#8B5CF6", try_catch: "#8B5CF6",
+  delay: "#8B5CF6", wait: "#8B5CF6",
+  database_query: "#F97316", transformer: "#F97316", filter: "#F97316",
+  aggregator: "#F97316", csv_parser: "#F97316", template_engine: "#F97316",
+  read_file: "#F97316", write_file: "#F97316", merge_data: "#F97316",
+  split: "#F97316", batch: "#F97316", validator: "#F97316",
+  code_runner: "#F97316",
+  http_request: "#06B6D4", graphql_request: "#06B6D4", websocket_client: "#06B6D4",
+  storage_action: "#06B6D4",
+  send_email: "#EF4444", send_notification: "#EF4444",
+  metrics_collector: "#6B7280", logger_node: "#6B7280", secrets_vault: "#6B7280",
+  generate_image: "#F59E0B", skill: "#F59E0B", approval_gate: "#F59E0B",
+};
+
+export const DEFAULT_NODE_COLOR = "#6B7280";
diff --git a/apps/web/client/src/pages/WorkflowGallery.tsx b/apps/web/client/src/pages/WorkflowGallery.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/client/src/pages/WorkflowGallery.tsx
@@ -0,0 +1,200 @@
+import { useState, useEffect } from "react";
+import { useLocation } from "wouter";
+import { LayoutGrid, ArrowLeft, Plus, Search, AlertCircle } from "lucide-react";
+import { trpc } from "@/lib/trpc";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { GalleryCategories } from "@/components/workflow/GalleryCategories";
+import { GalleryTemplateCard } from "@/components/workflow/GalleryTemplateCard";
+import { GalleryDetailDrawer } from "@/components/workflow/GalleryDetailDrawer";
+
+const PAGE_SIZE = 24;
+
+export default function WorkflowGallery() {
+  const [, setLocation] = useLocation();
+  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
+  const [searchQuery, setSearchQuery] = useState("");
+  const [debouncedSearch, setDebouncedSearch] = useState("");
+  const [page, setPage] = useState(0);
+  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
+    null
+  );
+
+  // Debounce search
+  useEffect(() => {
+    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
+    return () => clearTimeout(timer);
+  }, [searchQuery]);
+
+  // Reset page when filters change
+  useEffect(() => {
+    setPage(0);
+  }, [selectedCategory, debouncedSearch]);
+
+  const templatesQuery = trpc.workflow.listTemplates.useQuery({
+    category: selectedCategory ?? undefined,
+    search: debouncedSearch || undefined,
+    limit: PAGE_SIZE,
+    offset: page * PAGE_SIZE,
+  });
+
+  const categoriesQuery = trpc.workflow.listTemplateCategories.useQuery();
+
+  const items = templatesQuery.data?.items ?? [];
+  const total = templatesQuery.data?.total ?? 0;
+  const totalPages = Math.ceil(total / PAGE_SIZE);
+
+  const totalCount =
+    categoriesQuery.data?.reduce(
+      (sum, c) => sum + (c.templateCount ?? 0),
+      0
+    ) ?? 0;
+
+  return (
+    <div className="flex flex-col min-h-screen">
+      {/* Header */}
+      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur px-6 py-3">
+        <div className="flex items-center gap-3">
+          <Button
+            variant="ghost"
+            size="icon"
+            onClick={() => setLocation("/workflows")}
+          >
+            <ArrowLeft className="h-4 w-4" />
+          </Button>
+          <LayoutGrid className="h-5 w-5 text-muted-foreground" />
+          <h1 className="text-lg font-semibold">Workflow Gallery</h1>
+        </div>
+        <Button size="sm" onClick={() => setLocation("/workflows/editor")}>
+          <Plus className="h-4 w-4 mr-1" />
+          New Workflow
+        </Button>
+      </header>
+
+      <div className="flex flex-1">
+        {/* Sidebar */}
+        <aside className="w-56 shrink-0 border-r p-4 overflow-y-auto hidden md:block">
+          <GalleryCategories
+            categories={categoriesQuery.data ?? []}
+            totalCount={totalCount}
+            selectedCategory={selectedCategory}
+            onSelect={setSelectedCategory}
+            isLoading={categoriesQuery.isLoading}
+          />
+        </aside>
+
+        {/* Main content */}
+        <main className="flex-1 p-6">
+          {/* Search */}
+          <div className="relative mb-6 max-w-md">
+            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
+            <Input
+              placeholder="Search templates..."
+              value={searchQuery}
+              onChange={(e) => setSearchQuery(e.target.value)}
+              className="pl-9"
+            />
+          </div>
+
+          {/* Loading state */}
+          {templatesQuery.isLoading && (
+            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
+              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
+                <div
+                  key={i}
+                  className="h-48 rounded-lg bg-muted animate-pulse"
+                />
+              ))}
+            </div>
+          )}
+
+          {/* Error state */}
+          {templatesQuery.isError && (
+            <div className="text-center py-12">
+              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
+              <p className="text-lg font-medium">
+                Could not load templates. Please try again.
+              </p>
+              <Button
+                onClick={() => templatesQuery.refetch()}
+                className="mt-4"
+              >
+                Try Again
+              </Button>
+            </div>
+          )}
+
+          {/* Empty state */}
+          {!templatesQuery.isLoading &&
+            !templatesQuery.isError &&
+            items.length === 0 && (
+              <div className="text-center py-12">
+                <p className="text-lg font-medium">
+                  No templates found matching your filters.
+                </p>
+                <Button
+                  variant="ghost"
+                  onClick={() => {
+                    setSelectedCategory(null);
+                    setSearchQuery("");
+                  }}
+                  className="mt-4"
+                >
+                  Clear Filters
+                </Button>
+              </div>
+            )}
+
+          {/* Template grid */}
+          {!templatesQuery.isLoading &&
+            !templatesQuery.isError &&
+            items.length > 0 && (
+              <>
+                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
+                  {items.map((t: any) => (
+                    <GalleryTemplateCard
+                      key={t.id}
+                      template={t}
+                      onSelect={setSelectedTemplateId}
+                    />
+                  ))}
+                </div>
+
+                {/* Pagination */}
+                {totalPages > 1 && (
+                  <div className="flex items-center justify-center gap-4 mt-8">
+                    <Button
+                      variant="outline"
+                      size="sm"
+                      disabled={page === 0}
+                      onClick={() => setPage((p) => p - 1)}
+                    >
+                      Previous
+                    </Button>
+                    <span className="text-sm text-muted-foreground">
+                      Page {page + 1} of {totalPages}
+                    </span>
+                    <Button
+                      variant="outline"
+                      size="sm"
+                      disabled={page >= totalPages - 1}
+                      onClick={() => setPage((p) => p + 1)}
+                    >
+                      Next
+                    </Button>
+                  </div>
+                )}
+              </>
+            )}
+        </main>
+      </div>

+      {/* Detail Drawer */}
+      <GalleryDetailDrawer
+        open={selectedTemplateId !== null}
+        templateId={selectedTemplateId}
+        onClose={() => setSelectedTemplateId(null)}
+      />
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/workflow/__tests__/GalleryTemplateCard.test.tsx b/apps/web/client/src/components/workflow/__tests__/GalleryTemplateCard.test.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/client/src/components/workflow/__tests__/GalleryTemplateCard.test.tsx
@@ -0,0 +1,94 @@
+import { describe, it, expect, vi } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import { GalleryTemplateCard } from "../GalleryTemplateCard";
+
+const mockTemplate = {
+  id: 1,
+  name: "Daily Sales Report",
+  description: "Pulls yesterday's orders from the database...",
+  category: "Sales & Marketing",
+  stepCount: 5,
+  estimatedSetupMinutes: 20,
+  industry: ["E-commerce", "Retail", "B2B"],
+  tags: ["schedule", "email", "reporting"],
+  downloadCount: 42,
+  templateKey: "tpl-001",
+};
+
+7 tests covering: name render, description truncation, category badge, stepCount, industry tags limit, card click, preview button.
+
diff --git a/apps/web/client/src/components/workflow/__tests__/GalleryDetailDrawer.test.tsx b/apps/web/client/src/components/workflow/__tests__/GalleryDetailDrawer.test.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/client/src/components/workflow/__tests__/GalleryDetailDrawer.test.tsx
@@ -0,0 +1,185 @@
+6 tests covering: skeleton loading, SVG as base64 img, node type badges, button enabled, spinner on pending, onClose on success.
+
diff --git a/apps/web/client/src/pages/__tests__/WorkflowGallery.test.tsx b/apps/web/client/src/pages/__tests__/WorkflowGallery.test.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/client/src/pages/__tests__/WorkflowGallery.test.tsx
@@ -0,0 +1,143 @@
+5 tests covering: 24 skeletons on load, cards render, error state, empty state, category click.
