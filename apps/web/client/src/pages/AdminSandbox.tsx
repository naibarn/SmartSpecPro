/**
 * Admin Sandbox Job Explorer
 *
 * Admin page for monitoring sandbox jobs, managing profiles and tenant policies.
 */

import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocaleToggle } from "@/components/LocaleToggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Server,
  Activity,
  AlertTriangle,
  DollarSign,
  Clock,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

/** Status → Badge variant mapping */
const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  completed: "default",
  executing: "secondary",
  queued: "outline",
  provisioning: "outline",
  failed: "destructive",
  timed_out: "destructive",
  canceled: "destructive",
};

const STATUS_OPTIONS = [
  "all",
  "queued",
  "provisioning",
  "executing",
  "completed",
  "failed",
  "timed_out",
  "canceled",
] as const;

const FEATURE_OPTIONS = [
  "all",
  "chat",
  "skill",
  "workflow",
  "library",
  "media",
  "presentation",
  "connector",
] as const;

export default function AdminSandbox() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Auth guard
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    setLocation("/dashboard");
    return null;
  }

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Sandbox Jobs</h1>
            <p className="text-sm text-muted-foreground">
              Monitor and manage OpenSandbox execution jobs
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LocaleToggle className="shrink-0" />
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-1", autoRefresh && "animate-spin")}
            />
            {autoRefresh ? "Auto" : "Manual"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <DashboardKpiCard
          icon={Server}
          label="Total Jobs"
          value="—"
          subLabel="All time sandbox executions"
        />
        <DashboardKpiCard
          icon={Activity}
          label="Active Now"
          value="—"
          subLabel="Currently executing sandboxes"
        />
        <DashboardKpiCard
          icon={DollarSign}
          label="Total Cost"
          value="—"
          subLabel="This period (USD)"
        />
        <DashboardKpiCard
          icon={AlertTriangle}
          label="Failure Rate"
          value="—"
          subLabel="Failed / total jobs"
        />
      </div>

      {/* Tabs: Jobs / Profiles / Policies / Cost */}
      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="profiles">Profiles</TabsTrigger>
          <TabsTrigger value="policies">Tenant Policies</TabsTrigger>
          <TabsTrigger value="cost">Cost Analytics</TabsTrigger>
        </TabsList>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-4">
          {/* Filter Bar */}
          <div className="flex gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "All statuses" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={featureFilter} onValueChange={setFeatureFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Feature" />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_OPTIONS.map(f => (
                  <SelectItem key={f} value={f}>
                    {f === "all" ? "All features" : f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job Table Placeholder */}
          <DashboardCard
            title="Sandbox Jobs"
            description="Jobs are listed when OPENSANDBOX_ENABLED=true and sandbox dispatch is active."
          >
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>
                No sandbox jobs yet. Jobs will appear here when sandbox
                execution is enabled and workflows dispatch to it.
              </p>
            </div>
          </DashboardCard>
        </TabsContent>

        {/* Profiles Tab */}
        <TabsContent value="profiles">
          <SandboxProfilePanel />
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies">
          <TenantSandboxPolicyPanel />
        </TabsContent>

        {/* Cost Analytics Tab */}
        <TabsContent value="cost">
          <SandboxCostAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Sandbox Profile Management Panel */
function SandboxProfilePanel() {
  return (
    <DashboardCard
      title="Sandbox Profiles"
      description="Manage runtime profiles that define resource limits for sandbox execution environments."
    >
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>
          Profile management will be populated from the sandbox_profiles
          database table. Use the tRPC sandbox.admin procedures to manage
          profiles.
        </p>
      </div>
    </DashboardCard>
  );
}

/** Tenant Sandbox Policy Panel */
function TenantSandboxPolicyPanel() {
  return (
    <DashboardCard
      title="Tenant Sandbox Policies"
      description="Configure per-tenant limits for sandbox concurrency, runtime, and network access."
    >
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>
          Select a tenant to view and edit their sandbox policy. Policies
          control max concurrent sandboxes, daily runtime limits, and egress
          rules.
        </p>
      </div>
    </DashboardCard>
  );
}

/** Sandbox Cost Analytics Card */
function SandboxCostAnalytics() {
  return (
    <DashboardCard
      title="Sandbox Cost Analytics"
      description="Aggregated cost breakdown by tenant, feature type, and profile."
    >
      <div className="text-center py-8 text-muted-foreground">
        <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>
          Cost analytics will aggregate sandbox_jobs cost data. Use date range
          filters to view cost trends by tenant and feature type.
        </p>
      </div>
    </DashboardCard>
  );
}
