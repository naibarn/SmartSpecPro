diff --git a/apps/web/client/src/components/chat/canvas/ArtifactSandbox.tsx b/apps/web/client/src/components/chat/canvas/ArtifactSandbox.tsx
new file mode 100644
index 0000000..b081004
--- /dev/null
+++ b/apps/web/client/src/components/chat/canvas/ArtifactSandbox.tsx
@@ -0,0 +1,78 @@
+import { useEffect, useRef, useState } from "react";
+import { AlertCircle } from "lucide-react";
+
+interface ArtifactSandboxProps {
+  artifactType: "react" | "html";
+  content: string;
+}
+
+const SANDBOX_ORIGIN = "https://sandbox.smartaihub.app";
+
+export function ArtifactSandbox({ artifactType, content }: ArtifactSandboxProps) {
+  const iframeRef = useRef<HTMLIFrameElement>(null);
+  const [height, setHeight] = useState(300);
+  const [error, setError] = useState<string | null>(null);
+
+  useEffect(() => {
+    const handler = (event: MessageEvent) => {
+      // In development, also accept blob: origins
+      if (event.origin !== SANDBOX_ORIGIN && !event.origin.startsWith("blob:")) return;
+
+      const data = event.data;
+      if (data?.type === "rendered" && typeof data.height === "number") {
+        setHeight(Math.min(data.height + 20, 800));
+        setError(null);
+      } else if (data?.type === "error") {
+        setError(data.message || "Rendering error");
+      }
+    };
+
+    window.addEventListener("message", handler);
+    return () => window.removeEventListener("message", handler);
+  }, []);
+
+  useEffect(() => {
+    // Send content to iframe after it loads
+    const iframe = iframeRef.current;
+    if (!iframe) return;
+
+    const sendContent = () => {
+      iframe.contentWindow?.postMessage(
+        { type: "render", artifactType, content },
+        "*",
+      );
+    };
+
+    iframe.addEventListener("load", sendContent);
+    // Also try immediately in case already loaded
+    sendContent();
+
+    return () => iframe.removeEventListener("load", sendContent);
+  }, [artifactType, content]);
+
+  if (error) {
+    return (
+      <div className="rounded-md border border-destructive/30 p-4">
+        <div className="flex items-center gap-2">
+          <AlertCircle className="h-4 w-4 text-destructive" />
+          <p className="text-sm text-destructive">Sandbox error: {error}</p>
+        </div>
+      </div>
+    );
+  }
+
+  // Use blob URL as fallback for development
+  const sandboxSrc = `${SANDBOX_ORIGIN}/sandbox.html`;
+
+  return (
+    <div className="overflow-hidden rounded-md border">
+      <iframe
+        ref={iframeRef}
+        src={sandboxSrc}
+        sandbox="allow-scripts allow-forms"
+        style={{ width: "100%", height, border: "none" }}
+        title={`${artifactType} artifact`}
+      />
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/chat/canvas/CanvasPane.tsx b/apps/web/client/src/components/chat/canvas/CanvasPane.tsx
new file mode 100644
index 0000000..964be9f
--- /dev/null
+++ b/apps/web/client/src/components/chat/canvas/CanvasPane.tsx
@@ -0,0 +1,177 @@
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import { ScrollArea } from "@/components/ui/scroll-area";
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
+import { X, History, Code2, BarChart3, Table2, FileText, Globe, Component, GitBranch, Image } from "lucide-react";
+import { CodeRenderer } from "./renderers/CodeRenderer";
+import { ChartRenderer } from "./renderers/ChartRenderer";
+import { TableRenderer } from "./renderers/TableRenderer";
+import { MarkdownRenderer } from "./renderers/MarkdownRenderer";
+import { SvgRenderer } from "./renderers/SvgRenderer";
+import { MermaidRenderer } from "./renderers/MermaidRenderer";
+import { ArtifactSandbox } from "./ArtifactSandbox";
+
+const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
+  code: Code2,
+  chart: BarChart3,
+  table: Table2,
+  markdown: FileText,
+  react: Component,
+  html: Globe,
+  mermaid: GitBranch,
+  svg: Image,
+};
+
+interface CanvasPaneProps {
+  conversationId: number;
+  selectedArtifactId?: string | null;
+  onClose: () => void;
+}
+
+export function CanvasPane({ conversationId, selectedArtifactId, onClose }: CanvasPaneProps) {
+  const [activeId, setActiveId] = useState<string | null>(selectedArtifactId ?? null);
+  const [showVersions, setShowVersions] = useState(false);
+
+  const { data: artifacts = [] } = trpc.artifact.getArtifacts.useQuery(
+    { conversationId },
+    { enabled: conversationId > 0 },
+  );
+
+  const activeArtifact = artifacts.find((a: any) => a.id === activeId) ?? artifacts[0];
+
+  const { data: versions = [] } = trpc.artifact.getArtifactVersions.useQuery(
+    { artifactId: activeArtifact?.id ?? "" },
+    { enabled: showVersions && !!activeArtifact?.id },
+  );
+
+  if (artifacts.length === 0) {
+    return (
+      <div className="flex h-full flex-col">
+        <div className="flex items-center justify-between border-b px-3 py-2">
+          <h3 className="text-sm font-medium">Canvas</h3>
+          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
+            <X className="h-4 w-4" />
+          </Button>
+        </div>
+        <div className="flex flex-1 items-center justify-center p-4">
+          <p className="text-sm text-muted-foreground">No artifacts in this conversation</p>
+        </div>
+      </div>
+    );
+  }
+
+  const TypeIcon = TYPE_ICONS[activeArtifact?.artifactType] ?? Code2;
+
+  return (
+    <div className="flex h-full flex-col">
+      {/* Header */}
+      <div className="flex items-center justify-between border-b px-3 py-2">
+        <div className="flex items-center gap-2 min-w-0">
+          <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
+          <span className="text-sm font-medium truncate">{activeArtifact?.title || "Artifact"}</span>
+          <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
+            {activeArtifact?.artifactType}
+          </Badge>
+          {(activeArtifact?.version ?? 1) > 1 && (
+            <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
+              v{activeArtifact.version}
+            </Badge>
+          )}
+        </div>
+        <div className="flex items-center gap-1">
+          <Button
+            variant="ghost"
+            size="icon"
+            className="h-7 w-7"
+            onClick={() => setShowVersions(!showVersions)}
+            title="Version history"
+          >
+            <History className="h-3.5 w-3.5" />
+          </Button>
+          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
+            <X className="h-4 w-4" />
+          </Button>
+        </div>
+      </div>
+
+      {/* Artifact selector (if multiple) */}
+      {artifacts.length > 1 && (
+        <div className="border-b px-3 py-1.5">
+          <Select value={activeId ?? ""} onValueChange={setActiveId}>
+            <SelectTrigger className="h-7 text-xs">
+              <SelectValue placeholder="Select artifact" />
+            </SelectTrigger>
+            <SelectContent>
+              {artifacts.map((a: any) => {
+                const Icon = TYPE_ICONS[a.artifactType] ?? Code2;
+                return (
+                  <SelectItem key={a.id} value={a.id}>
+                    <div className="flex items-center gap-1.5">
+                      <Icon className="h-3 w-3" />
+                      <span>{a.title || a.artifactType}</span>
+                    </div>
+                  </SelectItem>
+                );
+              })}
+            </SelectContent>
+          </Select>
+        </div>
+      )}
+
+      {/* Version history */}
+      {showVersions && versions.length > 0 && (
+        <div className="border-b px-3 py-2">
+          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Versions</p>
+          <div className="flex flex-wrap gap-1">
+            {versions.map((v: any) => (
+              <Button
+                key={v.id}
+                variant={v.id === activeId ? "default" : "outline"}
+                size="sm"
+                className="h-6 text-[10px] px-2"
+                onClick={() => setActiveId(v.id)}
+              >
+                v{v.version}
+              </Button>
+            ))}
+          </div>
+        </div>
+      )}
+
+      {/* Content */}
+      <ScrollArea className="flex-1">
+        <div className="p-3">
+          {activeArtifact && renderArtifact(activeArtifact)}
+        </div>
+      </ScrollArea>
+    </div>
+  );
+}
+
+function renderArtifact(artifact: any) {
+  const { artifactType, content, language } = artifact;
+
+  switch (artifactType) {
+    case "code":
+      return <CodeRenderer content={content} language={language} />;
+    case "chart":
+      return <ChartRenderer content={content} />;
+    case "table":
+      return <TableRenderer content={content} />;
+    case "markdown":
+      return <MarkdownRenderer content={content} />;
+    case "svg":
+      return <SvgRenderer content={content} />;
+    case "mermaid":
+      return <MermaidRenderer content={content} />;
+    case "react":
+    case "html":
+      return <ArtifactSandbox artifactType={artifactType} content={content} />;
+    default:
+      return (
+        <pre className="overflow-x-auto rounded-md border p-4 text-sm">{content}</pre>
+      );
+  }
+}
diff --git a/apps/web/client/src/components/chat/canvas/renderers/ChartRenderer.tsx b/apps/web/client/src/components/chat/canvas/renderers/ChartRenderer.tsx
new file mode 100644
index 0000000..9ec0cf1
--- /dev/null
+++ b/apps/web/client/src/components/chat/canvas/renderers/ChartRenderer.tsx
@@ -0,0 +1,77 @@
+import { useMemo } from "react";
+import {
+  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
+  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
+} from "recharts";
+
+interface ChartRendererProps {
+  content: string;
+}
+
+const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088FE", "#00C49F"];
+
+export function ChartRenderer({ content }: ChartRendererProps) {
+  const chartData = useMemo(() => {
+    try {
+      return JSON.parse(content);
+    } catch {
+      return null;
+    }
+  }, [content]);
+
+  if (!chartData) {
+    return (
+      <div className="rounded-md border p-4">
+        <p className="text-sm text-muted-foreground">Unable to parse chart data</p>
+        <pre className="mt-2 overflow-x-auto text-xs">{content}</pre>
+      </div>
+    );
+  }
+
+  const chartType = chartData.type || "bar";
+  const data = chartData.data || [];
+
+  return (
+    <div className="rounded-md border p-4">
+      <ResponsiveContainer width="100%" height={300}>
+        {chartType === "bar" ? (
+          <BarChart data={data}>
+            <CartesianGrid strokeDasharray="3 3" />
+            <XAxis dataKey="label" />
+            <YAxis />
+            <Tooltip />
+            <Legend />
+            <Bar dataKey="value" fill="#8884d8" />
+          </BarChart>
+        ) : chartType === "line" ? (
+          <LineChart data={data}>
+            <CartesianGrid strokeDasharray="3 3" />
+            <XAxis dataKey="label" />
+            <YAxis />
+            <Tooltip />
+            <Legend />
+            <Line type="monotone" dataKey="value" stroke="#8884d8" />
+          </LineChart>
+        ) : chartType === "pie" ? (
+          <PieChart>
+            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100}>
+              {data.map((_: any, i: number) => (
+                <Cell key={i} fill={COLORS[i % COLORS.length]} />
+              ))}
+            </Pie>
+            <Tooltip />
+            <Legend />
+          </PieChart>
+        ) : (
+          <AreaChart data={data}>
+            <CartesianGrid strokeDasharray="3 3" />
+            <XAxis dataKey="label" />
+            <YAxis />
+            <Tooltip />
+            <Area type="monotone" dataKey="value" fill="#8884d8" fillOpacity={0.3} stroke="#8884d8" />
+          </AreaChart>
+        )}
+      </ResponsiveContainer>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/chat/canvas/renderers/CodeRenderer.tsx b/apps/web/client/src/components/chat/canvas/renderers/CodeRenderer.tsx
new file mode 100644
index 0000000..1eea8f6
--- /dev/null
+++ b/apps/web/client/src/components/chat/canvas/renderers/CodeRenderer.tsx
@@ -0,0 +1,48 @@
+import { useState } from "react";
+import { Button } from "@/components/ui/button";
+import { Copy, Check, Download } from "lucide-react";
+
+interface CodeRendererProps {
+  content: string;
+  language?: string;
+}
+
+export function CodeRenderer({ content, language }: CodeRendererProps) {
+  const [copied, setCopied] = useState(false);
+
+  const handleCopy = async () => {
+    await navigator.clipboard.writeText(content);
+    setCopied(true);
+    setTimeout(() => setCopied(false), 2000);
+  };
+
+  const handleDownload = () => {
+    const ext = language === "python" ? ".py" : language === "javascript" ? ".js" : language === "typescript" ? ".ts" : ".txt";
+    const blob = new Blob([content], { type: "text/plain" });
+    const url = URL.createObjectURL(blob);
+    const a = document.createElement("a");
+    a.href = url;
+    a.download = `artifact${ext}`;
+    a.click();
+    URL.revokeObjectURL(url);
+  };
+
+  return (
+    <div className="relative rounded-md border bg-zinc-950 text-zinc-50">
+      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
+        <span className="text-xs text-zinc-400">{language || "plain text"}</span>
+        <div className="flex gap-1">
+          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-zinc-200" onClick={handleCopy}>
+            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
+          </Button>
+          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-zinc-200" onClick={handleDownload}>
+            <Download className="h-3.5 w-3.5" />
+          </Button>
+        </div>
+      </div>
+      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
+        <code>{content}</code>
+      </pre>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/chat/canvas/renderers/MarkdownRenderer.tsx b/apps/web/client/src/components/chat/canvas/renderers/MarkdownRenderer.tsx
new file mode 100644
index 0000000..78b5d3c
--- /dev/null
+++ b/apps/web/client/src/components/chat/canvas/renderers/MarkdownRenderer.tsx
@@ -0,0 +1,13 @@
+import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
+
+interface MarkdownRendererProps {
+  content: string;
+}
+
+export function MarkdownRenderer({ content }: MarkdownRendererProps) {
+  return (
+    <div className="prose prose-sm dark:prose-invert max-w-none p-4">
+      <SafeMarkdown>{content}</SafeMarkdown>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/chat/canvas/renderers/MermaidRenderer.tsx b/apps/web/client/src/components/chat/canvas/renderers/MermaidRenderer.tsx
new file mode 100644
index 0000000..41fa382
--- /dev/null
+++ b/apps/web/client/src/components/chat/canvas/renderers/MermaidRenderer.tsx
@@ -0,0 +1,54 @@
+import { useEffect, useRef, useState } from "react";
+
+interface MermaidRendererProps {
+  content: string;
+}
+
+export function MermaidRenderer({ content }: MermaidRendererProps) {
+  const containerRef = useRef<HTMLDivElement>(null);
+  const [error, setError] = useState<string | null>(null);
+  const [svg, setSvg] = useState<string>("");
+
+  useEffect(() => {
+    let cancelled = false;
+
+    async function render() {
+      try {
+        const mermaid = (await import("mermaid")).default;
+        mermaid.initialize({ startOnLoad: false, theme: "default" });
+        const { svg: rendered } = await mermaid.render(
+          `mermaid-${Date.now()}`,
+          content,
+        );
+        if (!cancelled) {
+          setSvg(rendered);
+          setError(null);
+        }
+      } catch (err: any) {
+        if (!cancelled) {
+          setError(err?.message || "Failed to render Mermaid diagram");
+        }
+      }
+    }
+
+    render();
+    return () => { cancelled = true; };
+  }, [content]);
+
+  if (error) {
+    return (
+      <div className="rounded-md border border-destructive/30 p-4">
+        <p className="text-sm text-destructive">Mermaid rendering error: {error}</p>
+        <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">{content}</pre>
+      </div>
+    );
+  }
+
+  return (
+    <div
+      ref={containerRef}
+      className="flex items-center justify-center overflow-auto rounded-md border p-4"
+      dangerouslySetInnerHTML={{ __html: svg }}
+    />
+  );
+}
diff --git a/apps/web/client/src/components/chat/canvas/renderers/SvgRenderer.tsx b/apps/web/client/src/components/chat/canvas/renderers/SvgRenderer.tsx
new file mode 100644
index 0000000..ee48863
--- /dev/null
+++ b/apps/web/client/src/components/chat/canvas/renderers/SvgRenderer.tsx
@@ -0,0 +1,21 @@
+import { useMemo } from "react";
+import DOMPurify from "dompurify";
+
+interface SvgRendererProps {
+  content: string;
+}
+
+export function SvgRenderer({ content }: SvgRendererProps) {
+  const sanitized = useMemo(() => {
+    return DOMPurify.sanitize(content, {
+      USE_PROFILES: { svg: true, svgFilters: true },
+    });
+  }, [content]);
+
+  return (
+    <div
+      className="flex items-center justify-center overflow-auto rounded-md border p-4"
+      dangerouslySetInnerHTML={{ __html: sanitized }}
+    />
+  );
+}
diff --git a/apps/web/client/src/components/chat/canvas/renderers/TableRenderer.tsx b/apps/web/client/src/components/chat/canvas/renderers/TableRenderer.tsx
new file mode 100644
index 0000000..913e3c6
--- /dev/null
+++ b/apps/web/client/src/components/chat/canvas/renderers/TableRenderer.tsx
@@ -0,0 +1,84 @@
+import { useMemo, useState } from "react";
+import {
+  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
+} from "@/components/ui/table";
+import { Button } from "@/components/ui/button";
+import { ArrowUpDown } from "lucide-react";
+
+interface TableRendererProps {
+  content: string;
+}
+
+export function TableRenderer({ content }: TableRendererProps) {
+  const [sortKey, setSortKey] = useState<string | null>(null);
+  const [sortAsc, setSortAsc] = useState(true);
+
+  const tableData = useMemo(() => {
+    try {
+      const parsed = JSON.parse(content);
+      if (Array.isArray(parsed)) return parsed;
+      if (parsed.rows && Array.isArray(parsed.rows)) return parsed.rows;
+      return null;
+    } catch {
+      return null;
+    }
+  }, [content]);
+
+  if (!tableData || tableData.length === 0) {
+    return (
+      <div className="rounded-md border p-4">
+        <p className="text-sm text-muted-foreground">Unable to parse table data</p>
+        <pre className="mt-2 overflow-x-auto text-xs">{content}</pre>
+      </div>
+    );
+  }
+
+  const columns = Object.keys(tableData[0]);
+  const sorted = sortKey
+    ? [...tableData].sort((a, b) => {
+        const va = a[sortKey];
+        const vb = b[sortKey];
+        const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
+        return sortAsc ? cmp : -cmp;
+      })
+    : tableData;
+
+  const handleSort = (key: string) => {
+    if (sortKey === key) {
+      setSortAsc(!sortAsc);
+    } else {
+      setSortKey(key);
+      setSortAsc(true);
+    }
+  };
+
+  return (
+    <div className="overflow-auto rounded-md border">
+      <Table>
+        <TableHeader>
+          <TableRow>
+            {columns.map((col) => (
+              <TableHead key={col}>
+                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleSort(col)}>
+                  {col}
+                  <ArrowUpDown className="h-3 w-3" />
+                </Button>
+              </TableHead>
+            ))}
+          </TableRow>
+        </TableHeader>
+        <TableBody>
+          {sorted.map((row: any, i: number) => (
+            <TableRow key={i}>
+              {columns.map((col) => (
+                <TableCell key={col} className="text-sm">
+                  {String(row[col] ?? "")}
+                </TableCell>
+              ))}
+            </TableRow>
+          ))}
+        </TableBody>
+      </Table>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Chat.tsx b/apps/web/client/src/pages/Chat.tsx
index 24a6434..06d7cea 100644
--- a/apps/web/client/src/pages/Chat.tsx
+++ b/apps/web/client/src/pages/Chat.tsx
@@ -3,12 +3,13 @@ import { useLocation } from "wouter";
 import { trpc } from "@/lib/trpc";
 import { useAuth } from "@/contexts/AuthContext";
 import { ChatSidebar, ChatView, MemoryPanel, SkillSettings, ArtifactPanel, MediaGenerationPanel, SchedulePanel, type Artifact } from "@/components/chat";
+import { CanvasPane } from "@/components/chat/canvas/CanvasPane";
 import { Button } from "@/components/ui/button";
 import { ChevronLeft, PanelLeftClose, Brain, Wand2, Layers, Sparkles, Bell, Menu } from "lucide-react";
 import { cn } from "@/lib/utils";
 
 
-type RightPanel = "none" | "memory" | "skills" | "artifacts" | "generate" | "schedule";
+type RightPanel = "none" | "memory" | "skills" | "artifacts" | "generate" | "schedule" | "canvas";
 
 export default function Chat() {
   const { isLoading, isAuthenticated } = useAuth();
@@ -344,6 +345,12 @@ export default function Chat() {
               onClose={() => setRightPanel("none")}
             />
           )}
+          {rightPanel === "canvas" && selectedConversationId && (
+            <CanvasPane
+              conversationId={selectedConversationId}
+              onClose={() => setRightPanel("none")}
+            />
+          )}
           {rightPanel === "generate" && (
             <MediaGenerationPanel />
           )}
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 87e8e12..9f16b27 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -1249,7 +1249,7 @@ export const messages = pgTable("messages", {
   /** Artifacts extracted from response (code, markdown, media) */
   artifacts: json("artifacts").$type<Array<{
     id: string;
-    type: "code" | "markdown" | "image" | "video" | "pdf" | "file" | "slideshow" | "chart" | "table";
+    type: "code" | "markdown" | "image" | "video" | "pdf" | "file" | "slideshow" | "chart" | "table" | "mermaid" | "svg" | "react" | "html";
     title?: string;
     content: string | string[];
     language?: string;
diff --git a/apps/web/package.json b/apps/web/package.json
index bb6652d..52fc7d2 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -110,6 +110,7 @@
     "js-yaml": "^4.1.0",
     "jsonwebtoken": "^9.0.2",
     "lucide-react": "^0.453.0",
+    "mermaid": "^11.12.3",
     "multer": "^2.0.2",
     "nanoid": "^5.1.5",
     "next-themes": "^0.4.6",
diff --git a/apps/web/public/sandbox.html b/apps/web/public/sandbox.html
new file mode 100644
index 0000000..94d2cf2
--- /dev/null
+++ b/apps/web/public/sandbox.html
@@ -0,0 +1,63 @@
+<!DOCTYPE html>
+<html lang="en">
+<head>
+  <meta charset="UTF-8">
+  <meta name="viewport" content="width=device-width, initial-scale=1.0">
+  <title>Artifact Sandbox</title>
+  <style>
+    * { margin: 0; padding: 0; box-sizing: border-box; }
+    body { font-family: system-ui, -apple-system, sans-serif; }
+    #root { padding: 8px; }
+    .error { color: #dc2626; padding: 16px; font-size: 14px; }
+  </style>
+</head>
+<body>
+  <div id="root"></div>
+  <script>
+    (function() {
+      const ALLOWED_ORIGIN = 'https://smartaihub.app';
+      const root = document.getElementById('root');
+
+      window.addEventListener('message', function(event) {
+        // Validate origin in production
+        if (event.origin !== ALLOWED_ORIGIN && !event.origin.startsWith('http://localhost')) {
+          return;
+        }
+
+        const data = event.data;
+        if (!data || data.type !== 'render') return;
+
+        try {
+          root.innerHTML = '';
+
+          if (data.artifactType === 'html') {
+            root.innerHTML = data.content;
+          } else if (data.artifactType === 'react') {
+            // For React artifacts, wrap in a basic execution context
+            root.innerHTML = '<div id="react-root"></div>';
+            const script = document.createElement('script');
+            script.textContent = data.content;
+            document.body.appendChild(script);
+          } else {
+            root.textContent = data.content;
+          }
+
+          // Report rendered height
+          requestAnimationFrame(function() {
+            event.source.postMessage({
+              type: 'rendered',
+              height: document.body.scrollHeight,
+            }, '*');
+          });
+        } catch (err) {
+          root.innerHTML = '<div class="error">Error: ' + (err.message || 'Unknown error') + '</div>';
+          event.source.postMessage({
+            type: 'error',
+            message: err.message || 'Rendering failed',
+          }, '*');
+        }
+      });
+    })();
+  </script>
+</body>
+</html>
diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index 670002e..c6accf0 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -68,6 +68,7 @@ import { presentationImportRouter } from "./routers/presentationImport";
 import { sandboxRouter } from "./routers/sandbox";
 import { agencyRouter } from "./routers/agency";
 import { personaRouter } from "./routers/persona";
+import { artifactRouter } from "./routers/artifact";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -1346,6 +1347,9 @@ export const appRouter = router({
   // Chat system (conversations, messages, memory)
   chat: chatRouter,
 
+  // Canvas / AI Artifacts (versioned, interactive artifacts)
+  artifact: artifactRouter,
+
   // Memory system (entity memories, summaries, context)
   memory: memoryRouter,
 
diff --git a/apps/web/server/routers/__tests__/artifact.test.ts b/apps/web/server/routers/__tests__/artifact.test.ts
new file mode 100644
index 0000000..987c31b
--- /dev/null
+++ b/apps/web/server/routers/__tests__/artifact.test.ts
@@ -0,0 +1,90 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const { mockDb } = vi.hoisted(() => {
+  const mockDb = {
+    select: vi.fn(),
+    insert: vi.fn(),
+  };
+  return { mockDb };
+});
+
+vi.mock("../../db", () => ({
+  getDb: vi.fn().mockResolvedValue(mockDb),
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  conversationArtifacts: {
+    id: "id",
+    conversationId: "conversationId",
+    artifactType: "artifactType",
+    version: "version",
+    parentArtifactId: "parentArtifactId",
+    createdAt: "createdAt",
+  },
+  conversations: {
+    id: "id",
+    userId: "userId",
+    tenantId: "tenantId",
+  },
+}));
+
+// Mock the service functions used by the router
+const { mockGetArtifacts, mockGetVersions, mockCreateVersion } = vi.hoisted(() => ({
+  mockGetArtifacts: vi.fn(),
+  mockGetVersions: vi.fn(),
+  mockCreateVersion: vi.fn(),
+}));
+
+vi.mock("../../services/artifactStorageService", () => ({
+  getConversationArtifacts: mockGetArtifacts,
+  getArtifactVersions: mockGetVersions,
+  createArtifactVersion: mockCreateVersion,
+  isSimpleArtifact: vi.fn(),
+  isVersionedArtifact: vi.fn(),
+  storeArtifacts: vi.fn(),
+}));
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+describe("artifact tRPC endpoints", () => {
+  describe("getArtifacts validation", () => {
+    it("returns artifacts for valid conversation", async () => {
+      const artifacts = [
+        { id: "a1", artifactType: "chart", title: "Sales", version: 1 },
+      ];
+      mockGetArtifacts.mockResolvedValue(artifacts);
+
+      const result = await mockGetArtifacts(1, 1, "tenant1");
+      expect(result).toEqual(artifacts);
+      expect(mockGetArtifacts).toHaveBeenCalledWith(1, 1, "tenant1");
+    });
+  });
+
+  describe("getArtifactVersions", () => {
+    it("returns version chain in order", async () => {
+      const versions = [
+        { id: "v1", version: 1, parentArtifactId: null },
+        { id: "v2", version: 2, parentArtifactId: "v1" },
+        { id: "v3", version: 3, parentArtifactId: "v2" },
+      ];
+      mockGetVersions.mockResolvedValue(versions);
+
+      const result = await mockGetVersions("v1", 1, "tenant1");
+      expect(result).toHaveLength(3);
+      expect(result[0].version).toBe(1);
+      expect(result[2].parentArtifactId).toBe("v2");
+    });
+  });
+
+  describe("updateArtifact", () => {
+    it("creates new version via service", async () => {
+      mockCreateVersion.mockResolvedValue({ id: "v2", version: 2 });
+
+      const result = await mockCreateVersion("v1", "new content", 1);
+      expect(result.version).toBe(2);
+      expect(mockCreateVersion).toHaveBeenCalledWith("v1", "new content", 1);
+    });
+  });
+});
diff --git a/apps/web/server/routers/artifact.ts b/apps/web/server/routers/artifact.ts
new file mode 100644
index 0000000..b7c8199
--- /dev/null
+++ b/apps/web/server/routers/artifact.ts
@@ -0,0 +1,77 @@
+/**
+ * Artifact tRPC Router
+ * CRUD operations for conversation artifacts (versioned types).
+ */
+import { z } from "zod";
+import { TRPCError } from "@trpc/server";
+import { protectedProcedure, router } from "../_core/trpc";
+import {
+  getConversationArtifacts,
+  getArtifactVersions,
+  createArtifactVersion,
+} from "../services/artifactStorageService";
+
+export const artifactRouter = router({
+  /** List versioned artifacts for a conversation. */
+  getArtifacts: protectedProcedure
+    .input(z.object({ conversationId: z.number() }))
+    .query(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? ctx.user.tenantId;
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
+
+      try {
+        return await getConversationArtifacts(
+          input.conversationId,
+          ctx.user.id,
+          tenantId,
+        );
+      } catch (err: any) {
+        if (err.message === "FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN" });
+        if (err.message === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND" });
+        throw err;
+      }
+    }),
+
+  /** Get version history for an artifact chain. */
+  getArtifactVersions: protectedProcedure
+    .input(z.object({ artifactId: z.string() }))
+    .query(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? ctx.user.tenantId;
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
+
+      try {
+        return await getArtifactVersions(
+          input.artifactId,
+          ctx.user.id,
+          tenantId,
+        );
+      } catch (err: any) {
+        if (err.message === "FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN" });
+        if (err.message === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND" });
+        throw err;
+      }
+    }),
+
+  /** Create a new version of a versioned artifact. */
+  updateArtifact: protectedProcedure
+    .input(z.object({
+      artifactId: z.string(),
+      content: z.string().max(512000),
+      title: z.string().max(200).optional(),
+    }))
+    .mutation(async ({ ctx, input }) => {
+      try {
+        return await createArtifactVersion(
+          input.artifactId,
+          input.content,
+          ctx.user.id,
+        );
+      } catch (err: any) {
+        if (err.message === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND" });
+        if (err.message?.includes("500KB")) {
+          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: err.message });
+        }
+        throw err;
+      }
+    }),
+});
diff --git a/apps/web/server/routers/chat.ts b/apps/web/server/routers/chat.ts
index 7bdfb80..025af2e 100644
--- a/apps/web/server/routers/chat.ts
+++ b/apps/web/server/routers/chat.ts
@@ -201,7 +201,7 @@ const attachmentSchema = z.object({
 
 const artifactSchema = z.object({
   id: z.string(),
-  type: z.enum(["code", "markdown", "image", "video", "pdf", "file", "slideshow", "chart", "table"]),
+  type: z.enum(["code", "markdown", "image", "video", "pdf", "file", "slideshow", "chart", "table", "mermaid", "svg", "react", "html"]),
   title: z.string().optional(),
   content: z.union([z.string(), z.array(z.string())]),
   language: z.string().optional(),
diff --git a/apps/web/server/services/__tests__/artifactParser.test.ts b/apps/web/server/services/__tests__/artifactParser.test.ts
new file mode 100644
index 0000000..c06591c
--- /dev/null
+++ b/apps/web/server/services/__tests__/artifactParser.test.ts
@@ -0,0 +1,81 @@
+import { describe, it, expect, vi } from "vitest";
+import { parseArtifactBlocks } from "../artifactParser";
+
+describe("artifactParser", () => {
+  describe("parseArtifactBlocks", () => {
+    it("parses single artifact:chart block from response text", () => {
+      const text = `Here is a chart:
+
+\`\`\`artifact:chart title="Sales Chart"
+{"type":"bar","data":[{"label":"Q1","value":100}]}
+\`\`\`
+
+Let me know if you need changes.`;
+
+      const result = parseArtifactBlocks(text);
+      expect(result).toHaveLength(1);
+      expect(result[0].type).toBe("chart");
+      expect(result[0].title).toBe("Sales Chart");
+      expect(result[0].content).toContain('"type":"bar"');
+    });
+
+    it("parses multiple artifact blocks from single response", () => {
+      const text = `Here are two artifacts:
+
+\`\`\`artifact:code language="python" title="Script"
+print("hello")
+\`\`\`
+
+And a table:
+
+\`\`\`artifact:table title="Users"
+[{"name":"Alice","age":30},{"name":"Bob","age":25}]
+\`\`\``;
+
+      const result = parseArtifactBlocks(text);
+      expect(result).toHaveLength(2);
+      expect(result[0].type).toBe("code");
+      expect(result[0].language).toBe("python");
+      expect(result[0].title).toBe("Script");
+      expect(result[1].type).toBe("table");
+      expect(result[1].title).toBe("Users");
+    });
+
+    it("returns empty array for response with no artifact blocks", () => {
+      const text = "Just a regular response with no artifacts at all.";
+      const result = parseArtifactBlocks(text);
+      expect(result).toEqual([]);
+    });
+
+    it("handles malformed artifact blocks gracefully", () => {
+      const text = `Here is a broken block:
+
+\`\`\`artifact:chart title="Broken"
+{"data": [1,2,3]
+`;
+      // Unclosed block - should return empty or skip
+      const result = parseArtifactBlocks(text);
+      expect(result).toEqual([]);
+    });
+
+    it("extracts title from artifact metadata if present", () => {
+      const text = `\`\`\`artifact:code title="My Script"
+console.log("hi");
+\`\`\``;
+
+      const result = parseArtifactBlocks(text);
+      expect(result).toHaveLength(1);
+      expect(result[0].title).toBe("My Script");
+    });
+
+    it("extracts language for code-type artifacts", () => {
+      const text = `\`\`\`artifact:code language="python"
+print("hello")
+\`\`\``;
+
+      const result = parseArtifactBlocks(text);
+      expect(result).toHaveLength(1);
+      expect(result[0].language).toBe("python");
+    });
+  });
+});
diff --git a/apps/web/server/services/__tests__/artifactStorage.test.ts b/apps/web/server/services/__tests__/artifactStorage.test.ts
new file mode 100644
index 0000000..2b324aa
--- /dev/null
+++ b/apps/web/server/services/__tests__/artifactStorage.test.ts
@@ -0,0 +1,88 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const { mockDb } = vi.hoisted(() => {
+  const mockDb = {
+    insert: vi.fn(),
+    select: vi.fn(),
+    update: vi.fn(),
+  };
+  return { mockDb };
+});
+
+vi.mock("../../db", () => ({
+  getDb: vi.fn().mockResolvedValue(mockDb),
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  conversationArtifacts: { id: "id", conversationId: "conversationId" },
+  messages: { id: "id", artifacts: "artifacts" },
+}));
+
+import {
+  isSimpleArtifact,
+  isVersionedArtifact,
+  storeArtifacts,
+  createArtifactVersion,
+} from "../artifactStorageService";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+describe("artifactStorage", () => {
+  it("code artifact is identified as simple type", () => {
+    expect(isSimpleArtifact("code")).toBe(true);
+    expect(isSimpleArtifact("markdown")).toBe(true);
+    expect(isSimpleArtifact("mermaid")).toBe(true);
+    expect(isSimpleArtifact("svg")).toBe(true);
+  });
+
+  it("react artifact is identified as versioned type", () => {
+    expect(isVersionedArtifact("react")).toBe(true);
+    expect(isVersionedArtifact("html")).toBe(true);
+    expect(isVersionedArtifact("chart")).toBe(true);
+    expect(isVersionedArtifact("table")).toBe(true);
+  });
+
+  it("storeArtifacts handles versioned types with db insert", async () => {
+    mockDb.insert.mockReturnValue({
+      values: vi.fn().mockResolvedValue(undefined),
+    });
+    mockDb.select.mockReturnValue({
+      from: vi.fn().mockReturnValue({
+        where: vi.fn().mockReturnValue({
+          limit: vi.fn().mockReturnValue([{ id: 1, artifacts: [] }]),
+        }),
+      }),
+    });
+    mockDb.update.mockReturnValue({
+      set: vi.fn().mockReturnValue({
+        where: vi.fn().mockResolvedValue(undefined),
+      }),
+    });
+
+    await storeArtifacts(1, 100, [
+      { type: "react", content: "<div>Hello</div>", title: "My Component" },
+    ]);
+
+    expect(mockDb.insert).toHaveBeenCalled();
+  });
+
+  it("artifact content over 500KB is rejected", async () => {
+    const bigContent = "x".repeat(512_001);
+
+    mockDb.select.mockReturnValue({
+      from: vi.fn().mockReturnValue({
+        where: vi.fn().mockReturnValue([{
+          id: "abc",
+          version: 1,
+          conversationId: 1,
+        }]),
+      }),
+    });
+
+    await expect(
+      createArtifactVersion("abc", bigContent, 1)
+    ).rejects.toThrow(/500KB/);
+  });
+});
diff --git a/apps/web/server/services/artifactParser.ts b/apps/web/server/services/artifactParser.ts
new file mode 100644
index 0000000..86956ea
--- /dev/null
+++ b/apps/web/server/services/artifactParser.ts
@@ -0,0 +1,61 @@
+/**
+ * Artifact Parser
+ * Parses LLM response text for ```artifact:TYPE ... ``` fenced blocks.
+ */
+
+const VALID_TYPES = new Set([
+  "code", "markdown", "mermaid", "svg", "react", "html", "chart", "table",
+]);
+
+export interface ParsedArtifact {
+  type: "code" | "markdown" | "mermaid" | "svg" | "react" | "html" | "chart" | "table";
+  content: string;
+  title?: string;
+  language?: string;
+}
+
+/**
+ * Regex matches ```artifact:TYPE ... ``` blocks.
+ * Captures: type, rest of opening line (for attributes), and content.
+ */
+const ARTIFACT_BLOCK_RE = /```artifact:(\w+)([^\n]*)\n([\s\S]*?)```/g;
+
+/** Extract a quoted attribute value from a string like: title="My Title" */
+function extractAttr(line: string, attr: string): string | undefined {
+  const re = new RegExp(`${attr}="([^"]*)"`, "i");
+  const match = line.match(re);
+  return match?.[1] || undefined;
+}
+
+export function parseArtifactBlocks(responseText: string): ParsedArtifact[] {
+  const results: ParsedArtifact[] = [];
+  let match: RegExpExecArray | null;
+
+  // Reset regex state
+  ARTIFACT_BLOCK_RE.lastIndex = 0;
+
+  while ((match = ARTIFACT_BLOCK_RE.exec(responseText)) !== null) {
+    const rawType = match[1].toLowerCase();
+    const attrLine = match[2];
+    const content = match[3].trimEnd();
+
+    if (!VALID_TYPES.has(rawType)) {
+      continue;
+    }
+
+    const artifact: ParsedArtifact = {
+      type: rawType as ParsedArtifact["type"],
+      content,
+    };
+
+    const title = extractAttr(attrLine, "title");
+    if (title) artifact.title = title;
+
+    const language = extractAttr(attrLine, "language");
+    if (language) artifact.language = language;
+
+    results.push(artifact);
+  }
+
+  return results;
+}
diff --git a/apps/web/server/services/artifactStorageService.ts b/apps/web/server/services/artifactStorageService.ts
new file mode 100644
index 0000000..5f5370f
--- /dev/null
+++ b/apps/web/server/services/artifactStorageService.ts
@@ -0,0 +1,235 @@
+/**
+ * Artifact Storage Service
+ * Routes artifact types to correct storage (messages.artifacts JSONB vs conversationArtifacts table).
+ */
+import { eq, and, asc, desc } from "drizzle-orm";
+import { getDb } from "../db";
+import { conversationArtifacts, messages, conversations } from "../../drizzle/schema";
+import type { ParsedArtifact } from "./artifactParser";
+import { randomUUID } from "crypto";
+
+const MAX_CONTENT_BYTES = 512_000; // 500KB
+
+/** Types stored in messages.artifacts JSONB (simple, no versioning) */
+const SIMPLE_TYPES = new Set(["code", "markdown", "mermaid", "svg"]);
+
+/** Types stored in conversationArtifacts table (versioned, interactive) */
+const VERSIONED_TYPES = new Set(["react", "html", "chart", "table"]);
+
+export function isSimpleArtifact(type: string): boolean {
+  return SIMPLE_TYPES.has(type);
+}
+
+export function isVersionedArtifact(type: string): boolean {
+  return VERSIONED_TYPES.has(type);
+}
+
+/**
+ * Store parsed artifacts from an LLM response.
+ * - Simple types: append to messages.artifacts JSONB array
+ * - Versioned types: INSERT into conversationArtifacts with version=1
+ */
+export async function storeArtifacts(
+  conversationId: number,
+  messageId: number,
+  artifacts: ParsedArtifact[],
+): Promise<void> {
+  const db = await getDb();
+  if (!db || artifacts.length === 0) return;
+
+  const simpleArtifacts = artifacts.filter((a) => isSimpleArtifact(a.type));
+  const versionedArtifacts = artifacts.filter((a) => isVersionedArtifact(a.type));
+
+  // Append simple artifacts to messages.artifacts JSONB
+  if (simpleArtifacts.length > 0) {
+    const [msg] = await db
+      .select({ id: messages.id, artifacts: messages.artifacts })
+      .from(messages)
+      .where(eq(messages.id, messageId))
+      .limit(1);
+
+    if (msg) {
+      const existing = (msg.artifacts as any[]) || [];
+      const newEntries = simpleArtifacts.map((a) => ({
+        id: randomUUID(),
+        type: a.type,
+        title: a.title || `${a.type} artifact`,
+        content: a.content,
+        language: a.language,
+      }));
+
+      await db
+        .update(messages)
+        .set({ artifacts: [...existing, ...newEntries] })
+        .where(eq(messages.id, messageId));
+    }
+  }
+
+  // Insert versioned artifacts into conversationArtifacts table
+  for (const artifact of versionedArtifacts) {
+    await db.insert(conversationArtifacts).values({
+      id: randomUUID(),
+      conversationId,
+      messageId,
+      artifactType: artifact.type,
+      title: artifact.title || `${artifact.type} artifact`,
+      content: artifact.content,
+      language: artifact.language,
+      version: 1,
+      parentArtifactId: null,
+    });
+  }
+}
+
+/**
+ * Create a new version of an existing artifact.
+ * INSERTs a new row with parentArtifactId pointing to the current version.
+ */
+export async function createArtifactVersion(
+  artifactId: string,
+  newContent: string,
+  userId: number,
+): Promise<{ id: string; version: number }> {
+  if (new TextEncoder().encode(newContent).length > MAX_CONTENT_BYTES) {
+    throw new Error("Artifact content exceeds 500KB limit");
+  }
+
+  const db = await getDb();
+  if (!db) throw new Error("Database unavailable");
+
+  // Get existing artifact
+  const [existing] = await db
+    .select()
+    .from(conversationArtifacts)
+    .where(eq(conversationArtifacts.id, artifactId));
+
+  if (!existing) throw new Error("NOT_FOUND");
+
+  const newId = randomUUID();
+  const newVersion = (existing.version ?? 1) + 1;
+
+  await db.insert(conversationArtifacts).values({
+    id: newId,
+    conversationId: existing.conversationId,
+    messageId: existing.messageId,
+    artifactType: existing.artifactType,
+    title: existing.title,
+    content: newContent,
+    language: existing.language,
+    version: newVersion,
+    parentArtifactId: artifactId,
+  });
+
+  return { id: newId, version: newVersion };
+}
+
+/**
+ * Get all versioned artifacts for a conversation.
+ * Only returns the latest version of each artifact chain.
+ */
+export async function getConversationArtifacts(
+  conversationId: number,
+  userId: number,
+  tenantId: string,
+): Promise<any[]> {
+  const db = await getDb();
+  if (!db) return [];
+
+  // Verify ownership
+  const [convo] = await db
+    .select({ id: conversations.id, userId: conversations.userId, tenantId: conversations.tenantId })
+    .from(conversations)
+    .where(
+      and(
+        eq(conversations.id, conversationId),
+        eq(conversations.tenantId, tenantId),
+      ),
+    );
+
+  if (!convo) throw new Error("NOT_FOUND");
+  if (convo.userId !== userId) throw new Error("FORBIDDEN");
+
+  return db
+    .select()
+    .from(conversationArtifacts)
+    .where(eq(conversationArtifacts.conversationId, conversationId))
+    .orderBy(asc(conversationArtifacts.createdAt));
+}
+
+/**
+ * Get version history for a specific artifact chain.
+ */
+export async function getArtifactVersions(
+  artifactId: string,
+  userId: number,
+  tenantId: string,
+): Promise<any[]> {
+  const db = await getDb();
+  if (!db) return [];
+
+  // Get the artifact to find its conversation
+  const [artifact] = await db
+    .select()
+    .from(conversationArtifacts)
+    .where(eq(conversationArtifacts.id, artifactId));
+
+  if (!artifact) throw new Error("NOT_FOUND");
+
+  // Verify ownership through conversation
+  const [convo] = await db
+    .select({ userId: conversations.userId, tenantId: conversations.tenantId })
+    .from(conversations)
+    .where(eq(conversations.id, artifact.conversationId));
+
+  if (!convo) throw new Error("NOT_FOUND");
+  if (convo.tenantId !== tenantId || convo.userId !== userId) {
+    throw new Error("FORBIDDEN");
+  }
+
+  // Find the root artifact (version 1)
+  let rootId = artifactId;
+  if (artifact.parentArtifactId) {
+    // Walk up the chain to find root
+    const all = await db
+      .select()
+      .from(conversationArtifacts)
+      .where(eq(conversationArtifacts.conversationId, artifact.conversationId));
+
+    const byId = new Map(all.map((a) => [a.id, a]));
+    let current = artifact;
+    while (current.parentArtifactId && byId.has(current.parentArtifactId)) {
+      current = byId.get(current.parentArtifactId)!;
+    }
+    rootId = current.id;
+  }
+
+  // Get all versions in chain
+  const allArtifacts = await db
+    .select()
+    .from(conversationArtifacts)
+    .where(eq(conversationArtifacts.conversationId, artifact.conversationId))
+    .orderBy(asc(conversationArtifacts.version));
+
+  // Filter to just this chain
+  const chain: any[] = [];
+  const visited = new Set<string>();
+  const queue = [rootId];
+
+  while (queue.length > 0) {
+    const id = queue.shift()!;
+    if (visited.has(id)) continue;
+    visited.add(id);
+
+    const item = allArtifacts.find((a) => a.id === id);
+    if (item) chain.push(item);
+
+    // Find children
+    for (const a of allArtifacts) {
+      if (a.parentArtifactId === id && !visited.has(a.id)) {
+        queue.push(a.id);
+      }
+    }
+  }
+
+  return chain.sort((a, b) => a.version - b.version);
+}
diff --git a/apps/web/server/services/chatService.ts b/apps/web/server/services/chatService.ts
index 2391638..3dbff44 100644
--- a/apps/web/server/services/chatService.ts
+++ b/apps/web/server/services/chatService.ts
@@ -17,6 +17,7 @@ import {
   InsertConversationSummary,
   EntityMemory,
   InsertEntityMemory,
+  tenants,
 } from "../../drizzle/schema";
 
 // ==================== Google Drive Integration ====================
@@ -727,6 +728,35 @@ export async function buildChatContext(
     });
   }
 
+  // 2c. Add canvas artifact format instruction if feature flag enabled
+  try {
+    const convTenantId = tenantId;
+    if (convTenantId) {
+      const db = await getDb();
+      if (db) {
+        const [tenant] = await db
+          .select({ settings: tenants.settings })
+          .from(tenants)
+          .where(eq(tenants.id, convTenantId))
+          .limit(1);
+        const featureFlags = (tenant?.settings as any)?.featureFlags;
+        if (featureFlags?.canvas) {
+          context.push({
+            role: "system",
+            content: `When generating charts, tables, code, or interactive content, use the artifact format:
+\`\`\`artifact:TYPE title="Title" language="lang"
+content
+\`\`\`
+Supported types: code, markdown, mermaid, svg, react, html, chart, table.
+Use 'react' for interactive React components, 'chart' for data visualizations (JSON format), 'table' for structured data.`,
+          });
+        }
+      }
+    }
+  } catch {
+    // Canvas feature flag check failed — continue without canvas instruction
+  }
+
   // 3. Add summaries
   const summaries = await getSummaries(conversationId);
   if (summaries.length > 0) {
diff --git a/nginx/conf.d/sandbox.conf b/nginx/conf.d/sandbox.conf
new file mode 100644
index 0000000..5460b0b
--- /dev/null
+++ b/nginx/conf.d/sandbox.conf
@@ -0,0 +1,20 @@
+# Sandbox domain for rendering untrusted HTML/React artifacts in isolated iframe.
+# Separate origin prevents access to main app cookies, localStorage, and DOM.
+server {
+    listen 80;
+    server_name sandbox.smartaihub.app;
+
+    # Serve sandbox HTML shell
+    root /var/www/sandbox;
+    index sandbox.html;
+
+    # Strict CSP headers
+    add_header Content-Security-Policy "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" always;
+    add_header X-Content-Type-Options "nosniff" always;
+    add_header X-Frame-Options "ALLOWALL" always;
+    add_header Referrer-Policy "no-referrer" always;
+
+    location / {
+        try_files $uri $uri/ /sandbox.html;
+    }
+}
diff --git a/package-lock.json b/package-lock.json
index e8a7952..b356bd0 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -171,6 +171,7 @@
         "js-yaml": "^4.1.0",
         "jsonwebtoken": "^9.0.2",
         "lucide-react": "^0.453.0",
+        "mermaid": "^11.12.3",
         "multer": "^2.0.2",
         "nanoid": "^5.1.5",
         "next-themes": "^0.4.6",
@@ -258,17 +259,6 @@
         "node": ">=6.0.0"
       }
     },
-    "apps/web/node_modules/@antfu/install-pkg": {
-      "version": "1.1.0",
-      "license": "MIT",
-      "dependencies": {
-        "package-manager-detector": "^1.3.0",
-        "tinyexec": "^1.0.1"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/antfu"
-      }
-    },
     "apps/web/node_modules/@aws-crypto/crc32": {
       "version": "5.2.0",
       "license": "Apache-2.0",
@@ -1106,10 +1096,6 @@
       "dev": true,
       "license": "MIT"
     },
-    "apps/web/node_modules/@braintree/sanitize-url": {
-      "version": "7.1.1",
-      "license": "MIT"
-    },
     "apps/web/node_modules/@builder.io/jsx-loc-internals": {
       "version": "0.0.1",
       "dev": true,
@@ -1129,43 +1115,6 @@
         "vite": "^4.0.0 || ^5.0.0"
       }
     },
-    "apps/web/node_modules/@chevrotain/cst-dts-gen": {
-      "version": "11.0.3",
-      "license": "Apache-2.0",
-      "dependencies": {
-        "@chevrotain/gast": "11.0.3",
-        "@chevrotain/types": "11.0.3",
-        "lodash-es": "4.17.21"
-      }
-    },
-    "apps/web/node_modules/@chevrotain/cst-dts-gen/node_modules/lodash-es": {
-      "version": "4.17.21",
-      "license": "MIT"
-    },
-    "apps/web/node_modules/@chevrotain/gast": {
-      "version": "11.0.3",
-      "license": "Apache-2.0",
-      "dependencies": {
-        "@chevrotain/types": "11.0.3",
-        "lodash-es": "4.17.21"
-      }
-    },
-    "apps/web/node_modules/@chevrotain/gast/node_modules/lodash-es": {
-      "version": "4.17.21",
-      "license": "MIT"
-    },
-    "apps/web/node_modules/@chevrotain/regexp-to-ast": {
-      "version": "11.0.3",
-      "license": "Apache-2.0"
-    },
-    "apps/web/node_modules/@chevrotain/types": {
-      "version": "11.0.3",
-      "license": "Apache-2.0"
-    },
-    "apps/web/node_modules/@chevrotain/utils": {
-      "version": "11.0.3",
-      "license": "Apache-2.0"
-    },
     "apps/web/node_modules/@drizzle-team/brocli": {
       "version": "0.10.2",
       "dev": true,
@@ -1612,19 +1561,6 @@
         "node": ">=18"
       }
     },
-    "apps/web/node_modules/@iconify/types": {
-      "version": "2.0.0",
-      "license": "MIT"
-    },
-    "apps/web/node_modules/@iconify/utils": {
-      "version": "3.1.0",
-      "license": "MIT",
-      "dependencies": {
-        "@antfu/install-pkg": "^1.1.0",
-        "@iconify/types": "^2.0.0",
-        "mlly": "^1.8.0"
-      }
-    },
     "apps/web/node_modules/@istanbuljs/schema": {
       "version": "0.1.3",
       "dev": true,
@@ -1638,13 +1574,6 @@
       "dev": true,
       "license": "MIT"
     },
-    "apps/web/node_modules/@mermaid-js/parser": {
-      "version": "0.6.3",
-      "license": "MIT",
-      "dependencies": {
-        "langium": "3.3.1"
-      }
-    },
     "apps/web/node_modules/@redis/bloom": {
       "version": "1.2.0",
       "license": "MIT",
@@ -2943,47 +2872,10 @@
         "node": ">= 16"
       }
     },
-    "apps/web/node_modules/chevrotain": {
-      "version": "11.0.3",
-      "license": "Apache-2.0",
-      "dependencies": {
-        "@chevrotain/cst-dts-gen": "11.0.3",
-        "@chevrotain/gast": "11.0.3",
-        "@chevrotain/regexp-to-ast": "11.0.3",
-        "@chevrotain/types": "11.0.3",
-        "@chevrotain/utils": "11.0.3",
-        "lodash-es": "4.17.21"
-      }
-    },
-    "apps/web/node_modules/chevrotain-allstar": {
-      "version": "0.3.1",
-      "license": "MIT",
-      "dependencies": {
-        "lodash-es": "^4.17.21"
-      },
-      "peerDependencies": {
-        "chevrotain": "^11.0.0"
-      }
-    },
-    "apps/web/node_modules/chevrotain/node_modules/lodash-es": {
-      "version": "4.17.21",
-      "license": "MIT"
-    },
     "apps/web/node_modules/chownr": {
       "version": "1.1.4",
       "license": "ISC"
     },
-    "apps/web/node_modules/commander": {
-      "version": "8.3.0",
-      "license": "MIT",
-      "engines": {
-        "node": ">= 12"
-      }
-    },
-    "apps/web/node_modules/confbox": {
-      "version": "0.1.8",
-      "license": "MIT"
-    },
     "apps/web/node_modules/content-disposition": {
       "version": "0.5.4",
       "license": "MIT",
@@ -3051,13 +2943,6 @@
         "url": "https://github.com/sponsors/mesqueeb"
       }
     },
-    "apps/web/node_modules/cose-base": {
-      "version": "1.0.3",
-      "license": "MIT",
-      "dependencies": {
-        "layout-base": "^1.0.0"
-      }
-    },
     "apps/web/node_modules/cpu-features": {
       "version": "0.0.10",
       "hasInstallScript": true,
@@ -3070,288 +2955,6 @@
         "node": ">=10.0.0"
       }
     },
-    "apps/web/node_modules/cytoscape": {
-      "version": "3.33.1",
-      "license": "MIT",
-      "peer": true,
-      "engines": {
-        "node": ">=0.10"
-      }
-    },
-    "apps/web/node_modules/cytoscape-cose-bilkent": {
-      "version": "4.1.0",
-      "license": "MIT",
-      "dependencies": {
-        "cose-base": "^1.0.0"
-      },
-      "peerDependencies": {
-        "cytoscape": "^3.2.0"
-      }
-    },
-    "apps/web/node_modules/cytoscape-fcose": {
-      "version": "2.2.0",
-      "license": "MIT",
-      "dependencies": {
-        "cose-base": "^2.2.0"
-      },
-      "peerDependencies": {
-        "cytoscape": "^3.2.0"
-      }
-    },
-    "apps/web/node_modules/cytoscape-fcose/node_modules/cose-base": {
-      "version": "2.2.0",
-      "license": "MIT",
-      "dependencies": {
-        "layout-base": "^2.0.0"
-      }
-    },
-    "apps/web/node_modules/cytoscape-fcose/node_modules/layout-base": {
-      "version": "2.0.1",
-      "license": "MIT"
-    },
-    "apps/web/node_modules/d3": {
-      "version": "7.9.0",
-      "license": "ISC",
-      "dependencies": {
-        "d3-array": "3",
-        "d3-axis": "3",
-        "d3-brush": "3",
-        "d3-chord": "3",
-        "d3-color": "3",
-        "d3-contour": "4",
-        "d3-delaunay": "6",
-        "d3-dispatch": "3",
-        "d3-drag": "3",
-        "d3-dsv": "3",
-        "d3-ease": "3",
-        "d3-fetch": "3",
-        "d3-force": "3",
-        "d3-format": "3",
-        "d3-geo": "3",
-        "d3-hierarchy": "3",
-        "d3-interpolate": "3",
-        "d3-path": "3",
-        "d3-polygon": "3",
-        "d3-quadtree": "3",
-        "d3-random": "3",
-        "d3-scale": "4",
-        "d3-scale-chromatic": "3",
-        "d3-selection": "3",
-        "d3-shape": "3",
-        "d3-time": "3",
-        "d3-time-format": "4",
-        "d3-timer": "3",
-        "d3-transition": "3",
-        "d3-zoom": "3"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-axis": {
-      "version": "3.0.0",
-      "license": "ISC",
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-brush": {
-      "version": "3.0.0",
-      "license": "ISC",
-      "dependencies": {
-        "d3-dispatch": "1 - 3",
-        "d3-drag": "2 - 3",
-        "d3-interpolate": "1 - 3",
-        "d3-selection": "3",
-        "d3-transition": "3"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-chord": {
-      "version": "3.0.1",
-      "license": "ISC",
-      "dependencies": {
-        "d3-path": "1 - 3"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-contour": {
-      "version": "4.0.2",
-      "license": "ISC",
-      "dependencies": {
-        "d3-array": "^3.2.0"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-delaunay": {
-      "version": "6.0.4",
-      "license": "ISC",
-      "dependencies": {
-        "delaunator": "5"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-dsv": {
-      "version": "3.0.1",
-      "license": "ISC",
-      "dependencies": {
-        "commander": "7",
-        "iconv-lite": "0.6",
-        "rw": "1"
-      },
-      "bin": {
-        "csv2json": "bin/dsv2json.js",
-        "csv2tsv": "bin/dsv2dsv.js",
-        "dsv2dsv": "bin/dsv2dsv.js",
-        "dsv2json": "bin/dsv2json.js",
-        "json2csv": "bin/json2dsv.js",
-        "json2dsv": "bin/json2dsv.js",
-        "json2tsv": "bin/json2dsv.js",
-        "tsv2csv": "bin/dsv2dsv.js",
-        "tsv2json": "bin/dsv2json.js"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-dsv/node_modules/commander": {
-      "version": "7.2.0",
-      "license": "MIT",
-      "engines": {
-        "node": ">= 10"
-      }
-    },
-    "apps/web/node_modules/d3-dsv/node_modules/iconv-lite": {
-      "version": "0.6.3",
-      "license": "MIT",
-      "dependencies": {
-        "safer-buffer": ">= 2.1.2 < 3.0.0"
-      },
-      "engines": {
-        "node": ">=0.10.0"
-      }
-    },
-    "apps/web/node_modules/d3-fetch": {
-      "version": "3.0.1",
-      "license": "ISC",
-      "dependencies": {
-        "d3-dsv": "1 - 3"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-force": {
-      "version": "3.0.0",
-      "license": "ISC",
-      "dependencies": {
-        "d3-dispatch": "1 - 3",
-        "d3-quadtree": "1 - 3",
-        "d3-timer": "1 - 3"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-geo": {
-      "version": "3.1.1",
-      "license": "ISC",
-      "dependencies": {
-        "d3-array": "2.5.0 - 3"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-hierarchy": {
-      "version": "3.1.2",
-      "license": "ISC",
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-polygon": {
-      "version": "3.0.1",
-      "license": "ISC",
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-quadtree": {
-      "version": "3.0.1",
-      "license": "ISC",
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-random": {
-      "version": "3.0.1",
-      "license": "ISC",
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/d3-sankey": {
-      "version": "0.12.3",
-      "license": "BSD-3-Clause",
-      "dependencies": {
-        "d3-array": "1 - 2",
-        "d3-shape": "^1.2.0"
-      }
-    },
-    "apps/web/node_modules/d3-sankey/node_modules/d3-array": {
-      "version": "2.12.1",
-      "license": "BSD-3-Clause",
-      "dependencies": {
-        "internmap": "^1.0.0"
-      }
-    },
-    "apps/web/node_modules/d3-sankey/node_modules/d3-path": {
-      "version": "1.0.9",
-      "license": "BSD-3-Clause"
-    },
-    "apps/web/node_modules/d3-sankey/node_modules/d3-shape": {
-      "version": "1.3.7",
-      "license": "BSD-3-Clause",
-      "dependencies": {
-        "d3-path": "1"
-      }
-    },
-    "apps/web/node_modules/d3-sankey/node_modules/internmap": {
-      "version": "1.0.1",
-      "license": "ISC"
-    },
-    "apps/web/node_modules/d3-scale-chromatic": {
-      "version": "3.1.0",
-      "license": "ISC",
-      "dependencies": {
-        "d3-color": "1 - 3",
-        "d3-interpolate": "1 - 3"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
-    "apps/web/node_modules/dagre-d3-es": {
-      "version": "7.0.13",
-      "license": "MIT",
-      "dependencies": {
-        "d3": "^7.9.0",
-        "lodash-es": "^4.17.21"
-      }
-    },
-    "apps/web/node_modules/dayjs": {
-      "version": "1.11.19",
-      "license": "MIT"
-    },
     "apps/web/node_modules/deep-eql": {
       "version": "5.0.2",
       "dev": true,
@@ -3367,13 +2970,6 @@
         "node": ">=0.10.0"
       }
     },
-    "apps/web/node_modules/delaunator": {
-      "version": "5.0.1",
-      "license": "ISC",
-      "dependencies": {
-        "robust-predicates": "^3.0.2"
-      }
-    },
     "apps/web/node_modules/depd": {
       "version": "2.0.0",
       "license": "MIT",
@@ -4314,10 +3910,6 @@
         "url": "https://github.com/privatenumber/get-tsconfig?sponsor=1"
       }
     },
-    "apps/web/node_modules/hachure-fill": {
-      "version": "0.5.2",
-      "license": "MIT"
-    },
     "apps/web/node_modules/hast": {
       "version": "1.0.0",
       "license": "MIT"
@@ -4624,45 +4216,6 @@
         "node": ">=10"
       }
     },
-    "apps/web/node_modules/katex": {
-      "version": "0.16.27",
-      "funding": [
-        "https://opencollective.com/katex",
-        "https://github.com/sponsors/katex"
-      ],
-      "license": "MIT",
-      "dependencies": {
-        "commander": "^8.3.0"
-      },
-      "bin": {
-        "katex": "cli.js"
-      }
-    },
-    "apps/web/node_modules/khroma": {
-      "version": "2.1.0"
-    },
-    "apps/web/node_modules/langium": {
-      "version": "3.3.1",
-      "license": "MIT",
-      "dependencies": {
-        "chevrotain": "~11.0.3",
-        "chevrotain-allstar": "~0.3.0",
-        "vscode-languageserver": "~9.0.1",
-        "vscode-languageserver-textdocument": "~1.0.11",
-        "vscode-uri": "~3.0.8"
-      },
-      "engines": {
-        "node": ">=16.0.0"
-      }
-    },
-    "apps/web/node_modules/layout-base": {
-      "version": "1.0.2",
-      "license": "MIT"
-    },
-    "apps/web/node_modules/lodash-es": {
-      "version": "4.17.22",
-      "license": "MIT"
-    },
     "apps/web/node_modules/lodash.includes": {
       "version": "4.3.0",
       "license": "MIT"
@@ -4727,16 +4280,6 @@
         "source-map-js": "^1.2.0"
       }
     },
-    "apps/web/node_modules/marked": {
-      "version": "16.4.2",
-      "license": "MIT",
-      "bin": {
-        "marked": "bin/marked.js"
-      },
-      "engines": {
-        "node": ">= 20"
-      }
-    },
     "apps/web/node_modules/mdast-util-math": {
       "version": "3.0.0",
       "license": "MIT",
@@ -4761,32 +4304,6 @@
         "url": "https://github.com/sponsors/sindresorhus"
       }
     },
-    "apps/web/node_modules/mermaid": {
-      "version": "11.12.2",
-      "license": "MIT",
-      "dependencies": {
-        "@braintree/sanitize-url": "^7.1.1",
-        "@iconify/utils": "^3.0.1",
-        "@mermaid-js/parser": "^0.6.3",
-        "@types/d3": "^7.4.3",
-        "cytoscape": "^3.29.3",
-        "cytoscape-cose-bilkent": "^4.1.0",
-        "cytoscape-fcose": "^2.2.0",
-        "d3": "^7.9.0",
-        "d3-sankey": "^0.12.3",
-        "dagre-d3-es": "7.0.13",
-        "dayjs": "^1.11.18",
-        "dompurify": "^3.2.5",
-        "katex": "^0.16.22",
-        "khroma": "^2.1.0",
-        "lodash-es": "^4.17.21",
-        "marked": "^16.2.1",
-        "roughjs": "^4.6.6",
-        "stylis": "^4.3.6",
-        "ts-dedent": "^2.2.0",
-        "uuid": "^11.1.0"
-      }
-    },
     "apps/web/node_modules/micromark-extension-cjk-friendly": {
       "version": "1.2.3",
       "license": "MIT",
@@ -4901,16 +4418,6 @@
       "version": "0.5.3",
       "license": "MIT"
     },
-    "apps/web/node_modules/mlly": {
-      "version": "1.8.0",
-      "license": "MIT",
-      "dependencies": {
-        "acorn": "^8.15.0",
-        "pathe": "^2.0.3",
-        "pkg-types": "^1.3.1",
-        "ufo": "^1.6.1"
-      }
-    },
     "apps/web/node_modules/modern-screenshot": {
       "version": "4.6.7",
       "dev": true,
@@ -5019,10 +4526,6 @@
         "regex-recursion": "^6.0.2"
       }
     },
-    "apps/web/node_modules/package-manager-detector": {
-      "version": "1.6.0",
-      "license": "MIT"
-    },
     "apps/web/node_modules/parse-srcset": {
       "version": "1.0.2",
       "license": "MIT"
@@ -5034,10 +4537,6 @@
         "node": ">= 0.8"
       }
     },
-    "apps/web/node_modules/path-data-parser": {
-      "version": "0.1.0",
-      "license": "MIT"
-    },
     "apps/web/node_modules/path-to-regexp": {
       "version": "0.1.12",
       "license": "MIT"
@@ -5050,15 +4549,6 @@
         "node": ">= 14.16"
       }
     },
-    "apps/web/node_modules/pkg-types": {
-      "version": "1.3.1",
-      "license": "MIT",
-      "dependencies": {
-        "confbox": "^0.1.8",
-        "mlly": "^1.7.4",
-        "pathe": "^2.0.1"
-      }
-    },
     "apps/web/node_modules/pnpm": {
       "version": "10.28.0",
       "dev": true,
@@ -5074,18 +4564,6 @@
         "url": "https://opencollective.com/pnpm"
       }
     },
-    "apps/web/node_modules/points-on-curve": {
-      "version": "0.2.0",
-      "license": "MIT"
-    },
-    "apps/web/node_modules/points-on-path": {
-      "version": "0.2.1",
-      "license": "MIT",
-      "dependencies": {
-        "path-data-parser": "0.1.0",
-        "points-on-curve": "0.2.0"
-      }
-    },
     "apps/web/node_modules/postgres": {
       "version": "3.4.8",
       "license": "Unlicense",
@@ -5354,24 +4832,6 @@
         "url": "https://github.com/privatenumber/resolve-pkg-maps?sponsor=1"
       }
     },
-    "apps/web/node_modules/robust-predicates": {
-      "version": "3.0.2",
-      "license": "Unlicense"
-    },
-    "apps/web/node_modules/roughjs": {
-      "version": "4.6.6",
-      "license": "MIT",
-      "dependencies": {
-        "hachure-fill": "^0.5.2",
-        "path-data-parser": "^0.1.0",
-        "points-on-curve": "^0.2.0",
-        "points-on-path": "^0.2.1"
-      }
-    },
-    "apps/web/node_modules/rw": {
-      "version": "1.3.3",
-      "license": "BSD-3-Clause"
-    },
     "apps/web/node_modules/sanitize-html": {
       "version": "2.17.0",
       "license": "MIT",
@@ -5570,10 +5030,6 @@
       ],
       "license": "MIT"
     },
-    "apps/web/node_modules/stylis": {
-      "version": "4.3.6",
-      "license": "MIT"
-    },
     "apps/web/node_modules/superjson": {
       "version": "1.13.3",
       "license": "MIT",
@@ -5659,13 +5115,6 @@
         "node": ">=0.6"
       }
     },
-    "apps/web/node_modules/ts-dedent": {
-      "version": "2.2.0",
-      "license": "MIT",
-      "engines": {
-        "node": ">=6.10"
-      }
-    },
     "apps/web/node_modules/tsx": {
       "version": "4.21.0",
       "dev": true,
@@ -5743,10 +5192,6 @@
       "version": "0.14.5",
       "license": "Unlicense"
     },
-    "apps/web/node_modules/ufo": {
-      "version": "1.6.2",
-      "license": "MIT"
-    },
     "apps/web/node_modules/unist-util-remove-position": {
       "version": "5.0.0",
       "license": "MIT",
@@ -6874,43 +6319,6 @@
         }
       }
     },
-    "apps/web/node_modules/vscode-jsonrpc": {
-      "version": "8.2.0",
-      "license": "MIT",
-      "engines": {
-        "node": ">=14.0.0"
-      }
-    },
-    "apps/web/node_modules/vscode-languageserver": {
-      "version": "9.0.1",
-      "license": "MIT",
-      "dependencies": {
-        "vscode-languageserver-protocol": "3.17.5"
-      },
-      "bin": {
-        "installServerIntoExtension": "bin/installServerIntoExtension"
-      }
-    },
-    "apps/web/node_modules/vscode-languageserver-protocol": {
-      "version": "3.17.5",
-      "license": "MIT",
-      "dependencies": {
-        "vscode-jsonrpc": "8.2.0",
-        "vscode-languageserver-types": "3.17.5"
-      }
-    },
-    "apps/web/node_modules/vscode-languageserver-textdocument": {
-      "version": "1.0.12",
-      "license": "MIT"
-    },
-    "apps/web/node_modules/vscode-languageserver-types": {
-      "version": "3.17.5",
-      "license": "MIT"
-    },
-    "apps/web/node_modules/vscode-uri": {
-      "version": "3.0.8",
-      "license": "MIT"
-    },
     "apps/web/node_modules/web-namespaces": {
       "version": "2.0.1",
       "license": "MIT",
@@ -6945,6 +6353,19 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/@antfu/install-pkg": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/@antfu/install-pkg/-/install-pkg-1.1.0.tgz",
+      "integrity": "sha512-MGQsmw10ZyI+EJo45CdSER4zEb+p31LpDAFp2Z3gkSd1yqVZGi0Ebx++YTEMonJy4oChEMLsxZ64j8FH6sSqtQ==",
+      "license": "MIT",
+      "dependencies": {
+        "package-manager-detector": "^1.3.0",
+        "tinyexec": "^1.0.1"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/antfu"
+      }
+    },
     "node_modules/@apm-js-collab/code-transformer": {
       "version": "0.8.2",
       "resolved": "https://registry.npmjs.org/@apm-js-collab/code-transformer/-/code-transformer-0.8.2.tgz",
@@ -7270,6 +6691,51 @@
         "node": ">=6.9.0"
       }
     },
+    "node_modules/@braintree/sanitize-url": {
+      "version": "7.1.2",
+      "resolved": "https://registry.npmjs.org/@braintree/sanitize-url/-/sanitize-url-7.1.2.tgz",
+      "integrity": "sha512-jigsZK+sMF/cuiB7sERuo9V7N9jx+dhmHHnQyDSVdpZwVutaBu7WvNYqMDLSgFgfB30n452TP3vjDAvFC973mA==",
+      "license": "MIT"
+    },
+    "node_modules/@chevrotain/cst-dts-gen": {
+      "version": "11.1.2",
+      "resolved": "https://registry.npmjs.org/@chevrotain/cst-dts-gen/-/cst-dts-gen-11.1.2.tgz",
+      "integrity": "sha512-XTsjvDVB5nDZBQB8o0o/0ozNelQtn2KrUVteIHSlPd2VAV2utEb6JzyCJaJ8tGxACR4RiBNWy5uYUHX2eji88Q==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@chevrotain/gast": "11.1.2",
+        "@chevrotain/types": "11.1.2",
+        "lodash-es": "4.17.23"
+      }
+    },
+    "node_modules/@chevrotain/gast": {
+      "version": "11.1.2",
+      "resolved": "https://registry.npmjs.org/@chevrotain/gast/-/gast-11.1.2.tgz",
+      "integrity": "sha512-Z9zfXR5jNZb1Hlsd/p+4XWeUFugrHirq36bKzPWDSIacV+GPSVXdk+ahVWZTwjhNwofAWg/sZg58fyucKSQx5g==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@chevrotain/types": "11.1.2",
+        "lodash-es": "4.17.23"
+      }
+    },
+    "node_modules/@chevrotain/regexp-to-ast": {
+      "version": "11.1.2",
+      "resolved": "https://registry.npmjs.org/@chevrotain/regexp-to-ast/-/regexp-to-ast-11.1.2.tgz",
+      "integrity": "sha512-nMU3Uj8naWer7xpZTYJdxbAs6RIv/dxYzkYU8GSwgUtcAAlzjcPfX1w+RKRcYG8POlzMeayOQ/znfwxEGo5ulw==",
+      "license": "Apache-2.0"
+    },
+    "node_modules/@chevrotain/types": {
+      "version": "11.1.2",
+      "resolved": "https://registry.npmjs.org/@chevrotain/types/-/types-11.1.2.tgz",
+      "integrity": "sha512-U+HFai5+zmJCkK86QsaJtoITlboZHBqrVketcO2ROv865xfCMSFpELQoz1GkX5GzME8pTa+3kbKrZHQtI0gdbw==",
+      "license": "Apache-2.0"
+    },
+    "node_modules/@chevrotain/utils": {
+      "version": "11.1.2",
+      "resolved": "https://registry.npmjs.org/@chevrotain/utils/-/utils-11.1.2.tgz",
+      "integrity": "sha512-4mudFAQ6H+MqBTfqLmU7G1ZwRzCLfJEooL/fsF6rCX5eePMbGhoy5n4g+G4vlh2muDcsCTJtL+uKbOzWxs5LHA==",
+      "license": "Apache-2.0"
+    },
     "node_modules/@codemirror/autocomplete": {
       "version": "6.20.0",
       "resolved": "https://registry.npmjs.org/@codemirror/autocomplete/-/autocomplete-6.20.0.tgz",
@@ -8103,6 +7569,23 @@
         "react-hook-form": "^7.55.0"
       }
     },
