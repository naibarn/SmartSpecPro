import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  BarChart,
  TrendingUp,
  DollarSign,
  Activity,
  Download,
  Calendar,
  RefreshCw,
  Zap,
} from "lucide-react";

interface AnalyticsSummary {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  unique_users: number;
  average_response_time: number;
  error_rate: number;
}

interface TimeSeriesData {
  timestamp: string;
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
}

interface ProviderStats {
  provider: string;
  requests: number;
  tokens: number;
  cost: number;
  average_latency: number;
}

interface ModelStats {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
}

export default function AdminAnalytics() {
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);

  // Fetch summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["analytics-summary", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ start: dateFrom, end: dateTo });
      const response = await fetch(`/api/v1/analytics/summary?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch summary");
      return response.json() as Promise<AnalyticsSummary>;
    },
  });

  // Fetch time series
  const { data: timeSeries } = useQuery({
    queryKey: ["analytics-time-series", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ start: dateFrom, end: dateTo });
      const response = await fetch(`/api/v1/analytics/time-series?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch time series");
      return response.json() as Promise<TimeSeriesData[]>;
    },
  });

  // Fetch provider stats
  const { data: providers } = useQuery({
    queryKey: ["analytics-providers", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ start: dateFrom, end: dateTo });
      const response = await fetch(`/api/v1/analytics/providers?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch providers");
      return response.json() as Promise<ProviderStats[]>;
    },
  });

  // Fetch top models
  const { data: models } = useQuery({
    queryKey: ["analytics-models", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ start: dateFrom, end: dateTo, limit: "10" });
      const response = await fetch(`/api/v1/analytics/top-models?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch models");
      return response.json() as Promise<ModelStats[]>;
    },
  });

  const exportCSV = async () => {
    const params = new URLSearchParams({ start: dateFrom, end: dateTo });
    const response = await fetch(`/api/v1/analytics/export/csv?${params}`, {
      credentials: "include",
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${dateFrom}-${dateTo}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive usage and cost analytics
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? "..." : summary?.total_requests?.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.unique_users} unique users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? "..." : (summary?.total_tokens || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${summaryLoading ? "..." : summary?.total_cost?.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">USD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? "..." : summary?.error_rate?.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Avg response: {summary?.average_response_time?.toFixed(0)}ms
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Time Series Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Over Time</CardTitle>
          <CardDescription>
            Request and cost trends for the selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeSeries && timeSeries.length > 0 ? (
            <div className="space-y-4">
              {timeSeries.map((point, idx) => (
                <div key={idx} className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(point.timestamp).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {point.requests} requests, {point.tokens.toLocaleString()} tokens
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">${point.cost.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {point.errors} errors
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No data available for the selected period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Usage</CardTitle>
          <CardDescription>
            Breakdown by LLM provider
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {providers?.map((provider) => (
              <div key={provider.provider} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{provider.provider}</Badge>
                  <div>
                    <p className="text-sm font-medium">
                      {provider.requests.toLocaleString()} requests
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {provider.tokens.toLocaleString()} tokens · Avg latency:{" "}
                      {provider.average_latency.toFixed(0)}ms
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">${provider.cost.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Models */}
      <Card>
        <CardHeader>
          <CardTitle>Top Models</CardTitle>
          <CardDescription>Most used AI models</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {models?.map((model, idx) => (
              <div key={model.model} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">#{idx + 1}</Badge>
                  <div>
                    <p className="text-sm font-medium">{model.model}</p>
                    <p className="text-xs text-muted-foreground">
                      {model.requests.toLocaleString()} requests ·{" "}
                      {model.tokens.toLocaleString()} tokens
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">${model.cost.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
