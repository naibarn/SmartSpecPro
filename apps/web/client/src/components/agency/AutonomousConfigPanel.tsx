import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Zap } from "lucide-react";
import type { AgencyNodeData } from "./nodes/types";

interface AutonomousConfigPanelProps {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}

function ncGet<T>(node: AgencyNodeData, key: string, fallback: T): T {
  return ((node.nodeConfig as Record<string, unknown>)?.[key] as T) ?? fallback;
}

function ncSet(node: AgencyNodeData, key: string, value: unknown): Partial<AgencyNodeData> {
  return { nodeConfig: { ...(node.nodeConfig ?? {}), [key]: value } };
}

export function AutonomousConfigPanel({ node, onChange }: AutonomousConfigPanelProps) {
  return (
    <div className="space-y-4">
      {/* Planning */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Planning</h4>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Max Plan Depth</Label>
            <span className="text-xs text-muted-foreground font-mono">
              {ncGet(node, "maxPlanDepth", 3)}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={ncGet(node, "maxPlanDepth", 3)}
            onChange={(e) => onChange(ncSet(node, "maxPlanDepth", Number(e.target.value)))}
            className="w-full accent-purple-600"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Decomposition Strategy</Label>
          <Select
            value={ncGet(node, "decompositionStrategy", "adaptive")}
            onValueChange={(v) => onChange(ncSet(node, "decompositionStrategy", v))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sequential">Sequential</SelectItem>
              <SelectItem value="parallel">Parallel</SelectItem>
              <SelectItem value="adaptive">Adaptive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Max Total Iterations</Label>
            <span className="text-xs text-muted-foreground font-mono">
              {ncGet(node, "maxTotalIterations", 20)}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={ncGet(node, "maxTotalIterations", 20)}
            onChange={(e) => onChange(ncSet(node, "maxTotalIterations", Number(e.target.value)))}
            className="w-full accent-purple-600"
          />
        </div>
      </div>

      {/* Execution */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Execution</h4>

        <div className="space-y-1.5">
          <Label className="text-xs">Delegation Mode</Label>
          <Select
            value={ncGet(node, "delegationMode", "auto")}
            onValueChange={(v) => onChange(ncSet(node, "delegationMode", v))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="self_only">Self Only</SelectItem>
              <SelectItem value="delegate_to_agents">Delegate to Agents</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Reflect After Steps</Label>
            <span className="text-xs text-muted-foreground font-mono">
              {ncGet(node, "reflectAfterSteps", 3)}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={ncGet(node, "reflectAfterSteps", 3)}
            onChange={(e) => onChange(ncSet(node, "reflectAfterSteps", Number(e.target.value)))}
            className="w-full accent-purple-600"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Budget Allocation</Label>
          <Select
            value={ncGet(node, "budgetAllocation", "dynamic")}
            onValueChange={(v) => onChange(ncSet(node, "budgetAllocation", v))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equal">Equal</SelectItem>
              <SelectItem value="proportional">Proportional</SelectItem>
              <SelectItem value="dynamic">Dynamic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quality */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quality</h4>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Quality Threshold</Label>
            <span className="text-xs text-muted-foreground font-mono">
              {ncGet(node, "qualityThreshold", 0.8)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={ncGet(node, "qualityThreshold", 0.8)}
            onChange={(e) => onChange(ncSet(node, "qualityThreshold", Number(e.target.value)))}
            className="w-full accent-purple-600"
          />
        </div>
      </div>

      {/* Memory */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Memory</h4>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Enable Long-Term Memory</Label>
          <Switch
            checked={ncGet(node, "enableLongTermMemory", false)}
            onCheckedChange={(v) => onChange(ncSet(node, "enableLongTermMemory", v))}
          />
        </div>
      </div>

      {/* Cost warning */}
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2 text-xs flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 shrink-0" />
        Autonomous agents may use 10-20x more credits per run
      </div>
    </div>
  );
}