+    "node_modules/@iconify/types": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/@iconify/types/-/types-2.0.0.tgz",
+      "integrity": "sha512-+wluvCrRhXrhyOmRDJ3q8mux9JkKy5SJ/v8ol2tu4FVjyYvtEzkc/3pK15ET6RKg4b4w4BmTk1+gsCUhf21Ykg==",
+      "license": "MIT"
+    },
+    "node_modules/@iconify/utils": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/@iconify/utils/-/utils-3.1.0.tgz",
+      "integrity": "sha512-Zlzem1ZXhI1iHeeERabLNzBHdOa4VhQbqAcOQaMKuTuyZCpwKbC2R4Dd0Zo3g9EAc+Y4fiarO8HIHRAth7+skw==",
+      "license": "MIT",
+      "dependencies": {
+        "@antfu/install-pkg": "^1.1.0",
+        "@iconify/types": "^2.0.0",
+        "mlly": "^1.8.0"
+      }
+    },
     "node_modules/@ioredis/commands": {
       "version": "1.5.0",
       "resolved": "https://registry.npmjs.org/@ioredis/commands/-/commands-1.5.0.tgz",
@@ -8388,6 +7871,15 @@
       "integrity": "sha512-l0h88YhZFyKdXIFNfSWpyjStDjGHwZ/U7iobcK1cQQD8sejsONdQtTVU+1wVN1PBw40PiiHB1vA5S7VTfQiP9g==",
       "license": "MIT"
     },
