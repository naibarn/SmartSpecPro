/**
 * Resource Graph Component
 * 
 * Displays CPU and Memory usage over time using Recharts
 */

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cpu, MemoryStick, Network, Activity } from "lucide-react";

interface StatsHistoryEntry {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsage: number;
  networkRx: number;
  networkTx: number;
}

interface ResourceGraphProps {
  history: StatsHistoryEntry[];
  containerName: string;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

// Format timestamp to time string
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Custom tooltip component
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-card/95 backdrop-blur border border-primary/30 rounded-lg p-3 shadow-lg">
      <p className="text-xs text-muted-foreground font-mono mb-2">
        {formatTime(label)}
      </p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          <span className="font-medium">{entry.name}:</span>{" "}
          {entry.dataKey.includes("memory") && entry.dataKey.includes("Usage")
            ? formatBytes(entry.value)
            : `${entry.value.toFixed(1)}%`}
        </p>
      ))}
    </div>
  );
}

// Custom network tooltip
function NetworkTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-card/95 backdrop-blur border border-primary/30 rounded-lg p-3 shadow-lg">
      <p className="text-xs text-muted-foreground font-mono mb-2">
        {formatTime(label)}
      </p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          <span className="font-medium">{entry.name}:</span>{" "}
          {formatBytes(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function ResourceGraph({ history, containerName }: ResourceGraphProps) {
  // Transform data for charts
  const chartData = useMemo(() => {
    return history.map((entry) => ({
      ...entry,
      time: formatTime(entry.timestamp),
    }));
  }, [history]);

  // Calculate current values
  const currentStats = history[history.length - 1];
  const avgCpu = history.length > 0
    ? history.reduce((sum, h) => sum + h.cpuPercent, 0) / history.length
    : 0;
  const avgMemory = history.length > 0
    ? history.reduce((sum, h) => sum + h.memoryPercent, 0) / history.length
    : 0;

  if (history.length === 0) {
    return (
      <Card className="bg-card/80 backdrop-blur border-primary/30 p-6">
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Activity className="w-6 h-6 mr-2 animate-pulse" />
          <span className="font-mono">Collecting stats data...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 backdrop-blur border-primary/30 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold tracking-wide text-foreground">
          Resource Monitor
        </h3>
        <span className="text-xs text-muted-foreground font-mono">
          {containerName}
        </span>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-background/50 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Cpu className="w-4 h-4" />
            <span className="text-xs font-mono uppercase">CPU Now</span>
          </div>
          <span className="text-xl font-bold">
            {currentStats?.cpuPercent.toFixed(1)}%
          </span>
        </div>
        <div className="bg-background/50 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <Cpu className="w-4 h-4" />
            <span className="text-xs font-mono uppercase">CPU Avg</span>
          </div>
          <span className="text-xl font-bold">{avgCpu.toFixed(1)}%</span>
        </div>
        <div className="bg-background/50 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 text-violet-400 mb-1">
            <MemoryStick className="w-4 h-4" />
            <span className="text-xs font-mono uppercase">Memory Now</span>
          </div>
          <span className="text-xl font-bold">
            {currentStats?.memoryPercent.toFixed(1)}%
          </span>
        </div>
        <div className="bg-background/50 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <MemoryStick className="w-4 h-4" />
            <span className="text-xs font-mono uppercase">Memory Avg</span>
          </div>
          <span className="text-xl font-bold">{avgMemory.toFixed(1)}%</span>
        </div>
      </div>

      {/* Tabs for different graphs */}
      <Tabs defaultValue="combined" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-background/50">
          <TabsTrigger value="combined" className="font-mono text-xs">
            Combined
          </TabsTrigger>
          <TabsTrigger value="cpu" className="font-mono text-xs">
            CPU
          </TabsTrigger>
          <TabsTrigger value="memory" className="font-mono text-xs">
            Memory
          </TabsTrigger>
        </TabsList>

        {/* Combined CPU & Memory */}
        <TabsContent value="combined" className="mt-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(0, 255, 255, 0.1)"
                />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                  stroke="rgba(255, 255, 255, 0.3)"
                  tick={{ fontSize: 10, fill: "rgba(255, 255, 255, 0.5)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="rgba(255, 255, 255, 0.3)"
                  tick={{ fontSize: 10, fill: "rgba(255, 255, 255, 0.5)" }}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: "12px", fontFamily: "monospace" }}
                />
                <Line
                  type="monotone"
                  dataKey="cpuPercent"
                  name="CPU"
                  stroke="#00ffff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#00ffff" }}
                />
                <Line
                  type="monotone"
                  dataKey="memoryPercent"
                  name="Memory"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#a855f7" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        {/* CPU Only */}
        <TabsContent value="cpu" className="mt-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ffff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00ffff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(0, 255, 255, 0.1)"
                />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                  stroke="rgba(255, 255, 255, 0.3)"
                  tick={{ fontSize: 10, fill: "rgba(255, 255, 255, 0.5)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="rgba(255, 255, 255, 0.3)"
                  tick={{ fontSize: 10, fill: "rgba(255, 255, 255, 0.5)" }}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cpuPercent"
                  name="CPU Usage"
                  stroke="#00ffff"
                  strokeWidth={2}
                  fill="url(#cpuGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        {/* Memory Only */}
        <TabsContent value="memory" className="mt-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(168, 85, 247, 0.1)"
                />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                  stroke="rgba(255, 255, 255, 0.3)"
                  tick={{ fontSize: 10, fill: "rgba(255, 255, 255, 0.5)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="rgba(255, 255, 255, 0.3)"
                  tick={{ fontSize: 10, fill: "rgba(255, 255, 255, 0.5)" }}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="memoryPercent"
                  name="Memory Usage"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#memGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>

      {/* Network stats (if available) */}
      {currentStats && (currentStats.networkRx > 0 || currentStats.networkTx > 0) && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono uppercase text-muted-foreground">
              Network I/O
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-background/50 rounded-lg p-3 border border-border/50">
              <span className="text-xs text-muted-foreground font-mono">RX (Received)</span>
              <p className="text-lg font-bold text-emerald-400">
                {formatBytes(currentStats.networkRx)}
              </p>
            </div>
            <div className="bg-background/50 rounded-lg p-3 border border-border/50">
              <span className="text-xs text-muted-foreground font-mono">TX (Transmitted)</span>
              <p className="text-lg font-bold text-amber-400">
                {formatBytes(currentStats.networkTx)}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default ResourceGraph;
