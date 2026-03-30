/**
 * Admin Ops Dashboard
 *
 * Operational health monitoring with 6 panels:
 * Traffic & Auth, API Health, Jobs, Kie AI, Storage, Security
 */

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Activity,
  Server,
  HardDrive,
  Shield,
  Zap,
  Users,
} from "lucide-react";
import TrafficPanel from "./panels/TrafficPanel";
import ApiHealthPanel from "./panels/ApiHealthPanel";
import JobsHealthPanel from "./panels/JobsHealthPanel";
import KieAiHealthPanel from "./panels/KieAiHealthPanel";
import StoragePanel from "./panels/StoragePanel";
import SecurityPanel from "./panels/SecurityPanel";

export default function AdminOpsDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("traffic");
  const [refreshInterval, setRefreshInterval] = useState<number | null>(30000);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "domain_admin")) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <DashboardCard className="w-96" title="Access Denied" description="You need admin privileges to access this page." />
      </div>
    );
  }

  const toggleAutoRefresh = () => {
    setRefreshInterval(prev => prev ? null : 30000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { window.location.href = "/admin/dashboard"; }}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Advanced Ops Panels</h1>
                  <p className="text-xs text-muted-foreground">Deep-dive panels for traffic, APIs, jobs, storage, and security after triage starts in the command center</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={refreshInterval ? "default" : "secondary"}>
                {refreshInterval ? "Auto-refresh: 30s" : "Paused"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAutoRefresh}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshInterval ? "animate-spin" : ""}`} />
                {refreshInterval ? "Pause" : "Resume"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="traffic" className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Traffic</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">API</span>
            </TabsTrigger>
            <TabsTrigger value="jobs" className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Jobs</span>
            </TabsTrigger>
            <TabsTrigger value="kie" className="flex items-center gap-1">
              <Server className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Kie AI</span>
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-1">
              <HardDrive className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Storage</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="traffic">
            <TrafficPanel refreshInterval={refreshInterval} />
          </TabsContent>
          <TabsContent value="api">
            <ApiHealthPanel refreshInterval={refreshInterval} />
          </TabsContent>
          <TabsContent value="jobs">
            <JobsHealthPanel refreshInterval={refreshInterval} />
          </TabsContent>
          <TabsContent value="kie">
            <KieAiHealthPanel refreshInterval={refreshInterval} />
          </TabsContent>
          <TabsContent value="storage">
            <StoragePanel refreshInterval={refreshInterval} />
          </TabsContent>
          <TabsContent value="security">
            <SecurityPanel refreshInterval={refreshInterval} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
