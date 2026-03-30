import { useState } from "react";
import { Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Download,
  RefreshCw,
  AlertCircle,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardCard } from "@/components/dashboard";

export default function AdminFunnelDashboard() {
  // RBAC check - only admin and domain_admin can access
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (!user || (user.role !== 'admin' && user.role !== 'domain_admin')) {
    return <Redirect to="/" />;
  }
  // Date range state (default: last 30 days)
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);

  // Active tab state
  const [activeTab, setActiveTab] = useState("overview");

  // Bucket granularity (day/week/month)
  const [bucket, setBucket] = useState<"day" | "week" | "month">("day");

  // Export format
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");

  // Export loading state
  const [isExporting, setIsExporting] = useState(false);

  // Date range warning state
  const [dateRangeExceeded, setDateRangeExceeded] = useState(false);

  // Determine current stage filter based on active tab
  const getStageForTab = (tab: string): "acquisition" | "activation" | "usage" | "revenue" | undefined => {
    switch (tab) {
      case "acquisition":
        return "acquisition";
      case "activation":
        return "activation";
      case "engagement":
        return "usage";
      case "revenue":
        return "revenue";
      default:
        return undefined;
    }
  };

  const currentStage = getStageForTab(activeTab);

  // Check and warn about date range
  const checkDateRange = (from: string, to: string) => {
    const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
    setDateRangeExceeded(diffDays > 90);
  };

  // Fetch summary data
  const summaryQuery = trpc.funnelAnalytics.summary.useQuery(
    {
      from: new Date(dateFrom),
      to: new Date(dateTo),
      bucket,
      stage: currentStage,
      bypassCache: false,
    },
    {
      refetchOnWindowFocus: false,
    }
  );

  // Fetch time series data
  const timeSeriesQuery = trpc.funnelAnalytics.timeSeries.useQuery(
    {
      from: new Date(dateFrom),
      to: new Date(dateTo),
      bucket,
      stage: currentStage,
      bypassCache: false,
    },
    {
      refetchOnWindowFocus: false,
    }
  );

  // Cache invalidation mutation
  const invalidateCacheMutation = trpc.funnelAnalytics.invalidateCache.useMutation();

  // Manual refresh handler
  const handleRefresh = async () => {
    await invalidateCacheMutation.mutateAsync();
    summaryQuery.refetch();
    timeSeriesQuery.refetch();
  };

  // Date change handlers with validation
  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    checkDateRange(value, dateTo);
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    checkDateRange(dateFrom, value);
  };

  // Export handler with loading state
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Trigger export via tRPC export endpoint
      window.open(`/trpc/funnelAnalytics.export?input=${encodeURIComponent(JSON.stringify({
        from: dateFrom,
        to: dateTo,
        bucket,
        stage: currentStage,
        format: exportFormat,
      }))}`, '_blank');
    } finally {
      // Set timeout to reset loading state (since we can't track window.open completion)
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <TrendingUp className="h-8 w-8" />
              Funnel Analytics
            </h1>
            <p className="text-muted-foreground">
              User journey and conversion metrics
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={invalidateCacheMutation.isPending}
            aria-label="Refresh dashboard data"
          >
            {invalidateCacheMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            aria-label={`Export data as ${exportFormat.toUpperCase()}`}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export {exportFormat.toUpperCase()}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <DashboardCard title="Filters & Settings">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bucket">Bucket</Label>
              <Select value={bucket} onValueChange={(v) => setBucket(v as "day" | "week" | "month")}>
                <SelectTrigger id="bucket">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exportFormat">Export Format</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as "csv" | "json")}>
                <SelectTrigger id="exportFormat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {dateRangeExceeded && (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span>Date range exceeds 90 days and will be clamped by the backend</span>
            </div>
          )}

          {summaryQuery.data?.rangeClamped && (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span>Date range clamped to 90 days maximum</span>
            </div>
          )}

          {summaryQuery.data?.cached && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">Cached (5 min TTL)</Badge>
            </div>
          )}
        </div>
      </DashboardCard>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
          <TabsTrigger value="activation">Activation</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <FunnelSummaryPanel
            data={summaryQuery.data}
            isLoading={summaryQuery.isLoading}
            error={summaryQuery.error}
          />
          <FunnelTimeSeriesPanel
            data={timeSeriesQuery.data}
            isLoading={timeSeriesQuery.isLoading}
            error={timeSeriesQuery.error}
            bucket={bucket}
          />
        </TabsContent>

        {/* Acquisition Tab */}
        <TabsContent value="acquisition" className="space-y-4">
          <FunnelSummaryPanel
            data={summaryQuery.data}
            isLoading={summaryQuery.isLoading}
            error={summaryQuery.error}
            stage="Acquisition"
          />
          <FunnelTimeSeriesPanel
            data={timeSeriesQuery.data}
            isLoading={timeSeriesQuery.isLoading}
            error={timeSeriesQuery.error}
            bucket={bucket}
          />
        </TabsContent>

        {/* Activation Tab */}
        <TabsContent value="activation" className="space-y-4">
          <FunnelSummaryPanel
            data={summaryQuery.data}
            isLoading={summaryQuery.isLoading}
            error={summaryQuery.error}
            stage="Activation"
          />
          <FunnelTimeSeriesPanel
            data={timeSeriesQuery.data}
            isLoading={timeSeriesQuery.isLoading}
            error={timeSeriesQuery.error}
            bucket={bucket}
          />
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <FunnelSummaryPanel
            data={summaryQuery.data}
            isLoading={summaryQuery.isLoading}
            error={summaryQuery.error}
            stage="Revenue"
          />
          <FunnelTimeSeriesPanel
            data={timeSeriesQuery.data}
            isLoading={timeSeriesQuery.isLoading}
            error={timeSeriesQuery.error}
            bucket={bucket}
          />
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-4">
          <FunnelSummaryPanel
            data={summaryQuery.data}
            isLoading={summaryQuery.isLoading}
            error={summaryQuery.error}
            stage="Engagement"
          />
          <FunnelTimeSeriesPanel
            data={timeSeriesQuery.data}
            isLoading={timeSeriesQuery.isLoading}
            error={timeSeriesQuery.error}
            bucket={bucket}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Panel Components ──

