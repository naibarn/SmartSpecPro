import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  User,
  XCircle,
} from "lucide-react";
import { formatCurrency, formatLatency } from "@/lib/formatters";

type AuditSource = "llm" | "media";

interface AuditRow {
  id: string;
  source: AuditSource;
  timestamp: string | null;
  traceId: string | null;
  userId: number | null;
  provider: string | null;
  model: string | null;
  eventType: string | null;
  requestType: string | null;
  statusCode: number | null;
  errorType: string | null;
  errorMessage: string | null;
  creditsCharged: number | null;
  costUsd: number | null;
  responseTimeMs: number | null;
  endpoint: string | null;
  mediaTaskId: string | null;
  raw: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateStartIso(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function toDateEndIso(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999Z`).toISOString();
}

function toDisplayTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function csvEscape(value: unknown): string {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, "\"\"")}"`;
}

function JsonSection({
  title,
  payload,
  defaultOpen = false,
}: {
  title: string;
  payload: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (payload == null) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-md hover:bg-muted/50 transition-colors">
          {open
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="text-sm font-medium">{title}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="text-xs bg-muted/40 border rounded-md p-3 mx-3 mb-3 overflow-x-auto max-h-[280px] overflow-y-auto whitespace-pre-wrap break-words">
          {typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function AdminAuditLogs() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [traceId, setTraceId] = useState("");
  const [userIdText, setUserIdText] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [eventType, setEventType] = useState("all");
  const [requestType, setRequestType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [errorOnly, setErrorOnly] = useState(false);
  const [fetchLimit, setFetchLimit] = useState("200");

  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const queryInput = useMemo(() => {
    const maybeUserId = Number(userIdText);
    const maybeLimit = Number(fetchLimit);

    return {
      ...(toDateStartIso(dateFrom) ? { dateStart: toDateStartIso(dateFrom) } : {}),
      ...(toDateEndIso(dateTo) ? { dateEnd: toDateEndIso(dateTo) } : {}),
      ...(traceId.trim() ? { traceId: traceId.trim() } : {}),
      ...(Number.isFinite(maybeUserId) && maybeUserId > 0 ? { userId: maybeUserId } : {}),
      ...(provider.trim() ? { provider: provider.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
      ...(eventType !== "all" ? { eventType } : {}),
      ...(requestType !== "all" ? { requestType } : {}),
      ...(errorOnly ? { errorOnly: true } : {}),
      limit: Number.isFinite(maybeLimit) && maybeLimit > 0 ? Math.min(maybeLimit, 500) : 200,
      offset: 0,
    };
  }, [dateFrom, dateTo, traceId, userIdText, provider, model, eventType, requestType, errorOnly, fetchLimit]);

  const searchQuery = trpc.audit.search.useQuery(queryInput, {
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const normalizedRows = useMemo<AuditRow[]>(() => {
    const usageRows = (searchQuery.data?.usageLogs ?? []).map((row: any): AuditRow => ({
      id: `llm-${row.id}`,
      source: "llm",
      timestamp: row.createdAt ? String(row.createdAt) : null,
      traceId: textOrNull(row.traceId),
      userId: numberOrNull(row.userId),
      provider: textOrNull(row.providerName) ?? (row.providerId != null ? String(row.providerId) : null),
      model: textOrNull(row.modelUsed),
      eventType: "llm",
      requestType: textOrNull(row.requestType),
      statusCode: numberOrNull(row.statusCode),
      errorType: textOrNull(row.errorType),
      errorMessage: textOrNull(row.errorMessage),
      creditsCharged: numberOrNull(row.creditsCharged),
      costUsd: numberOrNull(row.costUsd),
      responseTimeMs: numberOrNull(row.responseTimeMs),
      endpoint: null,
      mediaTaskId: null,
      raw: row,
    }));

    const eventRows = (searchQuery.data?.auditEvents ?? []).map((row: any): AuditRow => ({
      id: `media-${row.id}`,
      source: "media",
      timestamp: row.createdAt ? String(row.createdAt) : null,
      traceId: textOrNull(row.traceId),
      userId: numberOrNull(row.userId),
      provider: textOrNull(row.provider),
      model: textOrNull(row.model),
      eventType: textOrNull(row.eventType),
      requestType: textOrNull(row.mediaType) ?? textOrNull(row.eventType),
      statusCode: numberOrNull(row.statusCode),
      errorType: textOrNull(row.errorMessage) ? "provider_error" : null,
      errorMessage: textOrNull(row.errorMessage),
      creditsCharged: numberOrNull(row.creditsCharged),
      costUsd: numberOrNull(row.costUsd),
      responseTimeMs: numberOrNull(row.responseTimeMs),
      endpoint: textOrNull(row.endpoint),
      mediaTaskId: textOrNull(row.mediaTaskId),
      raw: row,
    }));

    return [...usageRows, ...eventRows].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
  }, [searchQuery.data]);

  useEffect(() => {
    setPage(0);
  }, [queryInput]);

  const totalPages = Math.max(1, Math.ceil(normalizedRows.length / pageSize));
  const visibleRows = normalizedRows.slice(page * pageSize, (page + 1) * pageSize);

  const selectedDate = selectedRow?.timestamp
    ? new Date(selectedRow.timestamp).toISOString().slice(0, 10)
    : undefined;

  const payloadQuery = trpc.audit.getPayload.useQuery(
    {
      traceId: selectedRow?.traceId ?? "",
      ...(selectedDate ? { date: selectedDate } : {}),
    },
    {
      enabled: detailOpen && Boolean(selectedRow?.traceId),
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  );

  const entries = payloadQuery.data?.entries ?? [];
  const errorCount = normalizedRows.filter((row) => row.errorMessage || (row.statusCode != null && row.statusCode >= 400)).length;
  const uniqueUsers = new Set(normalizedRows.map((row) => row.userId).filter((id): id is number => id != null)).size;
  const uniqueTraces = new Set(normalizedRows.map((row) => row.traceId).filter((id): id is string => Boolean(id))).size;

  const exportCsv = () => {
    const headers = [
      "timestamp",
      "source",
      "trace_id",
      "user_id",
      "event_type",
      "request_type",
      "provider",
      "model",
      "status_code",
      "error_type",
      "error_message",
      "credits_charged",
      "cost_usd",
      "latency_ms",
      "endpoint",
      "media_task_id",
    ];
    const lines = [
      headers.join(","),
      ...normalizedRows.map((row) => [
        csvEscape(row.timestamp),
        csvEscape(row.source),
        csvEscape(row.traceId),
        csvEscape(row.userId),
        csvEscape(row.eventType),
        csvEscape(row.requestType),
        csvEscape(row.provider),
        csvEscape(row.model),
        csvEscape(row.statusCode),
        csvEscape(row.errorType),
        csvEscape(row.errorMessage),
        csvEscape(row.creditsCharged),
        csvEscape(row.costUsd),
        csvEscape(row.responseTimeMs),
        csvEscape(row.endpoint),
        csvEscape(row.mediaTaskId),
      ].join(",")),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDetail = (row: AuditRow) => {
    setSelectedRow(row);
    setDetailOpen(true);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">You need admin privileges to access audit logs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Admin
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Audit Logs Explorer</h1>
            <p className="text-sm text-muted-foreground">
              ตรวจสอบ provider/model/prompt/status/request-response ตาม trace ได้แบบครบถ้วน
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => searchQuery.refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={normalizedRows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Rows</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{normalizedRows.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-red-600">{errorCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unique Traces</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{uniqueTraces}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{uniqueUsers}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          <CardDescription>กรองข้อมูลเพื่อระบุปัญหาเป็นราย trace หรือราย provider/model</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="traceId">Trace ID</Label>
              <Input
                id="traceId"
                placeholder="เช่น task:slide:1:video"
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userId">User ID</Label>
              <Input
                id="userId"
                placeholder="เช่น 123"
                value={userIdText}
                onChange={(e) => setUserIdText(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Input
                id="provider"
                placeholder="เช่น kie.ai"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder="เช่น veo3_fast"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Event Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="llm_request">llm_request</SelectItem>
                  <SelectItem value="llm_response">llm_response</SelectItem>
                  <SelectItem value="media_request">media_request</SelectItem>
                  <SelectItem value="media_response">media_response</SelectItem>
                  <SelectItem value="skill_execute">skill_execute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Request Type</Label>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="chat">chat</SelectItem>
                  <SelectItem value="generateVideoAsync">generateVideoAsync</SelectItem>
                  <SelectItem value="generateImageAsync">generateImageAsync</SelectItem>
                  <SelectItem value="getTask">getTask</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFrom">From Date</Label>
              <Input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">To Date</Label>
              <Input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fetch Limit</Label>
              <Select value={fetchLimit} onValueChange={setFetchLimit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="300">300</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={errorOnly} onCheckedChange={setErrorOnly} id="errorOnly" />
            <Label htmlFor="errorOnly">Error only</Label>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              Query via `trpc.audit.search`
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            {normalizedRows.length > 0
              ? `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, normalizedRows.length)} of ${normalizedRows.length}`
              : "No records found"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {searchQuery.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Provider / Model</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Trace</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                          No matching audit records.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs whitespace-nowrap">{toDisplayTime(row.timestamp)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={row.source === "llm" ? "text-blue-700" : "text-purple-700"}>
                              {row.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-0.5">
                              <div className="font-medium">{row.eventType || "-"}</div>
                              <div className="text-muted-foreground">{row.requestType || "-"}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-0.5 max-w-[220px]">
                              <div className="truncate">{row.provider || "-"}</div>
                              <div className="font-mono text-muted-foreground truncate">{row.model || "-"}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {row.userId ?? "-"}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono max-w-[220px] truncate">{row.traceId || "-"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-xs">
                              {row.errorMessage || (row.statusCode != null && row.statusCode >= 400)
                                ? <XCircle className="h-4 w-4 text-red-500" />
                                : <CheckCircle className="h-4 w-4 text-green-500" />}
                              <span>{row.statusCode ?? "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-red-600 max-w-[220px] truncate" title={row.errorMessage ?? ""}>
                            {row.errorMessage || "-"}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <div>{row.costUsd != null ? formatCurrency(row.costUsd) : "-"}</div>
                            <div className="text-muted-foreground">{row.creditsCharged ?? 0} cr</div>
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <div className="flex items-center justify-end gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {row.responseTimeMs != null ? formatLatency(row.responseTimeMs) : "-"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDetail(row)}
                              disabled={!row.traceId}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Page {page + 1} / {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Trace Detail
              {selectedRow?.traceId && (
                <Badge variant="outline" className="font-mono text-xs">{selectedRow.traceId}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {!selectedRow ? (
            <div className="text-sm text-muted-foreground">No row selected.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-3">
                  <div className="text-[10px] text-muted-foreground uppercase">Provider</div>
                  <div className="text-sm font-medium">{selectedRow.provider || "-"}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-[10px] text-muted-foreground uppercase">Model</div>
                  <div className="text-sm font-mono">{selectedRow.model || "-"}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-[10px] text-muted-foreground uppercase">Request</div>
                  <div className="text-sm">{selectedRow.requestType || selectedRow.eventType || "-"}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-[10px] text-muted-foreground uppercase">Status</div>
                  <div className="text-sm">{selectedRow.statusCode ?? "-"}</div>
                </Card>
              </div>

              {selectedRow.errorMessage && (
                <div className="border border-red-200 bg-red-50 rounded-md px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    {selectedRow.errorType ? `[${selectedRow.errorType}] ` : ""}
                    {selectedRow.errorMessage}
                  </div>
                </div>
              )}

              <JsonSection title="DB Row Snapshot" payload={selectedRow.raw} defaultOpen />

              <div className="border rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b bg-muted/30 text-sm font-medium">
                  Request / Response Payloads from JSONL ({entries.length})
                </div>
                {payloadQuery.isLoading ? (
                  <div className="py-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No payload entries found for this trace.
                  </div>
                ) : (
                  <div className="divide-y">
                    {entries.map((entry: any, idx: number) => {
                      const requestPayload = asRecord(entry.requestPayload);
                      const responsePayload = asRecord(entry.responsePayload);
                      const metadata = asRecord(entry.metadata);
                      const requestInner = asRecord(requestPayload?.payload);
                      const stage = textOrNull(metadata?.stage) ?? textOrNull(requestPayload?.stage) ?? textOrNull(responsePayload?.stage);
                      const source = textOrNull(metadata?.source) ?? textOrNull(requestPayload?.source);
                      const endpoint = textOrNull(entry.endpoint) ?? textOrNull(requestPayload?.endpoint);
                      const prompt = textOrNull(requestPayload?.prompt)
                        ?? textOrNull(requestPayload?.userPrompt)
                        ?? textOrNull(requestInner?.prompt);

                      return (
                        <div key={`${entry.timestamp ?? idx}-${idx}`} className="py-2">
                          <div className="px-3 flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="secondary" className="font-mono">{entry.eventType}</Badge>
                            <span className="text-muted-foreground">{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "-"}</span>
                            {entry.requestType && <Badge variant="outline" className="font-mono">{entry.requestType}</Badge>}
                            {entry.model && <span className="font-mono text-blue-600">{entry.model}</span>}
                            {entry.providerName && <span className="text-muted-foreground">{entry.providerName}</span>}
                            {entry.statusCode != null && (
                              <Badge
                                variant="outline"
                                className={entry.statusCode >= 400
                                  ? "border-red-300 text-red-700"
                                  : "border-emerald-300 text-emerald-700"}
                              >
                                HTTP {entry.statusCode}
                              </Badge>
                            )}
                            {entry.timing?.totalMs != null && (
                              <span className="text-muted-foreground">{formatLatency(entry.timing.totalMs)}</span>
                            )}
                          </div>

                          <div className="px-3 pt-1 flex flex-wrap gap-1.5">
                            {stage && <Badge variant="outline" className="text-[10px] font-mono">stage: {stage}</Badge>}
                            {source && <Badge variant="outline" className="text-[10px] font-mono">source: {source}</Badge>}
                            {endpoint && <Badge variant="outline" className="text-[10px] font-mono">endpoint: {endpoint}</Badge>}
                            {entry.mediaTaskId && <Badge variant="outline" className="text-[10px] font-mono">task: {entry.mediaTaskId}</Badge>}
                          </div>

                          {prompt && (
                            <div className="mx-3 mt-2 text-xs text-muted-foreground border rounded-md bg-muted/30 px-2.5 py-1.5">
                              <span className="font-medium text-foreground">Prompt:</span> {prompt}
                            </div>
                          )}

                          <JsonSection title="Request Payload" payload={entry.requestPayload} defaultOpen={idx === 0} />
                          <JsonSection title="Response Payload" payload={entry.responsePayload} defaultOpen={idx === 0} />
                          <JsonSection title="Metadata" payload={entry.metadata} defaultOpen={Boolean(entry.errorMessage)} />

                          {entry.errorMessage && (
                            <div className="mx-3 mb-2 text-xs text-red-600 flex items-start gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span>{entry.errorType ? `[${entry.errorType}] ` : ""}{entry.errorMessage}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