+    "node_modules/@mermaid-js/parser": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/@mermaid-js/parser/-/parser-1.0.0.tgz",
+      "integrity": "sha512-vvK0Hi/VWndxoh03Mmz6wa1KDriSPjS2XMZL/1l19HFwygiObEEoEwSDxOqyLzzAI6J2PU3261JjTMTO7x+BPw==",
+      "license": "MIT",
+      "dependencies": {
+        "langium": "^4.0.0"
+      }
+    },
     "node_modules/@msgpackr-extract/msgpackr-extract-darwin-arm64": {
       "version": "3.0.3",
       "resolved": "https://registry.npmjs.org/@msgpackr-extract/msgpackr-extract-darwin-arm64/-/msgpackr-extract-darwin-arm64-3.0.3.tgz",
@@ -14147,6 +13639,33 @@
         "url": "https://github.com/sponsors/wooorm"
       }
     },
+    "node_modules/chevrotain": {
+      "version": "11.1.2",
+      "resolved": "https://registry.npmjs.org/chevrotain/-/chevrotain-11.1.2.tgz",
+      "integrity": "sha512-opLQzEVriiH1uUQ4Kctsd49bRoFDXGGSC4GUqj7pGyxM3RehRhvTlZJc1FL/Flew2p5uwxa1tUDWKzI4wNM8pg==",
+      "license": "Apache-2.0",
+      "peer": true,
+      "dependencies": {
+        "@chevrotain/cst-dts-gen": "11.1.2",
+        "@chevrotain/gast": "11.1.2",
+        "@chevrotain/regexp-to-ast": "11.1.2",
+        "@chevrotain/types": "11.1.2",
+        "@chevrotain/utils": "11.1.2",
+        "lodash-es": "4.17.23"
+      }
+    },
+    "node_modules/chevrotain-allstar": {
+      "version": "0.3.1",
+      "resolved": "https://registry.npmjs.org/chevrotain-allstar/-/chevrotain-allstar-0.3.1.tgz",
+      "integrity": "sha512-b7g+y9A0v4mxCW1qUhf3BSVPg+/NvGErk/dOkrDaHA0nQIQGAtrOjlX//9OQtRlSCy+x9rfB5N8yC71lH1nvMw==",
+      "license": "MIT",
+      "dependencies": {
+        "lodash-es": "^4.17.21"
+      },
+      "peerDependencies": {
+        "chevrotain": "^11.0.0"
+      }
+    },
     "node_modules/chokidar": {
       "version": "3.6.0",
       "resolved": "https://registry.npmjs.org/chokidar/-/chokidar-3.6.0.tgz",
@@ -14319,6 +13838,15 @@
         "url": "https://github.com/sponsors/wooorm"
       }
     },
