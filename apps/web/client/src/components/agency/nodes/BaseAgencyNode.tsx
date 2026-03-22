import { memo } from "react";
import type { NodeProps } from "reactflow";
import type { AgencyNodeData } from "./types";
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

/**
 * Single ReactFlow node type dispatcher.
 * Renders the appropriate card sub-component based on data.nodeType.
 * Register as: { agency: BaseAgencyNode }
 */
export const BaseAgencyNode = memo(function BaseAgencyNode(props: NodeProps<AgencyNodeData>) {
  const { nodeType = "agent" } = props.data;

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
    default:
      return <AgentNodeCard {...props} />;
  }
});
