/**
 * OneDrive dashboard panel for the Settings > Integrations tab.
 *
 * When not connected: shows connect button with OAuth popup flow.
 * When connected: shows a 4-tab dashboard (Overview, Files, Credit Usage, Pricing).
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  HardDrive,
  Files,
  CreditCard,
  DollarSign,
  RefreshCw,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ExternalLink,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { OneDriveFolderPicker } from "./OneDriveFolderPicker";
import { DisconnectOneDriveDialog } from "./DisconnectOneDriveDialog";

// -- Helpers --

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatCredits(n: number): string {
  return n.toLocaleString();
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// -- OneDrive SVG Icon --

function OneDriveIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="#0078d4"
    >
      <path
        d="M10.5 18H6a4 4 0 0 1-.88-7.9A5.5 5.5 0 0 1 16 9h.5A3.5 3.5 0 0 1 20 12.5V13a3 3 0 0 1-3 3h-6.5z"
        fill="currentColor"
      />
    </svg>
  );
}

// -- Overview Panel --

function OverviewPanel({
  connectionStatus,
  onDisconnect,
  onSetTab,
  onManageFolders,
}: {
  connectionStatus: {
    email: string | null;
    scopes: string[];
    connectedAt: string | null;
  };
  onDisconnect: () => void;
  onSetTab: (tab: string) => void;
  onManageFolders: () => void;
}) {
  const overviewQuery = trpc.oneDrive.getDashboardOverview.useQuery();
  const budgetQuery = trpc.credits.getBudget.useQuery();
  const activityQuery = trpc.oneDrive.getRecentActivity.useQuery({
    limit: 5,
  });
  const syncMutation = trpc.oneDrive.startSync.useMutation({
    onSuccess: () => {
      toast.success("Sync started");
      overviewQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const overview = overviewQuery.data;
  const budget = budgetQuery.data;

  const budgetPct =
    budget && budget.monthlyLimit > 0
      ? Math.min(
          100,
          Math.round(
            (budget.creditsUsedThisMonth / budget.monthlyLimit) * 100,
          ),
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Connection Card */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-700">
              Connected
            </span>
          </div>
          {connectionStatus.email && (
            <p className="text-sm text-gray-700 mb-1">
              {connectionStatus.email}
            </p>
          )}
          {connectionStatus.scopes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {connectionStatus.scopes.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">
                  {s.split("/").pop()}
                </Badge>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        </div>

        {/* Sync Status Card */}
        <div className="rounded-lg border p-4">
          <div className="text-xs text-gray-500 mb-1">Sync Status</div>
          <div className="flex items-center gap-2 mb-2">
            {overview?.syncStatus === "syncing" ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            ) : overview?.syncStatus === "error" ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            )}
            <span className="text-sm font-medium capitalize">
              {overview?.syncStatus ?? "idle"}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Last sync: {relativeTime(overview?.lastSyncAt ?? null)}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={
              syncMutation.isPending || overview?.syncStatus === "syncing"
            }
          >
            <RefreshCw
              className={`w-3 h-3 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
            Sync Now
          </Button>
        </div>

        {/* Monthly Credits Card */}
        <div className="rounded-lg border p-4">
          <div className="text-xs text-gray-500 mb-1">Monthly Credits</div>
          {budget && budget.monthlyLimit > 0 ? (
            <>
              <p className="text-sm font-medium mb-1">
                {formatCredits(budget.creditsUsedThisMonth)} /{" "}
                {formatCredits(budget.monthlyLimit)}
              </p>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full ${budgetPct >= 100 ? "bg-red-500" : budgetPct >= 80 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">
                ${(budget.creditsUsedThisMonth * 0.001).toFixed(2)} / $
                {(budget.monthlyLimit * 0.001).toFixed(2)}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">No budget set</p>
          )}
          <button
            onClick={() => onSetTab("credit-usage")}
            className="text-xs text-[#0078d4] hover:underline mt-1"
          >
            View Details
          </button>
        </div>

        {/* Indexed Files Card */}
        <div className="rounded-lg border p-4">
          <div className="text-xs text-gray-500 mb-1">Indexed Files</div>
          <p className="text-lg font-semibold">
            {formatCredits(overview?.indexedFileCount ?? 0)} files
          </p>
          <p className="text-sm text-gray-500">
            {formatCredits(overview?.totalChunks ?? 0)} chunks
          </p>
          <button
            onClick={() => onSetTab("files")}
            className="text-xs text-[#0078d4] hover:underline mt-1"
          >
            Browse Files
          </button>
        </div>

        {/* Indexing Mode Card */}
        <div className="rounded-lg border p-4">
          <div className="text-xs text-gray-500 mb-1">Indexing Mode</div>
          <p className="text-sm font-medium capitalize">
            {(overview?.indexingMode ?? "none").replace("_", " ")}
          </p>
          {overview && overview.folderCount > 0 && (
            <p className="text-xs text-gray-500">
              {overview.folderCount} folders configured
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={onManageFolders}
          >
            <FolderOpen className="w-3 h-3 mr-1" /> Manage
          </Button>
        </div>

        {/* Auto-Sync Card */}
        <div className="rounded-lg border p-4">
          <div className="text-xs text-gray-500 mb-1">Auto-Sync</div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${overview?.autoSyncEnabled ? "bg-green-500" : "bg-gray-400"}`}
            />
            <span className="text-sm font-medium">
              {overview?.autoSyncEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          {overview?.subscriptionExpiry && (
            <p className="text-xs text-gray-500 mt-1">
              Webhook expires: {relativeTime(overview.subscriptionExpiry)}
            </p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Recent Activity
        </h3>
        {activityQuery.data && activityQuery.data.length > 0 ? (
          <div className="space-y-1">
            {activityQuery.data.map(
              (
                a: {
                  timestamp: string;
                  description: string;
                  credits: number;
                },
                i: number,
              ) => (
                <div
                  key={i}
                  className={`flex items-center justify-between py-2 px-3 rounded text-sm ${i % 2 === 0 ? "bg-gray-50" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500">
                      {relativeTime(a.timestamp)}
                    </span>
                    <span className="text-gray-700">{a.description}</span>
                  </div>
                  <span
                    className={`text-xs font-medium ${a.credits < 0 ? "text-red-600" : "text-green-600"}`}
                  >
                    {a.credits < 0 ? "" : "+"}
                    {a.credits} cr
                  </span>
                </div>
              ),
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No recent activity</p>
        )}
      </div>
    </div>
  );
}

// -- Files Panel --

function FilesPanel() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, statusFilter]);

  const filesQuery = trpc.oneDrive.getIndexedFiles.useQuery({
    search: debouncedSearch || undefined,
    fileType: typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    pageSize,
  });

  const reindexMutation = trpc.oneDrive.reindexFile.useMutation({
    onSuccess: () => {
      toast.success("Re-index queued");
      filesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.oneDrive.removeFromIndex.useMutation({
    onSuccess: () => {
      toast.success("File removed from index");
      filesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = Math.ceil((filesQuery.data?.total ?? 0) / pageSize);

  const statusIcon = (status: string) => {
    switch (status) {
      case "ready":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "pending":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="all">All Types</option>
          <option value="document">Document</option>
          <option value="spreadsheet">Spreadsheet</option>
          <option value="presentation">Presentation</option>
          <option value="pdf">PDF</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="all">All Status</option>
          <option value="ready">Synced</option>
          <option value="pending">Pending</option>
          <option value="error">Error</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 pl-2 font-medium text-gray-500">
                File Name
              </th>
              <th className="pb-2 font-medium text-gray-500">Type</th>
              <th className="pb-2 font-medium text-gray-500 text-right">
                Chunks
              </th>
              <th className="pb-2 font-medium text-gray-500">Last Sync</th>
              <th className="pb-2 font-medium text-gray-500 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filesQuery.data?.files.map(
              (f: {
                id: number;
                name: string;
                mimeType: string;
                chunkCount: number;
                syncStatus: string;
                driveItemId: string | null;
                lastSyncedAt: string | null;
              }) => (
                <tr key={f.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pl-2">
                    <div className="flex items-center gap-2">
                      {statusIcon(f.syncStatus)}
                      <span className="text-gray-900">{f.name}</span>
                      {f.driveItemId && (
                        <a
                          href={`https://onedrive.live.com/?id=${f.driveItemId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-2">
                    <Badge variant="secondary" className="text-xs">
                      {f.mimeType.split(".").pop() || f.mimeType}
                    </Badge>
                  </td>
                  <td className="py-2 text-right text-gray-600">
                    {f.chunkCount}
                  </td>
                  <td className="py-2 text-gray-500 text-xs">
                    {relativeTime(f.lastSyncedAt)}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          reindexMutation.mutate({ libraryItemId: f.id })
                        }
                        disabled={reindexMutation.isPending}
                        title="Re-index"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => {
                          if (
                            confirm(
                              "Remove this file from the index? The file remains in your OneDrive.",
                            )
                          ) {
                            removeMutation.mutate({ libraryItemId: f.id });
                          }
                        }}
                        disabled={removeMutation.isPending}
                        title="Remove from index"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {filesQuery.data?.files.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-gray-500"
                >
                  No indexed files found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {filesQuery.data?.total ?? 0} files total
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span className="text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Credit Usage Panel --

function CreditUsagePanel() {
  const monthKey = getCurrentMonthKey();
  const breakdownQuery = trpc.oneDrive.getCreditUsageBreakdown.useQuery({
    monthKey,
  });
  const budgetQuery = trpc.credits.getBudget.useQuery();

  const budget = budgetQuery.data;
  const breakdown = breakdownQuery.data;

  const budgetPct =
    budget && budget.monthlyLimit > 0
      ? Math.min(
          100,
          Math.round(
            (budget.creditsUsedThisMonth / budget.monthlyLimit) * 100,
          ),
        )
      : 0;

  const maxDaily = useMemo(() => {
    if (!breakdown?.dailyUsage?.length) return 1;
    return Math.max(
      ...breakdown.dailyUsage.map((d: { credits: number }) => d.credits),
      1,
    );
  }, [breakdown?.dailyUsage]);

  return (
    <div className="space-y-6">
      {/* Budget Meter */}
      {budget && budget.monthlyLimit > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3">Monthly Budget</h3>
          <div className="flex justify-between text-sm mb-1">
            <span>
              {formatCredits(budget.creditsUsedThisMonth)} /{" "}
              {formatCredits(budget.monthlyLimit)} credits
            </span>
            <span className="font-medium">{budgetPct}%</span>
          </div>
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${budgetPct >= 100 ? "bg-red-500" : budgetPct >= 80 ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            ${(budget.creditsUsedThisMonth * 0.001).toFixed(2)} spent - $
            {((budget.monthlyLimit - budget.creditsUsedThisMonth) * 0.001).toFixed(2)}{" "}
            remaining
          </p>
        </div>
      )}

      {/* Breakdown Table */}
      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-3">
          Breakdown by Operation
        </h3>
        {breakdown?.breakdown.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-medium text-gray-500">
                  Operation
                </th>
                <th className="pb-2 text-right font-medium text-gray-500">
                  Count
                </th>
                <th className="pb-2 text-right font-medium text-gray-500">
                  Credits
                </th>
                <th className="pb-2 text-right font-medium text-gray-500 w-24">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody>
              {breakdown.breakdown.map(
                (row: {
                  serviceTag: string;
                  operation: string;
                  count: number;
                  totalCredits: number;
                  percentOfTotal: number;
                }) => (
                  <tr
                    key={row.serviceTag}
                    className="border-b last:border-0"
                  >
                    <td className="py-2 text-gray-700">{row.operation}</td>
                    <td className="py-2 text-right text-gray-600">
                      {row.count}
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {formatCredits(row.totalCredits)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#0078d4] rounded-full"
                            style={{ width: `${row.percentOfTotal}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">
                          {row.percentOfTotal}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">
            No usage data for this month
          </p>
        )}
        {breakdown && (
          <div className="mt-3 pt-3 border-t flex justify-between text-sm">
            <span className="text-gray-500">
              Total: {breakdown.totalOperations} operations
            </span>
            <span className="font-medium">
              {formatCredits(breakdown.totalCredits)} credits ($
              {(breakdown.totalCredits * 0.001).toFixed(2)})
            </span>
          </div>
        )}
      </div>

      {/* Daily Usage Chart (CSS bars) */}
      {breakdown?.dailyUsage && breakdown.dailyUsage.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3">
            Daily Usage (This Month)
          </h3>
          <div className="flex items-end gap-px h-24">
            {breakdown.dailyUsage.map(
              (d: { date: string; credits: number }) => (
                <div
                  key={d.date}
                  className="flex-1 bg-[#0078d4]/70 hover:bg-[#0078d4] rounded-t-sm transition-colors cursor-pointer group relative"
                  style={{
                    height: `${Math.max(2, (d.credits / maxDaily) * 100)}%`,
                  }}
                  title={`${d.date}: ${d.credits} credits`}
                />
              ),
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{breakdown.dailyUsage[0]?.date.slice(5)}</span>
            <span>
              {breakdown.dailyUsage[
                breakdown.dailyUsage.length - 1
              ]?.date.slice(5)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Pricing Info Panel --

function PricingInfoPanel() {
  const pricingCategories = [
    {
      title: "A. Document Management",
      rows: [
        {
          op: "Upload file + indexing",
          cost: "2-200 cr",
          how: "Per chunk (2 credits/chunk)",
        },
        {
          op: "Save markdown + re-index",
          cost: "2-200 cr",
          how: "Same as upload",
        },
        { op: "Upload (no index)", cost: "Free", how: "Metadata only" },
        { op: "Download / preview", cost: "Free", how: "S3 GET" },
        { op: "Keyword search", cost: "Free", how: "Database query" },
      ],
    },
    {
      title: "B. AI Search & RAG",
      rows: [
        {
          op: "RAG semantic search",
          cost: "1 cr",
          how: "Vector embedding query",
        },
        {
          op: "RAG context in chat",
          cost: "1 cr",
          how: "Plus separate LLM cost",
        },
        { op: "Keyword/BM25 search", cost: "Free", how: "No AI" },
      ],
    },
    {
      title: "C. OneDrive",
      rows: [
        {
          op: "Index OneDrive file",
          cost: "2-200 cr",
          how: "Same as upload indexing",
        },
        {
          op: "Re-index (unchanged)",
          cost: "Free",
          how: "Hash check skips",
        },
        {
          op: "AI read file (MCP)",
          cost: "1-5 cr",
          how: "Per 2,000 chars",
        },
        {
          op: "AI read sheet (MCP)",
          cost: "1-3 cr",
          how: "Per 500 cells",
        },
        {
          op: "Search OneDrive files",
          cost: "Free",
          how: "Microsoft Graph API",
        },
        { op: "Browse folders", cost: "Free", how: "Metadata only" },
      ],
    },
    {
      title: "D. AI Chat & LLM",
      rows: [
        {
          op: "Chat (GPT-4o, Claude, etc.)",
          cost: "Variable",
          how: "Token-based pricing",
        },
        { op: "Translation", cost: "Variable", how: "Token-based" },
        { op: "Skill execution", cost: "Variable", how: "Token-based" },
      ],
    },
    {
      title: "E. Media Generation",
      rows: [
        {
          op: "Image generation",
          cost: "Variable",
          how: "Model x resolution x count",
        },
        {
          op: "Video generation",
          cost: "Variable",
          how: "Model x duration x resolution",
        },
        { op: "Audio/TTS", cost: "Variable", how: "Model x duration" },
      ],
    },
    {
      title: "F. Always Free",
      rows: [
        {
          op: "Login / Settings / Profile / Admin",
          cost: "Free",
          how: "",
        },
        { op: "Dashboard / Analytics", cost: "Free", how: "" },
        {
          op: "View credit usage / Export CSV",
          cost: "Free",
          how: "",
        },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 bg-blue-50">
        <h3 className="text-sm font-semibold text-blue-900">
          SmartAIHub - Pricing & Cost Guide
        </h3>
        <p className="text-xs text-blue-700 mt-1">
          1 credit = $0.001 USD | 1,000 credits = $1.00
        </p>
      </div>

      {pricingCategories.map((cat) => (
        <div key={cat.title} className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold mb-3">{cat.title}</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-medium text-gray-500">
                  Operation
                </th>
                <th className="pb-2 text-right font-medium text-gray-500">
                  Cost
                </th>
                <th className="pb-2 text-left font-medium text-gray-500 pl-4 hidden sm:table-cell">
                  How it works
                </th>
              </tr>
            </thead>
            <tbody>
              {cat.rows.map((row) => (
                <tr key={row.op} className="border-b last:border-0">
                  <td className="py-1.5 text-gray-700">{row.op}</td>
                  <td className="py-1.5 text-right">
                    {row.cost === "Free" ? (
                      <Badge
                        variant="secondary"
                        className="text-green-700 bg-green-100"
                      >
                        Free
                      </Badge>
                    ) : (
                      <span className="text-gray-600">{row.cost}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-gray-500 pl-4 hidden sm:table-cell text-xs">
                    {row.how}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Cost Examples */}
      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-semibold mb-3">Cost Examples</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium mb-2">Upload 5 files</p>
            <div className="text-xs text-gray-600 space-y-0.5">
              <p>5 files x ~10 chunks avg = 50 chunks</p>
              <p>50 chunks x 2 cr = 100 credits</p>
              <p className="font-medium text-gray-900 pt-1">
                Total: 100 cr ($0.10)
              </p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium mb-2">
              Sync OneDrive folder (50 files)
            </p>
            <div className="text-xs text-gray-600 space-y-0.5">
              <p>50 files x ~15 chunks avg = 750 chunks</p>
              <p>750 chunks x 2 cr = 1,500 credits</p>
              <p className="font-medium text-gray-900 pt-1">
                Total: 1,500 cr ($1.50)
              </p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium mb-2">Daily usage estimate</p>
            <div className="text-xs text-gray-600 space-y-0.5">
              <p>5 RAG searches = 5 cr</p>
              <p>2 MCP reads = 4 cr</p>
              <p className="font-medium text-gray-900 pt-1">
                ~9 cr/day ($0.27/month)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Main OneDrivePanel --

export function OneDrivePanel() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const statusQuery = trpc.oneDrive.getConnectionStatus.useQuery(undefined, {
    retry: false,
  });
  const authUrlQuery = trpc.oneDrive.getAuthUrl.useQuery(undefined, {
    enabled: false,
  });
  const syncStatusQuery = trpc.oneDrive.getSyncStatus.useQuery(undefined, {
    enabled: statusQuery.data?.status === "connected",
  });
  const updateSettingsMutation = trpc.oneDrive.updateSyncSettings.useMutation({
    onSuccess: () => {
      toast.success("Folder settings updated");
      syncStatusQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const data = await authUrlQuery.refetch();
      const url = data.data?.authorization_url;
      if (!url) {
        toast.error("Could not get authorization URL");
        setIsConnecting(false);
        return;
      }

      const popup = window.open(url, "_blank", "width=600,height=700");

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (popup && popup.closed) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setIsConnecting(false);
          statusQuery.refetch();
        }
      }, 500);
    } catch (err: any) {
      toast.error(`Connection failed: ${err.message}`);
      setIsConnecting(false);
    }
  }, [authUrlQuery, statusQuery]);

  const status = statusQuery.data?.status ?? "not_connected";
  const email = statusQuery.data?.email ?? null;
  const scopes = statusQuery.data?.scopes ?? [];
  const connectedAt = statusQuery.data?.connectedAt ?? null;

  const handleFolderConfirm = (
    folders: Array<{ id: string; name: string }>,
  ) => {
    const mode = syncStatusQuery.data?.indexingMode || "selected_folders";
    updateSettingsMutation.mutate({
      indexingMode:
        mode === "none" || mode === "all"
          ? "selected_folders"
          : (mode as any),
      folderSelections: folders.map((f) => ({
        folderId: f.id,
        folderName: f.name,
      })),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <OneDriveIcon />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            OneDrive
          </h3>
          <p className="text-sm text-gray-500">
            Sync and AI-search your OneDrive files
          </p>
        </div>
      </div>

      {/* Not Connected */}
      {status === "not_connected" && (
        <div className="rounded-lg border p-6">
          <p className="text-sm text-gray-600 mb-4">
            Connect your Microsoft account to enable syncing and AI-powered
            search across your OneDrive files.
          </p>
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-[#0078d4] hover:bg-[#106ebe]"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                Connecting...
              </>
            ) : (
              "Connect OneDrive"
            )}
          </Button>
        </div>
      )}

      {/* Expired */}
      {status === "expired" && (
        <div className="rounded-lg border p-6">
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 mb-4">
            <p className="text-sm text-yellow-800">
              Your OneDrive connection has expired. Reconnect to continue
              using OneDrive features.
            </p>
          </div>
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {isConnecting ? "Reconnecting..." : "Reconnect"}
          </Button>
        </div>
      )}

      {/* Connected: Full Dashboard */}
      {status === "connected" && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger
              value="overview"
              className="flex items-center gap-1.5"
            >
              <HardDrive className="w-3.5 h-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="flex items-center gap-1.5"
            >
              <Files className="w-3.5 h-3.5" /> Files
            </TabsTrigger>
            <TabsTrigger
              value="credit-usage"
              className="flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" /> Credit Usage
            </TabsTrigger>
            <TabsTrigger
              value="pricing"
              className="flex items-center gap-1.5"
            >
              <DollarSign className="w-3.5 h-3.5" /> Pricing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewPanel
              connectionStatus={{ email, scopes, connectedAt }}
              onDisconnect={() => setDisconnectDialogOpen(true)}
              onSetTab={setActiveTab}
              onManageFolders={() => setFolderPickerOpen(true)}
            />
          </TabsContent>

          <TabsContent value="files">
            <FilesPanel />
          </TabsContent>

          <TabsContent value="credit-usage">
            <CreditUsagePanel />
          </TabsContent>

          <TabsContent value="pricing">
            <PricingInfoPanel />
          </TabsContent>
        </Tabs>
      )}

      {/* Folder Picker Dialog */}
      <OneDriveFolderPicker
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        indexingMode={
          (syncStatusQuery.data?.indexingMode as
            | "selected_folders"
            | "all_except") ?? "selected_folders"
        }
        initialSelectedFolders={
          (
            (syncStatusQuery.data?.folderSelections as string[]) ?? []
          ).map((id) => ({ id, name: `${id} (Folder ID)` }))
        }
        onConfirm={handleFolderConfirm}
      />

      {/* Disconnect Confirmation Dialog */}
      <DisconnectOneDriveDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
        onDisconnected={() => {
          setDisconnectDialogOpen(false);
          toast.success("OneDrive disconnected. Cleanup is in progress.");
          statusQuery.refetch();
        }}
      />
    </div>
  );
}