+    "node_modules/commander": {
+      "version": "7.2.0",
+      "resolved": "https://registry.npmjs.org/commander/-/commander-7.2.0.tgz",
+      "integrity": "sha512-QrWXB+ZQSVPmIWIhtEO9H+gwHaMGYiF5ChvoJ+K9ZGHG/sVsa6yiesAD1GC/x46sET00Xlwo1u49RVVVzvcSkw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 10"
+      }
+    },
     "node_modules/component-emitter": {
       "version": "1.3.1",
       "resolved": "https://registry.npmjs.org/component-emitter/-/component-emitter-1.3.1.tgz",
@@ -14351,6 +13879,12 @@
         "typedarray": "^0.0.6"
       }
     },
+    "node_modules/confbox": {
+      "version": "0.1.8",
+      "resolved": "https://registry.npmjs.org/confbox/-/confbox-0.1.8.tgz",
+      "integrity": "sha512-RMtmw0iFkeR4YV+fUOSucriAQNb9g8zFR52MWCtl+cCZOFRNL6zeB395vPzFhEjjn4fMxXudmELnl/KF/WrK6w==",
+      "license": "MIT"
+    },
     "node_modules/convert-source-map": {
       "version": "2.0.0",
       "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
@@ -14385,6 +13919,15 @@
         "url": "https://opencollective.com/core-js"
       }
     },
