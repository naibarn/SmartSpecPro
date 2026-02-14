diff --git a/apps/web/client/src/components/settings/FolderPicker.tsx b/apps/web/client/src/components/settings/FolderPicker.tsx
new file mode 100644
index 0000000..741526c
--- /dev/null
+++ b/apps/web/client/src/components/settings/FolderPicker.tsx
@@ -0,0 +1,208 @@
+/**
+ * FolderPicker - lazy-loading folder tree dialog for Google Drive folder selection.
+ *
+ * Used by the Google Drive dashboard to let users choose which folders
+ * to include/exclude from indexing.
+ */
+
+import { useState, useCallback } from "react";
+import { trpc } from "@/lib/trpc";
+import { Button } from "@/components/ui/button";
+import {
+  Dialog,
+  DialogContent,
+  DialogFooter,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { ChevronRight, ChevronDown, Loader2, FolderOpen } from "lucide-react";
+
+interface FolderPickerProps {
+  open: boolean;
+  onOpenChange: (open: boolean) => void;
+  indexingMode: "selected_folders" | "all_except";
+  initialSelectedFolders: Array<{ id: string; name: string }>;
+  onConfirm: (folders: Array<{ id: string; name: string }>) => void;
+}
+
+interface FolderTreeNodeProps {
+  folder: { id: string; name: string; hasChildren: boolean };
+  depth: number;
+  expandedFolders: Set<string>;
+  selectedFolders: Map<string, string>;
+  onToggleExpand: (id: string) => void;
+  onToggleSelect: (id: string, name: string) => void;
+}
+
+function FolderTreeNode({
+  folder,
+  depth,
+  expandedFolders,
+  selectedFolders,
+  onToggleExpand,
+  onToggleSelect,
+}: FolderTreeNodeProps) {
+  const isExpanded = expandedFolders.has(folder.id);
+  const isSelected = selectedFolders.has(folder.id);
+
+  const childrenQuery = trpc.googleDrive.listDriveFolders.useQuery(
+    { parentFolderId: folder.id },
+    { enabled: isExpanded },
+  );
+
+  return (
+    <div>
+      <div
+        className="flex items-center gap-1 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer"
+        style={{ paddingLeft: `${depth * 20 + 8}px` }}
+      >
+        {folder.hasChildren ? (
+          <button
+            onClick={() => onToggleExpand(folder.id)}
+            className="p-0.5 hover:bg-gray-200 rounded"
+          >
+            {isExpanded ? (
+              <ChevronDown className="w-4 h-4 text-gray-500" />
+            ) : (
+              <ChevronRight className="w-4 h-4 text-gray-500" />
+            )}
+          </button>
+        ) : (
+          <span className="w-5" />
+        )}
+
+        <label className="flex items-center gap-2 flex-1 cursor-pointer">
+          <input
+            type="checkbox"
+            checked={isSelected}
+            onChange={() => onToggleSelect(folder.id, folder.name)}
+            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
+          />
+          <FolderOpen className="w-4 h-4 text-amber-500" />
+          <span className="text-sm text-gray-700">{folder.name}</span>
+        </label>
+      </div>
+
+      {isExpanded && (
+        <div>
+          {childrenQuery.isLoading && (
+            <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${(depth + 1) * 20 + 16}px` }}>
+              <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
+              <span className="text-xs text-gray-400">Loading...</span>
+            </div>
+          )}
+          {childrenQuery.data?.length === 0 && !childrenQuery.isLoading && (
+            <div className="py-1.5 text-xs text-gray-400" style={{ paddingLeft: `${(depth + 1) * 20 + 16}px` }}>
+              No subfolders
+            </div>
+          )}
+          {childrenQuery.data?.map((child) => (
+            <FolderTreeNode
+              key={child.id}
+              folder={child}
+              depth={depth + 1}
+              expandedFolders={expandedFolders}
+              selectedFolders={selectedFolders}
+              onToggleExpand={onToggleExpand}
+              onToggleSelect={onToggleSelect}
+            />
+          ))}
+        </div>
+      )}
+    </div>
+  );
+}
+
+export function FolderPicker({
+  open,
+  onOpenChange,
+  indexingMode,
+  initialSelectedFolders,
+  onConfirm,
+}: FolderPickerProps) {
+  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
+  const [selectedFolders, setSelectedFolders] = useState<Map<string, string>>(
+    () => new Map(initialSelectedFolders.map((f) => [f.id, f.name])),
+  );
+
+  const rootFoldersQuery = trpc.googleDrive.listDriveFolders.useQuery(
+    { parentFolderId: null },
+    { enabled: open },
+  );
+
+  const toggleExpand = useCallback((id: string) => {
+    setExpandedFolders((prev) => {
+      const next = new Set(prev);
+      if (next.has(id)) next.delete(id);
+      else next.add(id);
+      return next;
+    });
+  }, []);
+
+  const toggleSelect = useCallback((id: string, name: string) => {
+    setSelectedFolders((prev) => {
+      const next = new Map(prev);
+      if (next.has(id)) next.delete(id);
+      else next.set(id, name);
+      return next;
+    });
+  }, []);
+
+  const handleConfirm = () => {
+    const folders = Array.from(selectedFolders.entries()).map(([id, name]) => ({ id, name }));
+    onConfirm(folders);
+    onOpenChange(false);
+  };
+
+  const modeLabel =
+    indexingMode === "selected_folders"
+      ? "Select folders to include in indexing"
+      : "Select folders to exclude from indexing";
+
+  return (
+    <Dialog open={open} onOpenChange={onOpenChange}>
+      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
+        <DialogHeader>
+          <DialogTitle>Manage Folders</DialogTitle>
+          <p className="text-sm text-gray-500">{modeLabel}</p>
+        </DialogHeader>
+
+        <div className="flex-1 overflow-y-auto border rounded-lg p-2 min-h-[200px] max-h-[400px]">
+          {rootFoldersQuery.isLoading && (
+            <div className="flex items-center justify-center py-8">
+              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
+              <span className="text-sm text-gray-500">Loading folders...</span>
+            </div>
+          )}
+          {rootFoldersQuery.data?.map((folder) => (
+            <FolderTreeNode
+              key={folder.id}
+              folder={folder}
+              depth={0}
+              expandedFolders={expandedFolders}
+              selectedFolders={selectedFolders}
+              onToggleExpand={toggleExpand}
+              onToggleSelect={toggleSelect}
+            />
+          ))}
+          {rootFoldersQuery.data?.length === 0 && !rootFoldersQuery.isLoading && (
+            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
+              No folders found in your Google Drive
+            </div>
+          )}
+        </div>
+
+        <div className="text-xs text-gray-500">
+          {selectedFolders.size} folder{selectedFolders.size !== 1 ? "s" : ""} selected
+        </div>
+
+        <DialogFooter>
+          <Button variant="outline" onClick={() => onOpenChange(false)}>
+            Cancel
+          </Button>
+          <Button onClick={handleConfirm}>Save Selection</Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/apps/web/client/src/components/settings/GoogleDrivePanel.tsx b/apps/web/client/src/components/settings/GoogleDrivePanel.tsx
index 2c848b4..62cd1e4 100644
--- a/apps/web/client/src/components/settings/GoogleDrivePanel.tsx
+++ b/apps/web/client/src/components/settings/GoogleDrivePanel.tsx
@@ -1,16 +1,675 @@
 /**
- * Google Drive connection panel for the Settings > Integrations tab.
+ * Google Drive dashboard panel for the Settings > Integrations tab.
  *
- * Three states: not_connected, connected, expired.
- * Uses popup OAuth flow with window.open -> callback page -> close.
+ * When not connected: shows connect button with OAuth popup flow.
+ * When connected: shows a 4-tab dashboard (Overview, Files, Credit Usage, Pricing).
  */
 
-import { useState, useCallback, useRef, useEffect } from "react";
+import { useState, useCallback, useRef, useEffect, useMemo } from "react";
 import { trpc } from "@/lib/trpc";
 import { toast } from "sonner";
+import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Badge } from "@/components/ui/badge";
+import {
+  HardDrive,
+  Files,
+  CreditCard,
+  DollarSign,
+  RefreshCw,
+  FolderOpen,
+  ChevronLeft,
+  ChevronRight,
+  Search,
+  CheckCircle2,
+  AlertCircle,
+  Loader2,
+  Clock,
+  ExternalLink,
+  RotateCcw,
+  Trash2,
+  Download,
+} from "lucide-react";
+import { FolderPicker } from "./FolderPicker";
+
+// ── Helpers ──────────────────────────────────────────────
+
+function relativeTime(iso: string | null): string {
+  if (!iso) return "Never";
+  const diff = Date.now() - new Date(iso).getTime();
+  const mins = Math.floor(diff / 60000);
+  if (mins < 1) return "Just now";
+  if (mins < 60) return `${mins}m ago`;
+  const hrs = Math.floor(mins / 60);
+  if (hrs < 24) return `${hrs}h ago`;
+  const days = Math.floor(hrs / 24);
+  return `${days}d ago`;
+}
+
+function formatCredits(n: number): string {
+  return n.toLocaleString();
+}
+
+function getCurrentMonthKey(): string {
+  const now = new Date();
+  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
+}
+
+// ── Google Drive SVG Icon ────────────────────────────────
+
+function GoogleDriveIcon({ className = "w-8 h-8" }: { className?: string }) {
+  return (
+    <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
+      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
+      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47" />
+      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.95 10.3z" fill="#ea4335" />
+      <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
+      <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h36.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
+      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
+    </svg>
+  );
+}
+
+// ── Overview Panel ───────────────────────────────────────
+
+function OverviewPanel({
+  connectionStatus,
+  onDisconnect,
+  onSyncNow,
+  onSetTab,
+}: {
+  connectionStatus: { email: string | null; scopes: string[]; connectedAt: string | null };
+  onDisconnect: () => void;
+  onSyncNow: () => void;
+  onSetTab: (tab: string) => void;
+}) {
+  const overviewQuery = trpc.googleDrive.getDashboardOverview.useQuery();
+  const budgetQuery = trpc.credits.getBudget.useQuery();
+  const activityQuery = trpc.googleDrive.getRecentActivity.useQuery({ limit: 5 });
+  const syncMutation = trpc.googleDrive.startSync.useMutation({
+    onSuccess: () => {
+      toast.success("Sync started");
+      overviewQuery.refetch();
+    },
+    onError: (err) => toast.error(err.message),
+  });
+
+  const overview = overviewQuery.data;
+  const budget = budgetQuery.data;
+
+  const budgetPct =
+    budget && budget.monthlyLimit > 0
+      ? Math.min(100, Math.round((budget.creditsUsedThisMonth / budget.monthlyLimit) * 100))
+      : 0;
+
+  return (
+    <div className="space-y-6">
+      {/* Status Cards Grid */}
+      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
+        {/* Connection Card */}
+        <div className="rounded-lg border p-4">
+          <div className="flex items-center gap-2 mb-2">
+            <span className="w-2 h-2 rounded-full bg-green-500" />
+            <span className="text-sm font-medium text-green-700">Connected</span>
+          </div>
+          {connectionStatus.email && (
+            <p className="text-sm text-gray-700 mb-1">{connectionStatus.email}</p>
+          )}
+          {connectionStatus.scopes.length > 0 && (
+            <div className="flex flex-wrap gap-1 mb-3">
+              {connectionStatus.scopes.map((s) => (
+                <Badge key={s} variant="secondary" className="text-xs">
+                  {s.split("/").pop()}
+                </Badge>
+              ))}
+            </div>
+          )}
+          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={onDisconnect}>
+            Disconnect
+          </Button>
+        </div>
+
+        {/* Sync Status Card */}
+        <div className="rounded-lg border p-4">
+          <div className="text-xs text-gray-500 mb-1">Sync Status</div>
+          <div className="flex items-center gap-2 mb-2">
+            {overview?.syncStatus === "syncing" ? (
+              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
+            ) : overview?.syncStatus === "error" ? (
+              <AlertCircle className="w-4 h-4 text-red-500" />
+            ) : (
+              <CheckCircle2 className="w-4 h-4 text-green-500" />
+            )}
+            <span className="text-sm font-medium capitalize">{overview?.syncStatus ?? "idle"}</span>
+          </div>
+          <p className="text-xs text-gray-500 mb-3">
+            Last sync: {relativeTime(overview?.lastSyncAt ?? null)}
+          </p>
+          <Button
+            variant="outline"
+            size="sm"
+            onClick={() => { onSyncNow(); syncMutation.mutate(); }}
+            disabled={syncMutation.isPending || overview?.syncStatus === "syncing"}
+          >
+            <RefreshCw className={`w-3 h-3 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
+            Sync Now
+          </Button>
+        </div>
+
+        {/* Monthly Credits Card */}
+        <div className="rounded-lg border p-4">
+          <div className="text-xs text-gray-500 mb-1">Monthly Credits</div>
+          {budget && budget.monthlyLimit > 0 ? (
+            <>
+              <p className="text-sm font-medium mb-1">
+                {formatCredits(budget.creditsUsedThisMonth)} / {formatCredits(budget.monthlyLimit)}
+              </p>
+              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
+                <div
+                  className={`h-full rounded-full ${budgetPct >= 100 ? "bg-red-500" : budgetPct >= 80 ? "bg-amber-500" : "bg-green-500"}`}
+                  style={{ width: `${budgetPct}%` }}
+                />
+              </div>
+              <p className="text-xs text-gray-500">
+                ${(budget.creditsUsedThisMonth * 0.001).toFixed(2)} / ${(budget.monthlyLimit * 0.001).toFixed(2)}
+              </p>
+            </>
+          ) : (
+            <p className="text-sm text-gray-500">No budget set</p>
+          )}
+          <button onClick={() => onSetTab("credit-usage")} className="text-xs text-purple-600 hover:underline mt-1">
+            View Details
+          </button>
+        </div>
+
+        {/* Indexed Files Card */}
+        <div className="rounded-lg border p-4">
+          <div className="text-xs text-gray-500 mb-1">Indexed Files</div>
+          <p className="text-lg font-semibold">{formatCredits(overview?.indexedFileCount ?? 0)} files</p>
+          <p className="text-sm text-gray-500">{formatCredits(overview?.totalChunks ?? 0)} chunks</p>
+          <button onClick={() => onSetTab("files")} className="text-xs text-purple-600 hover:underline mt-1">
+            Browse Files
+          </button>
+        </div>
+
+        {/* Indexing Mode Card */}
+        <div className="rounded-lg border p-4">
+          <div className="text-xs text-gray-500 mb-1">Indexing Mode</div>
+          <p className="text-sm font-medium capitalize">{(overview?.indexingMode ?? "none").replace("_", " ")}</p>
+          {overview && overview.folderCount > 0 && (
+            <p className="text-xs text-gray-500">{overview.folderCount} folders configured</p>
+          )}
+        </div>
+
+        {/* Auto-Sync Card */}
+        <div className="rounded-lg border p-4">
+          <div className="text-xs text-gray-500 mb-1">Auto-Sync</div>
+          <div className="flex items-center gap-2">
+            <span className={`w-2 h-2 rounded-full ${overview?.autoSyncEnabled ? "bg-green-500" : "bg-gray-400"}`} />
+            <span className="text-sm font-medium">{overview?.autoSyncEnabled ? "Enabled" : "Disabled"}</span>
+          </div>
+          {overview?.channelExpiry && (
+            <p className="text-xs text-gray-500 mt-1">
+              Webhook expires: {relativeTime(overview.channelExpiry)}
+            </p>
+          )}
+        </div>
+      </div>
+
+      {/* Recent Activity */}
+      <div>
+        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>
+        {activityQuery.data && activityQuery.data.length > 0 ? (
+          <div className="space-y-1">
+            {activityQuery.data.map((a: { timestamp: string; description: string; credits: number }, i: number) => (
+              <div key={i} className={`flex items-center justify-between py-2 px-3 rounded text-sm ${i % 2 === 0 ? "bg-gray-50" : ""}`}>
+                <div className="flex items-center gap-2">
+                  <Clock className="w-3 h-3 text-gray-400" />
+                  <span className="text-xs text-gray-500">{relativeTime(a.timestamp)}</span>
+                  <span className="text-gray-700">{a.description}</span>
+                </div>
+                <span className={`text-xs font-medium ${a.credits < 0 ? "text-red-600" : "text-green-600"}`}>
+                  {a.credits < 0 ? "" : "+"}{a.credits} cr
+                </span>
+              </div>
+            ))}
+          </div>
+        ) : (
+          <p className="text-sm text-gray-500">No recent activity</p>
+        )}
+      </div>
+    </div>
+  );
+}
+
+// ── Files Panel ──────────────────────────────────────────
+
+function FilesPanel() {
+  const [search, setSearch] = useState("");
+  const [debouncedSearch, setDebouncedSearch] = useState("");
+  const [typeFilter, setTypeFilter] = useState("all");
+  const [statusFilter, setStatusFilter] = useState("all");
+  const [page, setPage] = useState(1);
+  const pageSize = 20;
+
+  // Debounce search
+  useEffect(() => {
+    const timer = setTimeout(() => setDebouncedSearch(search), 300);
+    return () => clearTimeout(timer);
+  }, [search]);
+
+  useEffect(() => { setPage(1); }, [debouncedSearch, typeFilter, statusFilter]);
+
+  const filesQuery = trpc.googleDrive.getIndexedFiles.useQuery({
+    search: debouncedSearch || undefined,
+    fileType: typeFilter !== "all" ? typeFilter : undefined,
+    status: statusFilter !== "all" ? statusFilter : undefined,
+    page,
+    pageSize,
+  });
+
+  const reindexMutation = trpc.googleDrive.reindexFile.useMutation({
+    onSuccess: () => { toast.success("Re-index queued"); filesQuery.refetch(); },
+    onError: (err) => toast.error(err.message),
+  });
+
+  const removeMutation = trpc.googleDrive.removeFromIndex.useMutation({
+    onSuccess: () => { toast.success("File removed from index"); filesQuery.refetch(); },
+    onError: (err) => toast.error(err.message),
+  });
+
+  const totalPages = Math.ceil((filesQuery.data?.total ?? 0) / pageSize);
+
+  const statusIcon = (status: string) => {
+    switch (status) {
+      case "ready": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
+      case "pending": return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
+      case "processing": return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
+      case "error": return <AlertCircle className="w-4 h-4 text-red-500" />;
+      default: return <AlertCircle className="w-4 h-4 text-yellow-500" />;
+    }
+  };
+
+  return (
+    <div className="space-y-4">
+      {/* Filters */}
+      <div className="flex flex-wrap gap-3">
+        <div className="relative flex-1 min-w-[200px]">
+          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
+          <Input
+            placeholder="Search files..."
+            value={search}
+            onChange={(e) => setSearch(e.target.value)}
+            className="pl-9"
+          />
+        </div>
+        <select
+          value={typeFilter}
+          onChange={(e) => setTypeFilter(e.target.value)}
+          className="border rounded-md px-3 py-2 text-sm bg-white"
+        >
+          <option value="all">All Types</option>
+          <option value="document">Document</option>
+          <option value="spreadsheet">Spreadsheet</option>
+          <option value="presentation">Presentation</option>
+          <option value="pdf">PDF</option>
+        </select>
+        <select
+          value={statusFilter}
+          onChange={(e) => setStatusFilter(e.target.value)}
+          className="border rounded-md px-3 py-2 text-sm bg-white"
+        >
+          <option value="all">All Status</option>
+          <option value="ready">Synced</option>
+          <option value="pending">Pending</option>
+          <option value="error">Error</option>
+        </select>
+      </div>
+
+      {/* Table */}
+      <div className="overflow-x-auto">
+        <table className="w-full text-sm">
+          <thead>
+            <tr className="border-b text-left">
+              <th className="pb-2 pl-2 font-medium text-gray-500">File Name</th>
+              <th className="pb-2 font-medium text-gray-500">Type</th>
+              <th className="pb-2 font-medium text-gray-500 text-right">Chunks</th>
+              <th className="pb-2 font-medium text-gray-500">Last Sync</th>
+              <th className="pb-2 font-medium text-gray-500 text-right">Actions</th>
+            </tr>
+          </thead>
+          <tbody>
+            {filesQuery.data?.files.map((f: { id: number; name: string; mimeType: string; chunkCount: number; syncStatus: string; driveFileId: string | null; lastSyncedAt: string | null }) => (
+              <tr key={f.id} className="border-b hover:bg-gray-50">
+                <td className="py-2 pl-2">
+                  <div className="flex items-center gap-2">
+                    {statusIcon(f.syncStatus)}
+                    <span className="text-gray-900">{f.name}</span>
+                    {f.driveFileId && (
+                      <a
+                        href={`https://drive.google.com/file/d/${f.driveFileId}`}
+                        target="_blank"
+                        rel="noopener noreferrer"
+                        className="text-gray-400 hover:text-gray-600"
+                      >
+                        <ExternalLink className="w-3 h-3" />
+                      </a>
+                    )}
+                  </div>
+                </td>
+                <td className="py-2">
+                  <Badge variant="secondary" className="text-xs">{f.mimeType.split(".").pop() || f.mimeType}</Badge>
+                </td>
+                <td className="py-2 text-right text-gray-600">{f.chunkCount}</td>
+                <td className="py-2 text-gray-500 text-xs">{relativeTime(f.lastSyncedAt)}</td>
+                <td className="py-2 text-right">
+                  <div className="flex items-center justify-end gap-1">
+                    <Button
+                      variant="ghost"
+                      size="sm"
+                      onClick={() => reindexMutation.mutate({ libraryItemId: f.id })}
+                      disabled={reindexMutation.isPending}
+                      title="Re-index"
+                    >
+                      <RotateCcw className="w-3 h-3" />
+                    </Button>
+                    <Button
+                      variant="ghost"
+                      size="sm"
+                      className="text-red-500 hover:text-red-700"
+                      onClick={() => {
+                        if (confirm("Remove this file from the index? The file remains in your Google Drive.")) {
+                          removeMutation.mutate({ libraryItemId: f.id });
+                        }
+                      }}
+                      disabled={removeMutation.isPending}
+                      title="Remove from index"
+                    >
+                      <Trash2 className="w-3 h-3" />
+                    </Button>
+                  </div>
+                </td>
+              </tr>
+            ))}
+            {filesQuery.data?.files.length === 0 && (
+              <tr>
+                <td colSpan={5} className="py-8 text-center text-gray-500">
+                  No indexed files found
+                </td>
+              </tr>
+            )}
+          </tbody>
+        </table>
+      </div>
+
+      {/* Pagination */}
+      {totalPages > 1 && (
+        <div className="flex items-center justify-between">
+          <span className="text-xs text-gray-500">
+            {filesQuery.data?.total ?? 0} files total
+          </span>
+          <div className="flex items-center gap-2">
+            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
+              <ChevronLeft className="w-3 h-3" />
+            </Button>
+            <span className="text-sm text-gray-600">
+              {page} / {totalPages}
+            </span>
+            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
+              <ChevronRight className="w-3 h-3" />
+            </Button>
+          </div>
+        </div>
+      )}
+    </div>
+  );
+}
+
+// ── Credit Usage Panel ───────────────────────────────────
+
+function CreditUsagePanel() {
+  const monthKey = getCurrentMonthKey();
+  const breakdownQuery = trpc.googleDrive.getCreditUsageBreakdown.useQuery({ monthKey });
+  const budgetQuery = trpc.credits.getBudget.useQuery();
+
+  const budget = budgetQuery.data;
+  const breakdown = breakdownQuery.data;
+
+  const budgetPct =
+    budget && budget.monthlyLimit > 0
+      ? Math.min(100, Math.round((budget.creditsUsedThisMonth / budget.monthlyLimit) * 100))
+      : 0;
+
+  const maxDaily = useMemo(() => {
+    if (!breakdown?.dailyUsage?.length) return 1;
+    return Math.max(...breakdown.dailyUsage.map((d: { credits: number }) => d.credits), 1);
+  }, [breakdown?.dailyUsage]);
+
+  return (
+    <div className="space-y-6">
+      {/* Budget Meter */}
+      {budget && budget.monthlyLimit > 0 && (
+        <div className="rounded-lg border p-4">
+          <h3 className="text-sm font-semibold mb-3">Monthly Budget</h3>
+          <div className="flex justify-between text-sm mb-1">
+            <span>{formatCredits(budget.creditsUsedThisMonth)} / {formatCredits(budget.monthlyLimit)} credits</span>
+            <span className="font-medium">{budgetPct}%</span>
+          </div>
+          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden mb-2">
+            <div
+              className={`h-full rounded-full transition-all ${budgetPct >= 100 ? "bg-red-500" : budgetPct >= 80 ? "bg-amber-500" : "bg-green-500"}`}
+              style={{ width: `${budgetPct}%` }}
+            />
+          </div>
+          <p className="text-xs text-gray-500">
+            ${(budget.creditsUsedThisMonth * 0.001).toFixed(2)} spent - ${((budget.monthlyLimit - budget.creditsUsedThisMonth) * 0.001).toFixed(2)} remaining
+          </p>
+        </div>
+      )}
+
+      {/* Breakdown Table */}
+      <div className="rounded-lg border p-4">
+        <h3 className="text-sm font-semibold mb-3">Breakdown by Operation</h3>
+        {breakdown?.breakdown.length ? (
+          <table className="w-full text-sm">
+            <thead>
+              <tr className="border-b">
+                <th className="pb-2 text-left font-medium text-gray-500">Operation</th>
+                <th className="pb-2 text-right font-medium text-gray-500">Count</th>
+                <th className="pb-2 text-right font-medium text-gray-500">Credits</th>
+                <th className="pb-2 text-right font-medium text-gray-500 w-24">% of Total</th>
+              </tr>
+            </thead>
+            <tbody>
+              {breakdown.breakdown.map((row: { serviceTag: string; operation: string; count: number; totalCredits: number; percentOfTotal: number }) => (
+                <tr key={row.serviceTag} className="border-b last:border-0">
+                  <td className="py-2 text-gray-700">{row.operation}</td>
+                  <td className="py-2 text-right text-gray-600">{row.count}</td>
+                  <td className="py-2 text-right text-gray-600">{formatCredits(row.totalCredits)}</td>
+                  <td className="py-2 text-right">
+                    <div className="flex items-center justify-end gap-2">
+                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
+                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${row.percentOfTotal}%` }} />
+                      </div>
+                      <span className="text-xs text-gray-500 w-8 text-right">{row.percentOfTotal}%</span>
+                    </div>
+                  </td>
+                </tr>
+              ))}
+            </tbody>
+          </table>
+        ) : (
+          <p className="text-sm text-gray-500">No usage data for this month</p>
+        )}
+        {breakdown && (
+          <div className="mt-3 pt-3 border-t flex justify-between text-sm">
+            <span className="text-gray-500">Total: {breakdown.totalOperations} operations</span>
+            <span className="font-medium">{formatCredits(breakdown.totalCredits)} credits (${(breakdown.totalCredits * 0.001).toFixed(2)})</span>
+          </div>
+        )}
+      </div>
+
+      {/* Daily Usage Chart (CSS bars) */}
+      {breakdown?.dailyUsage && breakdown.dailyUsage.length > 0 && (
+        <div className="rounded-lg border p-4">
+          <h3 className="text-sm font-semibold mb-3">Daily Usage (This Month)</h3>
+          <div className="flex items-end gap-px h-24">
+            {breakdown.dailyUsage.map((d: { date: string; credits: number }) => (
+              <div
+                key={d.date}
+                className="flex-1 bg-purple-400 hover:bg-purple-500 rounded-t-sm transition-colors cursor-pointer group relative"
+                style={{ height: `${Math.max(2, (d.credits / maxDaily) * 100)}%` }}
+                title={`${d.date}: ${d.credits} credits`}
+              />
+            ))}
+          </div>
+          <div className="flex justify-between text-xs text-gray-400 mt-1">
+            <span>{breakdown.dailyUsage[0]?.date.slice(5)}</span>
+            <span>{breakdown.dailyUsage[breakdown.dailyUsage.length - 1]?.date.slice(5)}</span>
+          </div>
+        </div>
+      )}
+    </div>
+  );
+}
+
+// ── Pricing Info Panel ───────────────────────────────────
+
+function PricingInfoPanel() {
+  const pricingCategories = [
+    {
+      title: "A. Document Management",
+      rows: [
+        { op: "Upload file + indexing", cost: "2-200 cr", how: "Per chunk (2 credits/chunk)" },
+        { op: "Save markdown + re-index", cost: "2-200 cr", how: "Same as upload" },
+        { op: "Upload (no index)", cost: "Free", how: "Metadata only" },
+        { op: "Download / preview", cost: "Free", how: "S3 GET" },
+        { op: "Keyword search", cost: "Free", how: "Database query" },
+      ],
+    },
+    {
+      title: "B. AI Search & RAG",
+      rows: [
+        { op: "RAG semantic search", cost: "1 cr", how: "Vector embedding query" },
+        { op: "RAG context in chat", cost: "1 cr", how: "Plus separate LLM cost" },
+        { op: "Keyword/BM25 search", cost: "Free", how: "No AI" },
+      ],
+    },
+    {
+      title: "C. Google Drive",
+      rows: [
+        { op: "Index Drive file", cost: "2-200 cr", how: "Same as upload indexing" },
+        { op: "Re-index (unchanged)", cost: "Free", how: "Hash check skips" },
+        { op: "AI read file (MCP)", cost: "1-5 cr", how: "Per 2,000 chars" },
+        { op: "AI read sheet (MCP)", cost: "1-3 cr", how: "Per 500 cells" },
+        { op: "Search Drive files", cost: "Free", how: "Google API" },
+        { op: "Browse folders", cost: "Free", how: "Metadata only" },
+      ],
+    },
+    {
+      title: "D. AI Chat & LLM",
+      rows: [
+        { op: "Chat (GPT-4o, Claude, etc.)", cost: "Variable", how: "Token-based pricing" },
+        { op: "Translation", cost: "Variable", how: "Token-based" },
+        { op: "Skill execution", cost: "Variable", how: "Token-based" },
+      ],
+    },
+    {
+      title: "E. Media Generation",
+      rows: [
+        { op: "Image generation", cost: "Variable", how: "Model x resolution x count" },
+        { op: "Video generation", cost: "Variable", how: "Model x duration x resolution" },
+        { op: "Audio/TTS", cost: "Variable", how: "Model x duration" },
+      ],
+    },
+    {
+      title: "F. Always Free",
+      rows: [
+        { op: "Login / Settings / Profile / Admin", cost: "Free", how: "" },
+        { op: "Dashboard / Analytics", cost: "Free", how: "" },
+        { op: "View credit usage / Export CSV", cost: "Free", how: "" },
+      ],
+    },
+  ];
+
+  return (
+    <div className="space-y-4">
+      <div className="rounded-lg border p-4 bg-purple-50">
+        <h3 className="text-sm font-semibold text-purple-900">SmartSpecPro - Pricing & Cost Guide</h3>
+        <p className="text-xs text-purple-700 mt-1">1 credit = $0.001 USD | 1,000 credits = $1.00</p>
+      </div>
+
+      {pricingCategories.map((cat) => (
+        <div key={cat.title} className="rounded-lg border p-4">
+          <h4 className="text-sm font-semibold mb-3">{cat.title}</h4>
+          <table className="w-full text-sm">
+            <thead>
+              <tr className="border-b">
+                <th className="pb-2 text-left font-medium text-gray-500">Operation</th>
+                <th className="pb-2 text-right font-medium text-gray-500">Cost</th>
+                <th className="pb-2 text-left font-medium text-gray-500 pl-4 hidden sm:table-cell">How it works</th>
+              </tr>
+            </thead>
+            <tbody>
+              {cat.rows.map((row) => (
+                <tr key={row.op} className="border-b last:border-0">
+                  <td className="py-1.5 text-gray-700">{row.op}</td>
+                  <td className="py-1.5 text-right">
+                    {row.cost === "Free" ? (
+                      <Badge variant="secondary" className="text-green-700 bg-green-100">Free</Badge>
+                    ) : (
+                      <span className="text-gray-600">{row.cost}</span>
+                    )}
+                  </td>
+                  <td className="py-1.5 text-gray-500 pl-4 hidden sm:table-cell text-xs">{row.how}</td>
+                </tr>
+              ))}
+            </tbody>
+          </table>
+        </div>
+      ))}
+
+      {/* Cost Examples */}
+      <div className="rounded-lg border p-4">
+        <h4 className="text-sm font-semibold mb-3">Cost Examples</h4>
+        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
+          <div className="bg-gray-50 rounded-lg p-3">
+            <p className="text-sm font-medium mb-2">Upload 5 files</p>
+            <div className="text-xs text-gray-600 space-y-0.5">
+              <p>5 files x ~10 chunks avg = 50 chunks</p>
+              <p>50 chunks x 2 cr = 100 credits</p>
+              <p className="font-medium text-gray-900 pt-1">Total: 100 cr ($0.10)</p>
+            </div>
+          </div>
+          <div className="bg-gray-50 rounded-lg p-3">
+            <p className="text-sm font-medium mb-2">Sync Drive folder (50 files)</p>
+            <div className="text-xs text-gray-600 space-y-0.5">
+              <p>50 files x ~15 chunks avg = 750 chunks</p>
+              <p>750 chunks x 2 cr = 1,500 credits</p>
+              <p className="font-medium text-gray-900 pt-1">Total: 1,500 cr ($1.50)</p>
+            </div>
+          </div>
+          <div className="bg-gray-50 rounded-lg p-3">
+            <p className="text-sm font-medium mb-2">Daily usage estimate</p>
+            <div className="text-xs text-gray-600 space-y-0.5">
+              <p>5 RAG searches = 5 cr</p>
+              <p>2 MCP reads = 4 cr</p>
+              <p className="font-medium text-gray-900 pt-1">~9 cr/day ($0.27/month)</p>
+            </div>
+          </div>
+        </div>
+      </div>
+    </div>
+  );
+}
+
+// ── Main GoogleDrivePanel ────────────────────────────────
 
 export function GoogleDrivePanel() {
   const [isConnecting, setIsConnecting] = useState(false);
+  const [activeTab, setActiveTab] = useState("overview");
+  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
   const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
 
   useEffect(() => {
@@ -19,21 +678,24 @@ export function GoogleDrivePanel() {
     };
   }, []);
 
-  const statusQuery = trpc.googleDrive.getConnectionStatus.useQuery(
-    undefined,
-    { retry: false },
-  );
-  const authUrlQuery = trpc.googleDrive.getAuthUrl.useQuery(undefined, {
-    enabled: false,
+  const statusQuery = trpc.googleDrive.getConnectionStatus.useQuery(undefined, { retry: false });
+  const authUrlQuery = trpc.googleDrive.getAuthUrl.useQuery(undefined, { enabled: false });
+  const syncStatusQuery = trpc.googleDrive.getSyncStatus.useQuery(undefined, {
+    enabled: statusQuery.data?.status === "connected",
   });
   const disconnectMutation = trpc.googleDrive.disconnect.useMutation({
     onSuccess: () => {
       toast.success("Google Drive disconnected");
       statusQuery.refetch();
     },
-    onError: (err) => {
-      toast.error(`Disconnect failed: ${err.message}`);
+    onError: (err) => toast.error(`Disconnect failed: ${err.message}`),
+  });
+  const updateSettingsMutation = trpc.googleDrive.updateSyncSettings.useMutation({
+    onSuccess: () => {
+      toast.success("Folder settings updated");
+      syncStatusQuery.refetch();
     },
+    onError: (err) => toast.error(err.message),
   });
 
   const handleConnect = useCallback(async () => {
@@ -49,7 +711,6 @@ export function GoogleDrivePanel() {
 
       const popup = window.open(url, "_blank", "width=600,height=700");
 
-      // Poll for popup close, with cleanup via ref
       if (timerRef.current) clearInterval(timerRef.current);
       timerRef.current = setInterval(() => {
         if (popup && popup.closed) {
@@ -66,126 +727,112 @@ export function GoogleDrivePanel() {
   }, [authUrlQuery, statusQuery]);
 
   const status = statusQuery.data?.status ?? "not_connected";
-  const email = statusQuery.data?.email;
+  const email = statusQuery.data?.email ?? null;
   const scopes = statusQuery.data?.scopes ?? [];
-  const connectedAt = statusQuery.data?.connectedAt;
+  const connectedAt = statusQuery.data?.connectedAt ?? null;
+
+  const handleFolderConfirm = (folders: Array<{ id: string; name: string }>) => {
+    const mode = syncStatusQuery.data?.indexingMode || "selected_folders";
+    updateSettingsMutation.mutate({
+      indexingMode: mode === "none" || mode === "all" ? "selected_folders" : mode as any,
+      folderSelections: folders.map((f) => ({ folderId: f.id, folderName: f.name })),
+    });
+  };
 
   return (
-    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
-      <div className="flex items-center gap-3 mb-4">
-        <svg
-          className="w-8 h-8"
-          viewBox="0 0 87.3 78"
-          xmlns="http://www.w3.org/2000/svg"
-        >
-          <path
-            d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.5c0 1.55.4 3.1 1.2 4.5z"
-            fill="#0066da"
-          />
-          <path
-            d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"
-            fill="#00ac47"
-          />
-          <path
-            d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.95 10.3z"
-            fill="#ea4335"
-          />
-          <path
-            d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
-            fill="#00832d"
-          />
-          <path
-            d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h36.8c1.6 0 3.15-.45 4.5-1.2z"
-            fill="#2684fc"
-          />
-          <path
-            d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
-            fill="#ffba00"
-          />
-        </svg>
+    <div className="space-y-4">
+      {/* Header */}
+      <div className="flex items-center gap-3">
+        <GoogleDriveIcon />
         <div>
-          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
-            Google Drive & Workspace
-          </h3>
-          <p className="text-sm text-gray-500 dark:text-gray-400">
-            Edit Word/Excel in Google Docs, AI-search Drive files
-          </p>
+          <h3 className="text-lg font-semibold text-gray-900">Google Drive & Workspace</h3>
+          <p className="text-sm text-gray-500">Edit Word/Excel in Google Docs, AI-search Drive files</p>
         </div>
       </div>
 
+      {/* Not Connected */}
       {status === "not_connected" && (
-        <div>
-          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
-            Connect your Google account to enable editing Word and Excel files in
-            Google Docs/Sheets, and AI-powered search across your Drive files.
+        <div className="rounded-lg border p-6">
+          <p className="text-sm text-gray-600 mb-4">
+            Connect your Google account to enable editing Word and Excel files in Google Docs/Sheets, and AI-powered search across your Drive files.
           </p>
-          <button
-            onClick={handleConnect}
-            disabled={isConnecting}
-            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
-          >
-            {isConnecting ? "Connecting..." : "Connect Google Drive"}
-          </button>
-        </div>
-      )}
-
-      {status === "connected" && (
-        <div>
-          <div className="flex items-center gap-2 mb-3">
-            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
-            <span className="text-sm font-medium text-green-700 dark:text-green-400">
-              Connected
-            </span>
-          </div>
-          {email && (
-            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
-              {email}
-            </p>
-          )}
-          {connectedAt && (
-            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
-              Connected {new Date(connectedAt).toLocaleDateString()}
-            </p>
-          )}
-          {scopes.length > 0 && (
-            <div className="flex flex-wrap gap-1 mb-4">
-              {scopes.map((s) => (
-                <span
-                  key={s}
-                  className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300"
-                >
-                  {s.split("/").pop()}
-                </span>
-              ))}
-            </div>
-          )}
-          <button
-            onClick={() => disconnectMutation.mutate()}
-            disabled={disconnectMutation.isPending}
-            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 text-sm font-medium"
-          >
-            {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
-          </button>
+          <Button onClick={handleConnect} disabled={isConnecting}>
+            {isConnecting ? (
+              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
+            ) : (
+              "Connect Google Drive"
+            )}
+          </Button>
         </div>
       )}
 
+      {/* Expired */}
       {status === "expired" && (
-        <div>
-          <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 mb-4">
-            <p className="text-sm text-yellow-800 dark:text-yellow-300">
-              Your Google Drive connection has expired. Reconnect to continue
-              using Drive features.
+        <div className="rounded-lg border p-6">
+          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 mb-4">
+            <p className="text-sm text-yellow-800">
+              Your Google Drive connection has expired. Reconnect to continue using Drive features.
             </p>
           </div>
-          <button
-            onClick={handleConnect}
-            disabled={isConnecting}
-            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 text-sm font-medium"
-          >
+          <Button onClick={handleConnect} disabled={isConnecting} className="bg-yellow-600 hover:bg-yellow-700">
             {isConnecting ? "Reconnecting..." : "Reconnect"}
-          </button>
+          </Button>
         </div>
       )}
+
+      {/* Connected: Full Dashboard */}
+      {status === "connected" && (
+        <Tabs value={activeTab} onValueChange={setActiveTab}>
+          <TabsList className="mb-4">
+            <TabsTrigger value="overview" className="flex items-center gap-1.5">
+              <HardDrive className="w-3.5 h-3.5" /> Overview
+            </TabsTrigger>
+            <TabsTrigger value="files" className="flex items-center gap-1.5">
+              <Files className="w-3.5 h-3.5" /> Files
+            </TabsTrigger>
+            <TabsTrigger value="credit-usage" className="flex items-center gap-1.5">
+              <CreditCard className="w-3.5 h-3.5" /> Credit Usage
+            </TabsTrigger>
+            <TabsTrigger value="pricing" className="flex items-center gap-1.5">
+              <DollarSign className="w-3.5 h-3.5" /> Pricing
+            </TabsTrigger>
+          </TabsList>
+
+          <TabsContent value="overview">
+            <OverviewPanel
+              connectionStatus={{ email, scopes, connectedAt }}
+              onDisconnect={() => disconnectMutation.mutate()}
+              onSyncNow={() => {}}
+              onSetTab={setActiveTab}
+            />
+          </TabsContent>
+
+          <TabsContent value="files">
+            <FilesPanel />
+          </TabsContent>
+
+          <TabsContent value="credit-usage">
+            <CreditUsagePanel />
+          </TabsContent>
+
+          <TabsContent value="pricing">
+            <PricingInfoPanel />
+          </TabsContent>
+        </Tabs>
+      )}
+
+      {/* Folder Picker Dialog */}
+      <FolderPicker
+        open={folderPickerOpen}
+        onOpenChange={setFolderPickerOpen}
+        indexingMode={
+          (syncStatusQuery.data?.indexingMode as "selected_folders" | "all_except") ?? "selected_folders"
+        }
+        initialSelectedFolders={
+          ((syncStatusQuery.data?.folderSelections as string[]) ?? []).map((id) => ({ id, name: id }))
+        }
+        onConfirm={handleFolderConfirm}
+      />
     </div>
   );
 }
diff --git a/apps/web/server/routers/googleDrive.ts b/apps/web/server/routers/googleDrive.ts
index cd6da0b..e150153 100644
--- a/apps/web/server/routers/googleDrive.ts
+++ b/apps/web/server/routers/googleDrive.ts
@@ -7,12 +7,18 @@
 
 import { z } from "zod";
 import { randomUUID } from "crypto";
-import { eq, and } from "drizzle-orm";
+import { eq, and, sql, count, sum, desc, gte, lt, ilike } from "drizzle-orm";
 import { TRPCError } from "@trpc/server";
 import { protectedProcedure, router } from "../_core/trpc";
 import { signBearerToken } from "../_core/tokens";
 import { db } from "../db";
-import { googleDriveEditSessions, googleDriveSyncState, libraryItems } from "../../drizzle/schema";
+import {
+  googleDriveEditSessions,
+  googleDriveSyncState,
+  libraryItems,
+  libraryChunks,
+  creditTransactions,
+} from "../../drizzle/schema";
 import { storageGet, storagePut } from "../storage";
 
 const PYTHON_BACKEND_URL =
@@ -557,4 +563,345 @@ export const googleDriveRouter = router({
       estimated_size_mb: number;
     }>;
   }),
+
+  /**
+   * Dashboard overview: aggregated stats for at-a-glance display.
+   */
+  getDashboardOverview: protectedProcedure.query(async ({ ctx }) => {
+    if (!ctx.tenantId) return null;
+
+    // Sync state
+    const [syncState] = await db
+      .select()
+      .from(googleDriveSyncState)
+      .where(
+        and(
+          eq(googleDriveSyncState.tenantId, ctx.tenantId),
+          eq(googleDriveSyncState.userId, ctx.user.id),
+        ),
+      )
+      .limit(1);
+
+    // Count indexed files and chunks
+    const [fileStats] = await db
+      .select({
+        fileCount: count(libraryItems.id),
+      })
+      .from(libraryItems)
+      .where(
+        and(
+          eq(libraryItems.tenantId, ctx.tenantId),
+          eq(libraryItems.ownerUserId, ctx.user.id),
+          eq(libraryItems.source, "google_drive"),
+          sql`${libraryItems.deletedAt} IS NULL`,
+        ),
+      );
+
+    const [chunkStats] = await db
+      .select({
+        chunkCount: count(libraryChunks.id),
+      })
+      .from(libraryChunks)
+      .innerJoin(libraryItems, eq(libraryChunks.libraryItemId, libraryItems.id))
+      .where(
+        and(
+          eq(libraryItems.tenantId, ctx.tenantId),
+          eq(libraryItems.ownerUserId, ctx.user.id),
+          eq(libraryItems.source, "google_drive"),
+          sql`${libraryItems.deletedAt} IS NULL`,
+        ),
+      );
+
+    return {
+      indexedFileCount: fileStats?.fileCount ?? 0,
+      totalChunks: chunkStats?.chunkCount ?? 0,
+      lastSyncAt: syncState?.lastSyncAt?.toISOString() ?? null,
+      syncStatus: syncState?.lastError
+        ? "error"
+        : syncState?.filesTotal && syncState.filesProcessed !== null && syncState.filesProcessed < syncState.filesTotal
+          ? "syncing"
+          : "idle",
+      indexingMode: syncState?.indexingMode ?? "none",
+      autoSyncEnabled: syncState?.autoSyncEnabled ?? false,
+      channelExpiry: syncState?.channelExpiry?.toISOString() ?? null,
+      folderCount: (syncState?.folderSelections as string[] | null)?.length ?? 0,
+      filesTotal: syncState?.filesTotal ?? 0,
+      filesProcessed: syncState?.filesProcessed ?? 0,
+      lastError: syncState?.lastError ?? null,
+    };
+  }),
+
+  /**
+   * Paginated list of indexed Google Drive files with chunk counts.
+   */
+  getIndexedFiles: protectedProcedure
+    .input(
+      z.object({
+        search: z.string().optional(),
+        fileType: z.string().optional(),
+        status: z.string().optional(),
+        page: z.number().min(1).default(1),
+        pageSize: z.number().min(1).max(100).default(20),
+      }),
+    )
+    .query(async ({ ctx, input }) => {
+      if (!ctx.tenantId) return { files: [], total: 0, page: input.page, pageSize: input.pageSize };
+
+      const conditions = [
+        eq(libraryItems.tenantId, ctx.tenantId),
+        eq(libraryItems.ownerUserId, ctx.user.id),
+        eq(libraryItems.source, "google_drive"),
+        sql`${libraryItems.deletedAt} IS NULL`,
+      ];
+
+      if (input.search) {
+        conditions.push(ilike(libraryItems.title, `%${input.search}%`));
+      }
+      if (input.fileType && input.fileType !== "all") {
+        conditions.push(sql`${libraryItems.metadata}->>'driveMimeType' ILIKE ${"%" + input.fileType + "%"}`);
+      }
+      if (input.status && input.status !== "all") {
+        conditions.push(eq(libraryItems.status, input.status as any));
+      }
+
+      const offset = (input.page - 1) * input.pageSize;
+
+      // Count total
+      const [totalRow] = await db
+        .select({ total: count(libraryItems.id) })
+        .from(libraryItems)
+        .where(and(...conditions));
+
+      // Get files with chunk counts
+      const files = await db
+        .select({
+          id: libraryItems.id,
+          title: libraryItems.title,
+          itemType: libraryItems.itemType,
+          status: libraryItems.status,
+          metadata: libraryItems.metadata,
+          createdAt: libraryItems.createdAt,
+          updatedAt: libraryItems.updatedAt,
+          chunkCount: sql<number>`COALESCE((SELECT COUNT(*) FROM library_chunks WHERE library_item_id = ${libraryItems.id}), 0)`,
+        })
+        .from(libraryItems)
+        .where(and(...conditions))
+        .orderBy(desc(libraryItems.updatedAt))
+        .limit(input.pageSize)
+        .offset(offset);
+
+      return {
+        files: files.map((f: typeof files[number]) => {
+          const meta = (f.metadata || {}) as Record<string, any>;
+          return {
+            id: f.id,
+            name: f.title,
+            mimeType: meta.driveMimeType || f.itemType,
+            chunkCount: Number(f.chunkCount),
+            syncStatus: f.status,
+            driveFileId: meta.driveFileId || null,
+            lastSyncedAt: f.updatedAt?.toISOString() ?? null,
+          };
+        }),
+        total: totalRow?.total ?? 0,
+        page: input.page,
+        pageSize: input.pageSize,
+      };
+    }),
+
+  /**
+   * Monthly credit usage breakdown for Google Drive operations.
+   */
+  getCreditUsageBreakdown: protectedProcedure
+    .input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) }))
+    .query(async ({ ctx, input }) => {
+      const [year, month] = input.monthKey.split("-").map(Number);
+      const startDate = new Date(year, month - 1, 1);
+      const endDate = new Date(year, month, 1);
+
+      const rows = await db
+        .select({
+          serviceTag: sql<string>`COALESCE(${creditTransactions.metadata}->>'service', 'unknown')`,
+          txCount: count(creditTransactions.id),
+          totalCredits: sum(sql`ABS(${creditTransactions.amount})`),
+        })
+        .from(creditTransactions)
+        .where(
+          and(
+            eq(creditTransactions.userId, ctx.user.id),
+            gte(creditTransactions.createdAt, startDate),
+            lt(creditTransactions.createdAt, endDate),
+          ),
+        )
+        .groupBy(sql`COALESCE(${creditTransactions.metadata}->>'service', 'unknown')`);
+
+      const totalCredits = rows.reduce((s: number, r: typeof rows[number]) => s + Number(r.totalCredits ?? 0), 0);
+      const totalOperations = rows.reduce((s: number, r: typeof rows[number]) => s + Number(r.txCount), 0);
+
+      // Daily usage for chart
+      const dailyRows = await db
+        .select({
+          date: sql<string>`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`,
+          credits: sum(sql`ABS(${creditTransactions.amount})`),
+        })
+        .from(creditTransactions)
+        .where(
+          and(
+            eq(creditTransactions.userId, ctx.user.id),
+            gte(creditTransactions.createdAt, startDate),
+            lt(creditTransactions.createdAt, endDate),
+          ),
+        )
+        .groupBy(sql`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`)
+        .orderBy(sql`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`);
+
+      const tagLabels: Record<string, string> = {
+        "gdrive.index": "Initial indexing",
+        "library.upload_index": "Upload indexing",
+        "gdrive.reindex": "Re-indexing",
+        "library.save_reindex": "Save re-index",
+        "gdrive.mcp_read": "MCP file reads",
+        "gdrive.mcp_sheet": "MCP sheet reads",
+        "rag.semantic_search": "RAG semantic search",
+        "rag.chat_context": "RAG chat context",
+      };
+
+      return {
+        breakdown: rows.map((r: typeof rows[number]) => ({
+          operation: tagLabels[r.serviceTag] || r.serviceTag,
+          serviceTag: r.serviceTag,
+          count: Number(r.txCount),
+          totalCredits: Number(r.totalCredits ?? 0),
+          percentOfTotal: totalCredits > 0 ? Math.round((Number(r.totalCredits ?? 0) / totalCredits) * 100) : 0,
+        })),
+        dailyUsage: dailyRows.map((d: typeof dailyRows[number]) => ({
+          date: d.date,
+          credits: Number(d.credits ?? 0),
+        })),
+        totalCredits,
+        totalOperations,
+      };
+    }),
+
+  /**
+   * Recent credit activity for the dashboard.
+   */
+  getRecentActivity: protectedProcedure
+    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
+    .query(async ({ ctx, input }) => {
+      const rows = await db
+        .select()
+        .from(creditTransactions)
+        .where(eq(creditTransactions.userId, ctx.user.id))
+        .orderBy(desc(creditTransactions.createdAt))
+        .limit(input.limit);
+
+      return rows.map((r: typeof rows[number]) => ({
+        timestamp: r.createdAt.toISOString(),
+        description: r.description || "Credit transaction",
+        credits: r.amount,
+        serviceTag: (r.metadata as any)?.service || null,
+        metadata: r.metadata,
+      }));
+    }),
+
+  /**
+   * List Google Drive folders for folder picker (proxied via Python backend).
+   */
+  listDriveFolders: protectedProcedure
+    .input(z.object({ parentFolderId: z.string().nullable().default(null) }))
+    .query(async ({ ctx, input }) => {
+      const token = createDriveToken(ctx.user.id);
+      const params = new URLSearchParams();
+      if (input.parentFolderId) params.set("parent_id", input.parentFolderId);
+      params.set("user_id", String(ctx.user.id));
+
+      const resp = await fetch(
+        `${PYTHON_BACKEND_URL}/api/internal/gdrive/list-folders?${params}`,
+        {
+          headers: {
+            Authorization: `Bearer ${token}`,
+            "x-proxy-token": process.env.SMARTSPEC_PROXY_TOKEN || "",
+          },
+        },
+      );
+      if (!resp.ok) {
+        return [] as Array<{ id: string; name: string; hasChildren: boolean }>;
+      }
+      return resp.json() as Promise<Array<{ id: string; name: string; hasChildren: boolean }>>;
+    }),
+
+  /**
+   * Re-index a specific Google Drive file.
+   */
+  reindexFile: protectedProcedure
+    .input(z.object({ libraryItemId: z.number() }))
+    .mutation(async ({ ctx, input }) => {
+      if (!ctx.tenantId)
+        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
+
+      const [item] = await db
+        .select()
+        .from(libraryItems)
+        .where(
+          and(
+            eq(libraryItems.id, input.libraryItemId),
+            eq(libraryItems.tenantId, ctx.tenantId),
+            eq(libraryItems.ownerUserId, ctx.user.id),
+            eq(libraryItems.source, "google_drive"),
+          ),
+        )
+        .limit(1);
+      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
+
+      await db
+        .update(libraryItems)
+        .set({ status: "pending" as any, updatedAt: new Date() })
+        .where(eq(libraryItems.id, input.libraryItemId));
+
+      // Trigger re-index via Python backend
+      const proxyToken = process.env.SMARTSPEC_PROXY_TOKEN || "";
+      await fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/start-sync`, {
+        method: "POST",
+        headers: {
+          "Content-Type": "application/json",
+          "x-proxy-token": proxyToken,
+        },
+        body: JSON.stringify({ user_id: ctx.user.id, tenant_id: ctx.tenantId }),
+      }).catch(() => {});
+
+      return { success: true };
+    }),
+
+  /**
+   * Remove a Google Drive file from the index.
+   */
+  removeFromIndex: protectedProcedure
+    .input(z.object({ libraryItemId: z.number() }))
+    .mutation(async ({ ctx, input }) => {
+      if (!ctx.tenantId)
+        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
+
+      const [item] = await db
+        .select()
+        .from(libraryItems)
+        .where(
+          and(
+            eq(libraryItems.id, input.libraryItemId),
+            eq(libraryItems.tenantId, ctx.tenantId),
+            eq(libraryItems.ownerUserId, ctx.user.id),
+            eq(libraryItems.source, "google_drive"),
+          ),
+        )
+        .limit(1);
+      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
+
+      // Soft delete
+      await db
+        .update(libraryItems)
+        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, updatedAt: new Date() })
+        .where(eq(libraryItems.id, input.libraryItemId));
+
+      return { success: true };
+    }),
 });
