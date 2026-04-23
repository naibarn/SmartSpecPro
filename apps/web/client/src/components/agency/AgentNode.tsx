import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentNodeData extends Record<string, unknown> {
  name: string;
  description: string;
  instructions: string;
  model: string;
  modelSettings: { maxTokens?: number; temperature?: number; topP?: number; reasoningEffort?: "minimal" | "low" | "medium" | "high" };
  isEntryPoint: boolean;
  isOptional: boolean;
  tools: Array<{ toolId: string; toolName: string }>;
}

type AgentFlowNode = Node<AgentNodeData, "agent">;

export const AgentNode = memo(function AgentNode({
  data,
  selected,
}: NodeProps<AgentFlowNode>) {
  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-card shadow-sm transition-shadow",
        selected && "ring-2 ring-primary shadow-md",
        data.isEntryPoint && "border-l-4 border-l-green-500",
        data.isOptional && !data.isEntryPoint && "border-l-4 border-l-yellow-500",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-primary !bg-background"
      />

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1">
          <span className="truncate text-sm font-semibold">{data.name}</span>
          <div className="flex shrink-0 gap-1">
            {data.isEntryPoint && (
              <Badge
                variant="secondary"
                className="bg-green-100 px-1 py-0 text-[10px] text-green-800 dark:bg-green-900 dark:text-green-200"
              >
                entry
              </Badge>
            )}
            {data.isOptional && (
              <Badge
                variant="secondary"
                className="bg-yellow-100 px-1 py-0 text-[10px] text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
              >
                optional
              </Badge>
            )}
          </div>
        </div>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {data.model || "No model"}
        </p>

        {data.tools.length > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Wrench className="h-3 w-3" />
            <span>{data.tools.length} tool{data.tools.length !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2 !border-primary !bg-background"
      />
    </div>
  );
});