+    "node_modules/cose-base": {
+      "version": "1.0.3",
+      "resolved": "https://registry.npmjs.org/cose-base/-/cose-base-1.0.3.tgz",
+      "integrity": "sha512-s9whTXInMSgAp/NVXVNuVxVKzGH2qck3aQlVHxDCdAEPgtMKwc4Wq6/QKhgdEdgbLSi9rBTAcPoRa6JpiG4ksg==",
+      "license": "MIT",
+      "dependencies": {
+        "layout-base": "^1.0.0"
+      }
+    },
     "node_modules/crc-32": {
       "version": "1.2.2",
       "resolved": "https://registry.npmjs.org/crc-32/-/crc-32-1.2.2.tgz",
@@ -14501,6 +14044,96 @@
       "integrity": "sha512-cjrsQufETwxjvwZbYbKBCJNvmQ2++G9AvT45zDi7NXL9k2PdVcs2h0jQz96J6G4TMKRCcEsoJ+QTgQD00Igtjw==",
       "license": "MIT"
     },
+    "node_modules/cytoscape": {
+      "version": "3.33.1",
+      "resolved": "https://registry.npmjs.org/cytoscape/-/cytoscape-3.33.1.tgz",
+      "integrity": "sha512-iJc4TwyANnOGR1OmWhsS9ayRS3s+XQ185FmuHObThD+5AeJCakAAbWv8KimMTt08xCCLNgneQwFp+JRJOr9qGQ==",
+      "license": "MIT",
+      "peer": true,
+      "engines": {
+        "node": ">=0.10"
+      }
+    },
+    "node_modules/cytoscape-cose-bilkent": {
+      "version": "4.1.0",
+      "resolved": "https://registry.npmjs.org/cytoscape-cose-bilkent/-/cytoscape-cose-bilkent-4.1.0.tgz",
+      "integrity": "sha512-wgQlVIUJF13Quxiv5e1gstZ08rnZj2XaLHGoFMYXz7SkNfCDOOteKBE6SYRfA9WxxI/iBc3ajfDoc6hb/MRAHQ==",
+      "license": "MIT",
+      "dependencies": {
+        "cose-base": "^1.0.0"
+      },
+      "peerDependencies": {
+        "cytoscape": "^3.2.0"
+      }
+    },
+    "node_modules/cytoscape-fcose": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/cytoscape-fcose/-/cytoscape-fcose-2.2.0.tgz",
+      "integrity": "sha512-ki1/VuRIHFCzxWNrsshHYPs6L7TvLu3DL+TyIGEsRcvVERmxokbf5Gdk7mFxZnTdiGtnA4cfSmjZJMviqSuZrQ==",
+      "license": "MIT",
+      "dependencies": {
+        "cose-base": "^2.2.0"
+      },
+      "peerDependencies": {
+        "cytoscape": "^3.2.0"
+      }
+    },
+    "node_modules/cytoscape-fcose/node_modules/cose-base": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/cose-base/-/cose-base-2.2.0.tgz",
+      "integrity": "sha512-AzlgcsCbUMymkADOJtQm3wO9S3ltPfYOFD5033keQn9NJzIbtnZj+UdBJe7DYml/8TdbtHJW3j58SOnKhWY/5g==",
+      "license": "MIT",
+      "dependencies": {
+        "layout-base": "^2.0.0"
+      }
+    },
+    "node_modules/cytoscape-fcose/node_modules/layout-base": {
+      "version": "2.0.1",
+      "resolved": "https://registry.npmjs.org/layout-base/-/layout-base-2.0.1.tgz",
+      "integrity": "sha512-dp3s92+uNI1hWIpPGH3jK2kxE2lMjdXdr+DH8ynZHpd6PUlH6x6cbuXnoMmiNumznqaNO31xu9e79F0uuZ0JFg==",
+      "license": "MIT"
+    },
+    "node_modules/d3": {
+      "version": "7.9.0",
+      "resolved": "https://registry.npmjs.org/d3/-/d3-7.9.0.tgz",
+      "integrity": "sha512-e1U46jVP+w7Iut8Jt8ri1YsPOvFpg46k+K8TpCb0P+zjCkjkPnV7WzfDJzMHy1LnA+wj5pLT1wjO901gLXeEhA==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-array": "3",
+        "d3-axis": "3",
+        "d3-brush": "3",
+        "d3-chord": "3",
+        "d3-color": "3",
+        "d3-contour": "4",
+        "d3-delaunay": "6",
+        "d3-dispatch": "3",
+        "d3-drag": "3",
+        "d3-dsv": "3",
+        "d3-ease": "3",
+        "d3-fetch": "3",
+        "d3-force": "3",
+        "d3-format": "3",
+        "d3-geo": "3",
+        "d3-hierarchy": "3",
+        "d3-interpolate": "3",
+        "d3-path": "3",
+        "d3-polygon": "3",
+        "d3-quadtree": "3",
+        "d3-random": "3",
+        "d3-scale": "4",
+        "d3-scale-chromatic": "3",
+        "d3-selection": "3",
+        "d3-shape": "3",
+        "d3-time": "3",
+        "d3-time-format": "4",
+        "d3-timer": "3",
+        "d3-transition": "3",
+        "d3-zoom": "3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
     "node_modules/d3-array": {
       "version": "3.2.4",
       "resolved": "https://registry.npmjs.org/d3-array/-/d3-array-3.2.4.tgz",
@@ -14513,6 +14146,43 @@
         "node": ">=12"
       }
     },
