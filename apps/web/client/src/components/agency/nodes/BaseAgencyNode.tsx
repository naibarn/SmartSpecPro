import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import type { AgencyFlowNodeProps } from "./types";
import { AgentNodeCard } from "./AgentNodeCard";
import { SupervisorNodeCard } from "./SupervisorNodeCard";
import { RouterNodeCard } from "./RouterNodeCard";
import { AggregatorNodeCard } from "./AggregatorNodeCard";
import { KnowledgeBaseNodeCard } from "./KnowledgeBaseNodeCard";
import { SkillCallNodeCard } from "./SkillCallNodeCard";
import { HumanApprovalNodeCard } from "./HumanApprovalNodeCard";
import { BrowserSessionNodeCard } from "./BrowserSessionNodeCard";
import { ConditionalBranchNodeCard } from "./ConditionalBranchNodeCard";
import { ParallelFanOutNodeCard } from "./ParallelFanOutNodeCard";
import { LoopRetryNodeCard } from "./LoopRetryNodeCard";
import { SkillDiscoveryNodeCard } from "./SkillDiscoveryNodeCard";
import { ErrorHandlerNodeCard } from "./ErrorHandlerNodeCard";
import { DataTransformNodeCard } from "./DataTransformNodeCard";
import { AutonomousAgentNode } from "./AutonomousAgentNode";
import { EngineBoundaryNodeCard } from "./EngineBoundaryNodeCard";
// McpServerNodeCard removed — MCP servers are tools, not node types

/**
 * Single ReactFlow node type dispatcher.
 * Renders the appropriate card sub-component based on data.nodeType.
 * Register as: { agency: BaseAgencyNode }
 */
export const BaseAgencyNode = memo(function BaseAgencyNode(props: AgencyFlowNodeProps) {
  const { nodeType = "agent" } = props.data;

  const renderNodeCard = () => {
    switch (nodeType) {
      case "supervisor":
        return <SupervisorNodeCard {...props} />;
      case "router":
        return <RouterNodeCard {...props} />;
      case "aggregator":
        return <AggregatorNodeCard {...props} />;
      case "knowledge_base":
        return <KnowledgeBaseNodeCard {...props} />;
      case "skill_call":
        return <SkillCallNodeCard {...props} />;
      case "human_approval":
        return <HumanApprovalNodeCard {...props} />;
      case "browser_session":
        return <BrowserSessionNodeCard {...props} />;
      case "conditional_branch":
        return <ConditionalBranchNodeCard {...props} />;
      case "parallel_fan_out":
        return <ParallelFanOutNodeCard {...props} />;
      case "loop_retry":
        return <LoopRetryNodeCard {...props} />;
      case "skill_discovery":
        return <SkillDiscoveryNodeCard {...props} />;
      case "error_handler":
        return <ErrorHandlerNodeCard {...props} />;
      case "data_transform":
        return <DataTransformNodeCard {...props} />;
      case "autonomous_agent":
        return <AutonomousAgentNode {...props} />;
      case "engine_boundary":
        return <EngineBoundaryNodeCard {...props} />;
      default:
        return <AgentNodeCard {...props} />;
    }
  };

  return (
    <div className="relative inline-flex">
      {renderNodeCard()}
      {(props.data.subgraphId || props.data.engineHint) && (
        <div className="pointer-events-none absolute -top-2 left-2 z-20 flex flex-wrap gap-1">
          {props.data.subgraphId && (
            <Badge
              variant="secondary"
              className="border border-slate-200 bg-white/95 px-1.5 py-0 text-[10px] text-slate-700 shadow-sm"
            >
              {props.data.subgraphId}
            </Badge>
          )}
          {props.data.engineHint && (
            <Badge
              variant="secondary"
              className="border border-indigo-200 bg-indigo-50/95 px-1.5 py-0 text-[10px] text-indigo-700 shadow-sm"
            >
              {props.data.engineHint}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
});