interface FunnelSummaryPanelProps {
  data?: { stages: Array<{ eventName: string; total: number; uniqueUsers: number }>; rangeClamped: boolean; cached: boolean };
  isLoading: boolean;
  error: any;
  stage?: string;
}

function FunnelSummaryPanel({ data, isLoading, error, stage }: FunnelSummaryPanelProps) {
  if (isLoading) {
    return (
      <DashboardCard>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading summary...</span>
        </div>
      </DashboardCard>
    );
  }

  if (error) {
    return (
      <DashboardCard>
        <div className="flex items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-6 w-6 mr-2" />
          <span>Error loading summary: {error.message}</span>
        </div>
      </DashboardCard>
    );
  }

  if (!data || data.stages.length === 0) {
    return (
      <DashboardCard title={`${stage ? `${stage} ` : ""}Stage Summary`}>
        <div className="text-center py-12 text-muted-foreground">
          <p>No data available for the selected period</p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title={`${stage ? `${stage} ` : ""}Stage Summary`}
      description="Event counts and unique users"
    >
      <div className="space-y-4">
        {data.stages.map((s) => (
          <div key={s.eventName} className="flex items-center justify-between border-b pb-2">
            <div>
              <p className="font-medium">{s.eventName}</p>
              <p className="text-xs text-muted-foreground">
                {s.uniqueUsers.toLocaleString()} unique users
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{s.total.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">total events</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

interface FunnelTimeSeriesPanelProps {
  data?: { series: Array<{ bucket: string; eventName: string; total: number }>; rangeClamped: boolean; cached: boolean };
  isLoading: boolean;
  error: any;
  bucket: string;
}

function FunnelTimeSeriesPanel({ data, isLoading, error, bucket }: FunnelTimeSeriesPanelProps) {
  if (isLoading) {
    return (
      <DashboardCard>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading time series...</span>
        </div>
      </DashboardCard>
    );
  }

  if (error) {
    return (
      <DashboardCard>
        <div className="flex items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-6 w-6 mr-2" />
          <span>Error loading time series: {error.message}</span>
        </div>
      </DashboardCard>
    );
  }

  if (!data || data.series.length === 0) {
    return (
      <DashboardCard title="Time Series" description={`Events over time (${bucket}ly buckets, UTC)`}>
        <div className="text-center py-12 text-muted-foreground">
          <p>No data available for the selected period</p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard title="Time Series" description={`Events over time (${bucket}ly buckets, UTC)`}>
      <div className="space-y-2">
        <div className="space-y-2">
          {data.series.map((point, idx) => {
            // Parse bucket date and format as UTC
            const bucketDate = new Date(point.bucket + 'T00:00:00Z');
            const formattedDate = bucketDate.toLocaleDateString('en-US', {
              timeZone: 'UTC',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            return (
              <div key={idx} className="flex items-center justify-between text-sm border-b pb-2">
                <div>
                  <p className="font-medium">{formattedDate} (UTC)</p>
                  <p className="text-xs text-muted-foreground">{point.eventName}</p>
                </div>
                <p className="font-semibold">{point.total.toLocaleString()}</p>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardCard>
  );
}