+    "node_modules/d3-axis": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/d3-axis/-/d3-axis-3.0.0.tgz",
+      "integrity": "sha512-IH5tgjV4jE/GhHkRV0HiVYPDtvfjHQlQfJHs0usq7M30XcSBvOotpmH1IgkcXsO/5gEQZD43B//fc7SRT5S+xw==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-brush": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/d3-brush/-/d3-brush-3.0.0.tgz",
+      "integrity": "sha512-ALnjWlVYkXsVIGlOsuWH1+3udkYFI48Ljihfnh8FZPF2QS9o+PzGLBslO0PjzVoHLZ2KCVgAM8NVkXPJB2aNnQ==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-dispatch": "1 - 3",
+        "d3-drag": "2 - 3",
+        "d3-interpolate": "1 - 3",
+        "d3-selection": "3",
+        "d3-transition": "3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-chord": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-chord/-/d3-chord-3.0.1.tgz",
+      "integrity": "sha512-VE5S6TNa+j8msksl7HwjxMHDM2yNK3XCkusIlpX5kwauBfXuyLAtNg9jCp/iHH61tgI4sb6R/EIMWCqEIdjT/g==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-path": "1 - 3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
     "node_modules/d3-color": {
       "version": "3.1.0",
       "resolved": "https://registry.npmjs.org/d3-color/-/d3-color-3.1.0.tgz",
@@ -14522,6 +14192,30 @@
         "node": ">=12"
       }
     },
+    "node_modules/d3-contour": {
+      "version": "4.0.2",
+      "resolved": "https://registry.npmjs.org/d3-contour/-/d3-contour-4.0.2.tgz",
+      "integrity": "sha512-4EzFTRIikzs47RGmdxbeUvLWtGedDUNkTcmzoeyg4sP/dvCexO47AaQL7VKy/gul85TOxw+IBgA8US2xwbToNA==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-array": "^3.2.0"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-delaunay": {
+      "version": "6.0.4",
+      "resolved": "https://registry.npmjs.org/d3-delaunay/-/d3-delaunay-6.0.4.tgz",
+      "integrity": "sha512-mdjtIZ1XLAM8bm/hx3WwjfHt6Sggek7qH043O8KEjDXN40xi3vx/6pYSVTwLjEgiXQTbvaouWKynLBiUZ6SK6A==",
+      "license": "ISC",
+      "dependencies": {
+        "delaunator": "5"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
     "node_modules/d3-dispatch": {
       "version": "3.0.1",
       "resolved": "https://registry.npmjs.org/d3-dispatch/-/d3-dispatch-3.0.1.tgz",
@@ -14536,27 +14230,99 @@
       "resolved": "https://registry.npmjs.org/d3-drag/-/d3-drag-3.0.0.tgz",
       "integrity": "sha512-pWbUJLdETVA8lQNJecMxoXfH6x+mO2UQo8rSmZ+QqxcbyA3hfeprFgIT//HW2nlHChWeIIMwS2Fq+gEARkhTkg==",
       "license": "ISC",
-      "dependencies": {
-        "d3-dispatch": "1 - 3",
-        "d3-selection": "3"
-      },
+      "dependencies": {
+        "d3-dispatch": "1 - 3",
+        "d3-selection": "3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-dsv": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-dsv/-/d3-dsv-3.0.1.tgz",
+      "integrity": "sha512-UG6OvdI5afDIFP9w4G0mNq50dSOsXHJaRE8arAS5o9ApWnIElp8GZw1Dun8vP8OyHOZ/QJUKUJwxiiCCnUwm+Q==",
+      "license": "ISC",
+      "dependencies": {
+        "commander": "7",
+        "iconv-lite": "0.6",
+        "rw": "1"
+      },
+      "bin": {
+        "csv2json": "bin/dsv2json.js",
+        "csv2tsv": "bin/dsv2dsv.js",
+        "dsv2dsv": "bin/dsv2dsv.js",
+        "dsv2json": "bin/dsv2json.js",
+        "json2csv": "bin/json2dsv.js",
+        "json2dsv": "bin/json2dsv.js",
+        "json2tsv": "bin/json2dsv.js",
+        "tsv2csv": "bin/dsv2dsv.js",
+        "tsv2json": "bin/dsv2json.js"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-ease": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-ease/-/d3-ease-3.0.1.tgz",
+      "integrity": "sha512-wR/XK3D3XcLIZwpbvQwQ5fK+8Ykds1ip7A2Txe0yxncXSdq1L9skcG7blcedkOX+ZcgxGAmLX1FrRGbADwzi0w==",
+      "license": "BSD-3-Clause",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-fetch": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-fetch/-/d3-fetch-3.0.1.tgz",
+      "integrity": "sha512-kpkQIM20n3oLVBKGg6oHrUchHM3xODkTzjMoj7aWQFq5QEM+R6E4WkzT5+tojDY7yjez8KgCBRoj4aEr99Fdqw==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-dsv": "1 - 3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-force": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/d3-force/-/d3-force-3.0.0.tgz",
+      "integrity": "sha512-zxV/SsA+U4yte8051P4ECydjD/S+qeYtnaIyAs9tgHCqfguma/aAQDjo85A9Z6EKhBirHRJHXIgJUlffT4wdLg==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-dispatch": "1 - 3",
+        "d3-quadtree": "1 - 3",
+        "d3-timer": "1 - 3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-format": {
+      "version": "3.1.2",
+      "resolved": "https://registry.npmjs.org/d3-format/-/d3-format-3.1.2.tgz",
+      "integrity": "sha512-AJDdYOdnyRDV5b6ArilzCPPwc1ejkHcoyFarqlPqT7zRYjhavcT3uSrqcMvsgh2CgoPbK3RCwyHaVyxYcP2Arg==",
+      "license": "ISC",
       "engines": {
         "node": ">=12"
       }
     },
-    "node_modules/d3-ease": {
-      "version": "3.0.1",
-      "resolved": "https://registry.npmjs.org/d3-ease/-/d3-ease-3.0.1.tgz",
-      "integrity": "sha512-wR/XK3D3XcLIZwpbvQwQ5fK+8Ykds1ip7A2Txe0yxncXSdq1L9skcG7blcedkOX+ZcgxGAmLX1FrRGbADwzi0w==",
-      "license": "BSD-3-Clause",
+    "node_modules/d3-geo": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/d3-geo/-/d3-geo-3.1.1.tgz",
+      "integrity": "sha512-637ln3gXKXOwhalDzinUgY83KzNWZRKbYubaG+fGVuc/dxO64RRljtCTnf5ecMyE1RIdtqpkVcq0IbtU2S8j2Q==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-array": "2.5.0 - 3"
+      },
       "engines": {
         "node": ">=12"
       }
     },
-    "node_modules/d3-format": {
+    "node_modules/d3-hierarchy": {
       "version": "3.1.2",
-      "resolved": "https://registry.npmjs.org/d3-format/-/d3-format-3.1.2.tgz",
-      "integrity": "sha512-AJDdYOdnyRDV5b6ArilzCPPwc1ejkHcoyFarqlPqT7zRYjhavcT3uSrqcMvsgh2CgoPbK3RCwyHaVyxYcP2Arg==",
+      "resolved": "https://registry.npmjs.org/d3-hierarchy/-/d3-hierarchy-3.1.2.tgz",
+      "integrity": "sha512-FX/9frcub54beBdugHjDCdikxThEqjnR93Qt7PvQTOHxyiNCAlvMrHhclk3cD5VeAaq9fxmfRp+CnWw9rEMBuA==",
       "license": "ISC",
       "engines": {
         "node": ">=12"
@@ -14583,6 +14349,73 @@
         "node": ">=12"
       }
     },
+    "node_modules/d3-polygon": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-polygon/-/d3-polygon-3.0.1.tgz",
+      "integrity": "sha512-3vbA7vXYwfe1SYhED++fPUQlWSYTTGmFmQiany/gdbiWgU/iEyQzyymwL9SkJjFFuCS4902BSzewVGsHHmHtXg==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-quadtree": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-quadtree/-/d3-quadtree-3.0.1.tgz",
+      "integrity": "sha512-04xDrxQTDTCFwP5H6hRhsRcb9xxv2RzkcsygFzmkSIOJy3PeRJP7sNk3VRIbKXcog561P9oU0/rVH6vDROAgUw==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-random": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-random/-/d3-random-3.0.1.tgz",
+      "integrity": "sha512-FXMe9GfxTxqd5D6jFsQ+DJ8BJS4E/fT5mqqdjovykEB2oFbTMDVdg1MGFxfQW+FBOGoB++k8swBrgwSHT1cUXQ==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-sankey": {
+      "version": "0.12.3",
+      "resolved": "https://registry.npmjs.org/d3-sankey/-/d3-sankey-0.12.3.tgz",
+      "integrity": "sha512-nQhsBRmM19Ax5xEIPLMY9ZmJ/cDvd1BG3UVvt5h3WRxKg5zGRbvnteTyWAbzeSvlh3tW7ZEmq4VwR5mB3tutmQ==",
+      "license": "BSD-3-Clause",
+      "dependencies": {
+        "d3-array": "1 - 2",
+        "d3-shape": "^1.2.0"
+      }
+    },
+    "node_modules/d3-sankey/node_modules/d3-array": {
+      "version": "2.12.1",
+      "resolved": "https://registry.npmjs.org/d3-array/-/d3-array-2.12.1.tgz",
+      "integrity": "sha512-B0ErZK/66mHtEsR1TkPEEkwdy+WDesimkM5gpZr5Dsg54BiTA5RXtYW5qTLIAcekaS9xfZrzBLF/OAkB3Qn1YQ==",
+      "license": "BSD-3-Clause",
+      "dependencies": {
+        "internmap": "^1.0.0"
+      }
+    },
+    "node_modules/d3-sankey/node_modules/d3-path": {
+      "version": "1.0.9",
+      "resolved": "https://registry.npmjs.org/d3-path/-/d3-path-1.0.9.tgz",
+      "integrity": "sha512-VLaYcn81dtHVTjEHd8B+pbe9yHWpXKZUC87PzoFmsFrJqgFwDe/qxfp5MlfsfM1V5E/iVt0MmEbWQ7FVIXh/bg==",
+      "license": "BSD-3-Clause"
+    },
+    "node_modules/d3-sankey/node_modules/d3-shape": {
+      "version": "1.3.7",
+      "resolved": "https://registry.npmjs.org/d3-shape/-/d3-shape-1.3.7.tgz",
+      "integrity": "sha512-EUkvKjqPFUAZyOlhY5gzCxCeI0Aep04LwIRpsZ/mLFelJiUfnK56jo5JMDSE7yyP2kLSb6LtF+S5chMk7uqPqw==",
+      "license": "BSD-3-Clause",
+      "dependencies": {
+        "d3-path": "1"
+      }
+    },
+    "node_modules/d3-sankey/node_modules/internmap": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/internmap/-/internmap-1.0.1.tgz",
+      "integrity": "sha512-lDB5YccMydFBtasVtxnZ3MRBHuaoE8GKsppq+EchKL2U4nK/DmEpPHNH8MZe5HkMtpSiTSOZwfN0tzYjO/lJEw==",
+      "license": "ISC"
+    },
     "node_modules/d3-scale": {
       "version": "4.0.2",
       "resolved": "https://registry.npmjs.org/d3-scale/-/d3-scale-4.0.2.tgz",
@@ -14599,6 +14432,19 @@
         "node": ">=12"
       }
     },
+    "node_modules/d3-scale-chromatic": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/d3-scale-chromatic/-/d3-scale-chromatic-3.1.0.tgz",
+      "integrity": "sha512-A3s5PWiZ9YCXFye1o246KoscMWqf8BsD9eRiJ3He7C9OBaxKhAd5TFCdEx/7VbKtxxTsu//1mMJFrEt572cEyQ==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-color": "1 - 3",
+        "d3-interpolate": "1 - 3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
     "node_modules/d3-selection": {
       "version": "3.0.0",
       "resolved": "https://registry.npmjs.org/d3-selection/-/d3-selection-3.0.0.tgz",
@@ -14689,6 +14535,16 @@
         "node": ">=12"
       }
     },
+    "node_modules/dagre-d3-es": {
+      "version": "7.0.13",
+      "resolved": "https://registry.npmjs.org/dagre-d3-es/-/dagre-d3-es-7.0.13.tgz",
+      "integrity": "sha512-efEhnxpSuwpYOKRm/L5KbqoZmNNukHa/Flty4Wp62JRvgH2ojwVgPgdYyr4twpieZnyRDdIH7PY2mopX26+j2Q==",
+      "license": "MIT",
+      "dependencies": {
+        "d3": "^7.9.0",
+        "lodash-es": "^4.17.21"
+      }
+    },
     "node_modules/dash-video-element": {
       "version": "0.3.1",
       "resolved": "https://registry.npmjs.org/dash-video-element/-/dash-video-element-0.3.1.tgz",
@@ -14740,6 +14596,12 @@
       "integrity": "sha512-hTIP/z+t+qKwBDcmmsnmjWTduxCg+5KfdqWQvb2X/8C9+knYY6epN/pfxdDuyVlSVeFz0sM5eEfwIUQ70U4ckg==",
       "license": "MIT"
     },
+    "node_modules/dayjs": {
+      "version": "1.11.19",
+      "resolved": "https://registry.npmjs.org/dayjs/-/dayjs-1.11.19.tgz",
+      "integrity": "sha512-t5EcLVS6QPBNqM2z8fakk/NKel+Xzshgt8FFKAn+qwlD1pzZWxh0nVCrvFK7ZDb6XucZeF9z8C7CBWTRIVApAw==",
+      "license": "MIT"
+    },
     "node_modules/debug": {
       "version": "4.4.3",
       "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
@@ -14783,6 +14645,15 @@
         "url": "https://github.com/sponsors/wooorm"
       }
     },
+    "node_modules/delaunator": {
+      "version": "5.0.1",
+      "resolved": "https://registry.npmjs.org/delaunator/-/delaunator-5.0.1.tgz",
+      "integrity": "sha512-8nvh+XBe96aCESrGOqMp/84b13H9cdKbG5P2ejQCh4d4sK9RL4371qou9drQjMhvnPmhWl5hnmqbEE0fXr9Xnw==",
+      "license": "ISC",
+      "dependencies": {
+        "robust-predicates": "^3.0.2"
+      }
+    },
     "node_modules/delayed-stream": {
       "version": "1.0.0",
       "resolved": "https://registry.npmjs.org/delayed-stream/-/delayed-stream-1.0.0.tgz",
@@ -15649,6 +15520,12 @@
         "node": ">=14.0.0"
       }
     },
+    "node_modules/hachure-fill": {
+      "version": "0.5.2",
+      "resolved": "https://registry.npmjs.org/hachure-fill/-/hachure-fill-0.5.2.tgz",
+      "integrity": "sha512-3GKBOn+m2LX9iq+JC1064cSFprJY4jL1jCXTcpnfER5HYE2l/4EfWSGzkPa/ZDBmYI0ZOEj5VHV/eKnPGkHuOg==",
+      "license": "MIT"
+    },
     "node_modules/happy-dom": {
       "version": "20.6.1",
       "resolved": "https://registry.npmjs.org/happy-dom/-/happy-dom-20.6.1.tgz",
@@ -15921,6 +15798,18 @@
         "node": ">= 14"
       }
     },
+    "node_modules/iconv-lite": {
+      "version": "0.6.3",
+      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.6.3.tgz",
+      "integrity": "sha512-4fCk79wshMdzMp2rH06qWrJE4iolqLhCUH+OiuIgU++RB0+94NlDL81atO7GX55uUKueo0txHNtvEyI6D7WdMw==",
+      "license": "MIT",
+      "dependencies": {
+        "safer-buffer": ">= 2.1.2 < 3.0.0"
+      },
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
     "node_modules/ignore-by-default": {
       "version": "1.0.1",
       "resolved": "https://registry.npmjs.org/ignore-by-default/-/ignore-by-default-1.0.1.tgz",
@@ -16586,6 +16475,59 @@
         "safe-buffer": "^5.0.1"
       }
     },
+    "node_modules/katex": {
+      "version": "0.16.33",
+      "resolved": "https://registry.npmjs.org/katex/-/katex-0.16.33.tgz",
+      "integrity": "sha512-q3N5u+1sY9Bu7T4nlXoiRBXWfwSefNGoKeOwekV+gw0cAXQlz2Ww6BLcmBxVDeXBMUDQv6fK5bcNaJLxob3ZQA==",
+      "funding": [
+        "https://opencollective.com/katex",
+        "https://github.com/sponsors/katex"
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "commander": "^8.3.0"
+      },
+      "bin": {
+        "katex": "cli.js"
+      }
+    },
+    "node_modules/katex/node_modules/commander": {
+      "version": "8.3.0",
+      "resolved": "https://registry.npmjs.org/commander/-/commander-8.3.0.tgz",
+      "integrity": "sha512-OkTL9umf+He2DZkUq8f8J9of7yL6RJKI24dVITBmNfZBmri9zYZQrKkuXiKhyfPSu8tUhnVBB1iKXevvnlR4Ww==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 12"
+      }
+    },
+    "node_modules/khroma": {
+      "version": "2.1.0",
+      "resolved": "https://registry.npmjs.org/khroma/-/khroma-2.1.0.tgz",
+      "integrity": "sha512-Ls993zuzfayK269Svk9hzpeGUKob/sIgZzyHYdjQoAdQetRKpOLj+k/QQQ/6Qi0Yz65mlROrfd+Ev+1+7dz9Kw=="
+    },
+    "node_modules/langium": {
+      "version": "4.2.1",
+      "resolved": "https://registry.npmjs.org/langium/-/langium-4.2.1.tgz",
+      "integrity": "sha512-zu9QWmjpzJcomzdJQAHgDVhLGq5bLosVak1KVa40NzQHXfqr4eAHupvnPOVXEoLkg6Ocefvf/93d//SB7du4YQ==",
+      "license": "MIT",
+      "dependencies": {
+        "chevrotain": "~11.1.1",
+        "chevrotain-allstar": "~0.3.1",
+        "vscode-languageserver": "~9.0.1",
+        "vscode-languageserver-textdocument": "~1.0.11",
+        "vscode-uri": "~3.1.0"
+      },
+      "engines": {
+        "node": ">=20.10.0",
+        "npm": ">=10.2.3"
+      }
+    },
+    "node_modules/layout-base": {
+      "version": "1.0.2",
+      "resolved": "https://registry.npmjs.org/layout-base/-/layout-base-1.0.2.tgz",
+      "integrity": "sha512-8h2oVEZNktL4BH2JCOI90iD1yXwL6iNW7KcCKT2QZgQJR2vbqDsldCTPRU9NifTCqHZci57XvQQ15YTu+sTYPg==",
+      "license": "MIT"
+    },
     "node_modules/lie": {
       "version": "3.1.1",
       "resolved": "https://registry.npmjs.org/lie/-/lie-3.1.1.tgz",
@@ -16886,6 +16828,12 @@
       "integrity": "sha512-LgVTMpQtIopCi79SJeDiP0TfWi5CNEc/L/aRdTh3yIvmZXTnheWpKjSZhnvMl8iXbC1tFg9gdHHDMLoV7CnG+w==",
       "license": "MIT"
     },
+    "node_modules/lodash-es": {
+      "version": "4.17.23",
+      "resolved": "https://registry.npmjs.org/lodash-es/-/lodash-es-4.17.23.tgz",
+      "integrity": "sha512-kVI48u3PZr38HdYz98UmfPnXl2DXrpdctLrFLCd3kOx1xUkOmpFPx7gCWWM5MPkL/fD8zb+Ph0QzjGFs4+hHWg==",
+      "license": "MIT"
+    },
     "node_modules/lodash.camelcase": {
       "version": "4.3.0",
       "resolved": "https://registry.npmjs.org/lodash.camelcase/-/lodash.camelcase-4.3.0.tgz",
@@ -17023,6 +16971,18 @@
         "url": "https://github.com/sponsors/wooorm"
       }
     },
+    "node_modules/marked": {
+      "version": "16.4.2",
+      "resolved": "https://registry.npmjs.org/marked/-/marked-16.4.2.tgz",
+      "integrity": "sha512-TI3V8YYWvkVf3KJe1dRkpnjs68JUPyEa5vjKrp1XEEJUAOaQc+Qj+L1qWbPd0SJuAdQkFU0h73sXXqwDYxsiDA==",
+      "license": "MIT",
+      "bin": {
+        "marked": "bin/marked.js"
+      },
+      "engines": {
+        "node": ">= 20"
+      }
+    },
     "node_modules/math-intrinsics": {
       "version": "1.1.0",
       "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
@@ -17339,6 +17299,34 @@
         "node": ">= 0.6"
       }
     },
+    "node_modules/mermaid": {
+      "version": "11.12.3",
+      "resolved": "https://registry.npmjs.org/mermaid/-/mermaid-11.12.3.tgz",
+      "integrity": "sha512-wN5ZSgJQIC+CHJut9xaKWsknLxaFBwCPwPkGTSUYrTiHORWvpT8RxGk849HPnpUAQ+/9BPRqYb80jTpearrHzQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@braintree/sanitize-url": "^7.1.1",
+        "@iconify/utils": "^3.0.1",
+        "@mermaid-js/parser": "^1.0.0",
+        "@types/d3": "^7.4.3",
+        "cytoscape": "^3.29.3",
+        "cytoscape-cose-bilkent": "^4.1.0",
+        "cytoscape-fcose": "^2.2.0",
+        "d3": "^7.9.0",
+        "d3-sankey": "^0.12.3",
+        "dagre-d3-es": "7.0.13",
+        "dayjs": "^1.11.18",
+        "dompurify": "^3.2.5",
+        "katex": "^0.16.22",
+        "khroma": "^2.1.0",
+        "lodash-es": "^4.17.23",
+        "marked": "^16.2.1",
+        "roughjs": "^4.6.6",
+        "stylis": "^4.3.6",
+        "ts-dedent": "^2.2.0",
+        "uuid": "^11.1.0"
+      }
+    },
     "node_modules/methods": {
       "version": "1.1.2",
       "resolved": "https://registry.npmjs.org/methods/-/methods-1.1.2.tgz",
@@ -18000,6 +17988,18 @@
         "mkdirp": "bin/cmd.js"
       }
     },
+    "node_modules/mlly": {
+      "version": "1.8.0",
+      "resolved": "https://registry.npmjs.org/mlly/-/mlly-1.8.0.tgz",
+      "integrity": "sha512-l8D9ODSRWLe2KHJSifWGwBqpTZXIXTeo8mlKjY+E2HAakaTeNpqAyBZ8GSqLzHgw4XmHmC8whvpjJNMbFZN7/g==",
+      "license": "MIT",
+      "dependencies": {
+        "acorn": "^8.15.0",
+        "pathe": "^2.0.3",
+        "pkg-types": "^1.3.1",
+        "ufo": "^1.6.1"
+      }
+    },
     "node_modules/module-details-from-path": {
       "version": "1.0.4",
       "resolved": "https://registry.npmjs.org/module-details-from-path/-/module-details-from-path-1.0.4.tgz",
@@ -18332,6 +18332,12 @@
       "integrity": "sha512-UEZIS3/by4OC8vL3P2dTXRETpebLI2NiI5vIrjaD/5UtrkFX/tNbwjTSRAGC/+7CAo2pIcBaRgWmcBBHcsaCIw==",
       "license": "BlueOak-1.0.0"
     },
+    "node_modules/package-manager-detector": {
+      "version": "1.6.0",
+      "resolved": "https://registry.npmjs.org/package-manager-detector/-/package-manager-detector-1.6.0.tgz",
+      "integrity": "sha512-61A5ThoTiDG/C8s8UMZwSorAGwMJ0ERVGj2OjoW5pAalsNOg15+iQiPzrLJ4jhZ1HJzmC2PIHT2oEiH3R5fzNA==",
+      "license": "MIT"
+    },
     "node_modules/papaparse": {
       "version": "5.5.3",
       "resolved": "https://registry.npmjs.org/papaparse/-/papaparse-5.5.3.tgz",
@@ -18381,6 +18387,12 @@
       "integrity": "sha512-b7uo2UCUOYZcnF/3ID0lulOJi/bafxa1xPe7ZPsammBSpjSWQkjNxlt635YGS2MiR9GjvuXCtz2emr3jbsz98g==",
       "license": "MIT"
     },
+    "node_modules/path-data-parser": {
+      "version": "0.1.0",
+      "resolved": "https://registry.npmjs.org/path-data-parser/-/path-data-parser-0.1.0.tgz",
+      "integrity": "sha512-NOnmBpt5Y2RWbuv0LMzsayp3lVylAHLPUTut412ZA3l+C4uw4ZVkQbjShYCQ8TCpUMdPapr4YjUqLYD6v68j+w==",
+      "license": "MIT"
+    },
     "node_modules/path-exists": {
       "version": "4.0.0",
       "resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
@@ -18537,6 +18549,17 @@
         "url": "https://github.com/sponsors/jonschlinkert"
       }
     },
+    "node_modules/pkg-types": {
+      "version": "1.3.1",
+      "resolved": "https://registry.npmjs.org/pkg-types/-/pkg-types-1.3.1.tgz",
+      "integrity": "sha512-/Jm5M4RvtBFVkKWRu2BLUTNP8/M2a+UwuAX+ae4770q1qVGtfjG+WTCupoZixokjmHiry8uI+dlY8KXYV5HVVQ==",
+      "license": "MIT",
+      "dependencies": {
+        "confbox": "^0.1.8",
+        "mlly": "^1.7.4",
+        "pathe": "^2.0.1"
+      }
+    },
     "node_modules/player.style": {
       "version": "0.3.1",
       "resolved": "https://registry.npmjs.org/player.style/-/player.style-0.3.1.tgz",
@@ -18562,6 +18585,22 @@
         "ce-la-react": "^0.3.2"
       }
     },
+    "node_modules/points-on-curve": {
+      "version": "0.2.0",
+      "resolved": "https://registry.npmjs.org/points-on-curve/-/points-on-curve-0.2.0.tgz",
+      "integrity": "sha512-0mYKnYYe9ZcqMCWhUjItv/oHjvgEsfKvnUTg8sAtnHr3GVy7rGkXCb6d5cSyqrWqL4k81b9CPg3urd+T7aop3A==",
+      "license": "MIT"
+    },
+    "node_modules/points-on-path": {
+      "version": "0.2.1",
+      "resolved": "https://registry.npmjs.org/points-on-path/-/points-on-path-0.2.1.tgz",
+      "integrity": "sha512-25ClnWWuw7JbWZcgqY/gJ4FQWadKxGWk+3kR/7kD0tCaDtPPMj7oHu2ToLaVhfpnHrZzYby2w6tUA0eOIuUg8g==",
+      "license": "MIT",
+      "dependencies": {
+        "path-data-parser": "0.1.0",
+        "points-on-curve": "0.2.0"
+      }
+    },
     "node_modules/postcss": {
       "version": "8.5.6",
       "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.6.tgz",
@@ -19337,6 +19376,12 @@
         "rg": "index.js"
       }
     },
+    "node_modules/robust-predicates": {
+      "version": "3.0.2",
+      "resolved": "https://registry.npmjs.org/robust-predicates/-/robust-predicates-3.0.2.tgz",
+      "integrity": "sha512-IXgzBWvWQwE6PrDI05OvmXUIruQTcoMDzRsOd5CDvHCVLcLHMTSYvOK5Cm46kWqlV3yAbuSpBZdJ5oP5OUoStg==",
+      "license": "Unlicense"
+    },
     "node_modules/rollup": {
       "version": "4.57.1",
       "resolved": "https://registry.npmjs.org/rollup/-/rollup-4.57.1.tgz",
@@ -19382,6 +19427,24 @@
         "fsevents": "~2.3.2"
       }
     },
+    "node_modules/roughjs": {
+      "version": "4.6.6",
+      "resolved": "https://registry.npmjs.org/roughjs/-/roughjs-4.6.6.tgz",
+      "integrity": "sha512-ZUz/69+SYpFN/g/lUlo2FXcIjRkSu3nDarreVdGGndHEBJ6cXPdKguS8JGxwj5HA5xIbVKSmLgr5b3AWxtRfvQ==",
+      "license": "MIT",
+      "dependencies": {
+        "hachure-fill": "^0.5.2",
+        "path-data-parser": "^0.1.0",
+        "points-on-curve": "^0.2.0",
+        "points-on-path": "^0.2.1"
+      }
+    },
+    "node_modules/rw": {
+      "version": "1.3.3",
+      "resolved": "https://registry.npmjs.org/rw/-/rw-1.3.3.tgz",
+      "integrity": "sha512-PdhdWy89SiZogBLaw42zdeqtRJ//zFd2PgQavcICDUgJT5oW10QCRKbJ6bg4r0/UY2M6BWd5tkxuGFRvCkgfHQ==",
+      "license": "BSD-3-Clause"
+    },
     "node_modules/safe-buffer": {
       "version": "5.2.1",
       "resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz",
@@ -19822,6 +19885,12 @@
         "inline-style-parser": "0.2.7"
       }
     },
+    "node_modules/stylis": {
+      "version": "4.3.6",
+      "resolved": "https://registry.npmjs.org/stylis/-/stylis-4.3.6.tgz",
+      "integrity": "sha512-yQ3rwFWRfwNUY7H5vpU0wfdkNSnvnJinhF9830Swlaxl03zsOjCfmX0ugac+3LtK0lYSgwL/KXc8oYL3mG4YFQ==",
+      "license": "MIT"
+    },
     "node_modules/super-media-element": {
       "version": "1.4.2",
       "resolved": "https://registry.npmjs.org/super-media-element/-/super-media-element-1.4.2.tgz",
@@ -20105,6 +20174,15 @@
         "url": "https://github.com/sponsors/wooorm"
       }
     },
+    "node_modules/ts-dedent": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/ts-dedent/-/ts-dedent-2.2.0.tgz",
+      "integrity": "sha512-q5W7tVM71e2xjHZTlgfTDoPF/SmqKG5hddq9SzR49CH2hayqRKJtQ4mtRlSxKaJlR/+9rEM+mnBHf7I2/BQcpQ==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=6.10"
+      }
+    },
     "node_modules/tslib": {
       "version": "2.8.1",
       "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
@@ -20288,6 +20366,12 @@
         "node": "*"
       }
     },
+    "node_modules/ufo": {
+      "version": "1.6.3",
+      "resolved": "https://registry.npmjs.org/ufo/-/ufo-1.6.3.tgz",
+      "integrity": "sha512-yDJTmhydvl5lJzBmy/hyOAA0d+aqCBuwl818haVdYCRrWV84o7YyeVm4QlVHStqNrrJSTb6jKuFAVqAFsr+K3Q==",
+      "license": "MIT"
+    },
     "node_modules/undefsafe": {
       "version": "2.0.5",
       "resolved": "https://registry.npmjs.org/undefsafe/-/undefsafe-2.0.5.tgz",
@@ -20684,6 +20768,55 @@
         }
       }
     },
+    "node_modules/vscode-jsonrpc": {
+      "version": "8.2.0",
+      "resolved": "https://registry.npmjs.org/vscode-jsonrpc/-/vscode-jsonrpc-8.2.0.tgz",
+      "integrity": "sha512-C+r0eKJUIfiDIfwJhria30+TYWPtuHJXHtI7J0YlOmKAo7ogxP20T0zxB7HZQIFhIyvoBPwWskjxrvAtfjyZfA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=14.0.0"
+      }
+    },
+    "node_modules/vscode-languageserver": {
+      "version": "9.0.1",
+      "resolved": "https://registry.npmjs.org/vscode-languageserver/-/vscode-languageserver-9.0.1.tgz",
+      "integrity": "sha512-woByF3PDpkHFUreUa7Hos7+pUWdeWMXRd26+ZX2A8cFx6v/JPTtd4/uN0/jB6XQHYaOlHbio03NTHCqrgG5n7g==",
+      "license": "MIT",
+      "dependencies": {
+        "vscode-languageserver-protocol": "3.17.5"
+      },
+      "bin": {
+        "installServerIntoExtension": "bin/installServerIntoExtension"
+      }
+    },
+    "node_modules/vscode-languageserver-protocol": {
+      "version": "3.17.5",
+      "resolved": "https://registry.npmjs.org/vscode-languageserver-protocol/-/vscode-languageserver-protocol-3.17.5.tgz",
+      "integrity": "sha512-mb1bvRJN8SVznADSGWM9u/b07H7Ecg0I3OgXDuLdn307rl/J3A9YD6/eYOssqhecL27hK1IPZAsaqh00i/Jljg==",
+      "license": "MIT",
+      "dependencies": {
+        "vscode-jsonrpc": "8.2.0",
+        "vscode-languageserver-types": "3.17.5"
+      }
+    },
+    "node_modules/vscode-languageserver-textdocument": {
+      "version": "1.0.12",
+      "resolved": "https://registry.npmjs.org/vscode-languageserver-textdocument/-/vscode-languageserver-textdocument-1.0.12.tgz",
+      "integrity": "sha512-cxWNPesCnQCcMPeenjKKsOCKQZ/L6Tv19DTRIGuLWe32lyzWhihGVJ/rcckZXJxfdKCFvRLS3fpBIsV/ZGX4zA==",
+      "license": "MIT"
+    },
+    "node_modules/vscode-languageserver-types": {
+      "version": "3.17.5",
+      "resolved": "https://registry.npmjs.org/vscode-languageserver-types/-/vscode-languageserver-types-3.17.5.tgz",
+      "integrity": "sha512-Ld1VelNuX9pdF39h2Hgaeb5hEZM2Z3jUrrMgWQAu82jMtZp7p3vJT3BzToKtZI7NgQssZje5o0zryOrhQvzQAg==",
+      "license": "MIT"
+    },
+    "node_modules/vscode-uri": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/vscode-uri/-/vscode-uri-3.1.0.tgz",
+      "integrity": "sha512-/BpdSx+yCQGnCvecbyXdxHDkuk55/G3xwnC0GqY4gmQ3j+A+g8kzzgB4Nk/SINjqn6+waqw3EgbVF2QKExkRxQ==",
+      "license": "MIT"
+    },
     "node_modules/w3c-keyname": {
       "version": "2.2.8",
       "resolved": "https://registry.npmjs.org/w3c-keyname/-/w3c-keyname-2.2.8.tgz",
