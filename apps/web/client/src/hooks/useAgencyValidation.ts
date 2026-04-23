import { useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { AgencyNodeData } from "@/components/agency/nodes/types";
import { getNodeSupport, type HybridEngine } from "@/components/agency/hybridNodeSupport";

type Route = { condition?: string; targetNodeId?: string };
type ConditionalRule = { field?: string; operator?: string; targetNodeId?: string };
type ConditionalCategory = { label?: string; targetNodeId?: string };
type ConditionalContext = { targetNodeId?: string };
type FanOutBranch = { targetNodeId?: string };

interface ValidationSubgraph {
  id: string;
  name?: string;
  engine: HybridEngine;
}

interface UseAgencyValidationOptions {
  subgraphs?: ValidationSubgraph[];
  defaultEngine?: HybridEngine;
}

const CONDITIONAL_OPERATORS = new Set(["equals", "contains", "regex", "gt", "lt", "gte", "lte", "exists"]);
const PARALLEL_MERGE_STRATEGIES = new Set(["wait_all", "first_complete", "majority", "custom_prompt"]);
const LOOP_EXIT_MODES = new Set(["max_iterations", "rule_based", "llm_evaluate", "context_check"]);
const ERROR_STRATEGIES = new Set(["retry", "fallback", "skip", "terminate"]);

function getEffectiveEngine(
  node: Node<AgencyNodeData>,
  subgraphs: ValidationSubgraph[],
  defaultEngine: HybridEngine,
): HybridEngine {
  if (node.data.subgraphId) {
    const subgraph = subgraphs.find((entry) => entry.id === node.data.subgraphId);
    if (subgraph) {
      return subgraph.engine;
    }
  }
  return node.data.engineHint ?? defaultEngine;
}

function addNodeError(errors: Map<string, string[]>, nodeId: string, message: string) {
  const existing = errors.get(nodeId) ?? [];
  if (!existing.includes(message)) {
    errors.set(nodeId, [...existing, message]);
  }
}

export function useAgencyValidation(
  nodes: Node<AgencyNodeData>[],
  edges: Edge[],
  options: UseAgencyValidationOptions = {},
): Map<string, string[]> {
  const subgraphs = options.subgraphs ?? [];
  const defaultEngine = options.defaultEngine ?? "agency_swarm";

  return useMemo(() => {
    const errors = new Map<string, string[]>();
    const entryPoints = nodes.filter((node) => node.data.isEntryPoint);
    const nodeIds = new Set(nodes.map((node) => node.id));

    for (const node of nodes) {
      const nodeErrors: string[] = [];
      const nodeType = node.data.nodeType ?? "agent";
      const nodeConfig = (node.data.nodeConfig ?? {}) as Record<string, unknown>;
      const effectiveEngine = getEffectiveEngine(node, subgraphs, defaultEngine);
      const support = getNodeSupport(nodeType, effectiveEngine);

      if (node.data.isEntryPoint && !["agent", "supervisor", "autonomous_agent"].includes(nodeType)) {
        nodeErrors.push("Only agent, supervisor, or autonomous agent nodes can be the entry point");
      }

      if (support === "unsupported") {
        nodeErrors.push(`This node type is not supported on ${effectiveEngine}`);
      }

      if (nodeType === "agent" || nodeType === "supervisor") {
        const hasAutoModel = Boolean(node.data.modelRequirements);
        if (!node.data.model && !hasAutoModel) {
          nodeErrors.push("Model is required");
        }
        if (!node.data.instructions?.trim()) {
          nodeErrors.push("Instructions are required");
        }

        if (nodeType === "supervisor") {
          const maxRounds = Number(nodeConfig.maxRounds ?? 5);
          if (!Number.isFinite(maxRounds) || maxRounds < 1 || maxRounds > 20) {
            nodeErrors.push("Max rounds must be between 1 and 20");
          }
        }
      }

      if (nodeType === "router") {
        const routes = Array.isArray(nodeConfig.routes) ? nodeConfig.routes as Route[] : [];
        if (routes.length === 0) {
          nodeErrors.push("At least 1 route is required");
        } else {
          routes.forEach((route, index) => {
            if (!route.condition?.trim()) {
              nodeErrors.push(`Route ${index + 1}: condition is required`);
            }
            if (!route.targetNodeId?.trim()) {
              nodeErrors.push(`Route ${index + 1}: target node ID is required`);
            } else if (!nodeIds.has(route.targetNodeId)) {
              nodeErrors.push(`Route ${index + 1}: target node does not exist`);
            }
          });
        }

        const defaultTargetNodeId = typeof nodeConfig.defaultTargetNodeId === "string"
          ? nodeConfig.defaultTargetNodeId
          : "";
        if (!defaultTargetNodeId.trim()) {
          nodeErrors.push("Default target (fallback) is required");
        } else if (!nodeIds.has(defaultTargetNodeId)) {
          nodeErrors.push("Default target does not exist");
        }

        const routingMode = String(nodeConfig.routingMode ?? "keyword");
        if (routingMode === "llm_classify" && !node.data.model) {
          nodeErrors.push("LLM classify mode requires a model");
        }
      }

      if (nodeType === "aggregator") {
        const aggregationMode = String(nodeConfig.aggregationMode ?? "");
        if (!aggregationMode) {
          nodeErrors.push("Aggregation mode is required");
        }
        if (aggregationMode === "llm_merge" && !node.data.model) {
          nodeErrors.push("LLM merge mode requires a model");
        }
        const minResponses = Number(nodeConfig.minResponses ?? 1);
        if (!Number.isFinite(minResponses) || minResponses < 1) {
          nodeErrors.push("Min responses must be at least 1");
        }
      }

      if (nodeType === "knowledge_base") {
        if (nodeConfig.searchScope === "specific" && !nodeConfig.collectionId) {
          nodeErrors.push("Select a document to search");
        }
      }

      if (nodeType === "skill_call" && !nodeConfig.skillSlug) {
        nodeErrors.push("Skill slug is required");
      }

      if (nodeType === "browser_session") {
        if (!String(nodeConfig.goal ?? "").trim()) {
          nodeErrors.push("Browser goal is required");
        }

        const handoffMode = String(nodeConfig.handoffMode ?? "continue_running");
        if (
          (handoffMode === "review_required" || handoffMode === "needs_user_input")
          && !String(nodeConfig.handoffSummary ?? "").trim()
        ) {
          nodeErrors.push("Human handoff summary is required");
        }
      }

      if (nodeType === "human_approval") {
        const timeoutHours = Number(nodeConfig.timeoutHours ?? 0);
        if (!Number.isFinite(timeoutHours) || timeoutHours <= 0) {
          nodeErrors.push("Timeout hours is required");
        }
      }

      if (nodeType === "conditional_branch") {
        const mode = String(nodeConfig.evaluationMode ?? "");
        if (!["rule_based", "llm_classify", "context_check"].includes(mode)) {
          nodeErrors.push("Conditional branch requires a valid evaluation mode");
        }

        const defaultTargetNodeId = String(nodeConfig.defaultTargetNodeId ?? "");
        if (!defaultTargetNodeId) {
          nodeErrors.push("Default target is required");
        } else if (!nodeIds.has(defaultTargetNodeId)) {
          nodeErrors.push("Default target does not exist");
        }

        if (mode === "rule_based") {
          const rules = Array.isArray(nodeConfig.rules) ? nodeConfig.rules as ConditionalRule[] : [];
          if (rules.length === 0) {
            nodeErrors.push("Rule-based mode requires at least 1 rule");
          }
          rules.forEach((rule, index) => {
            if (!rule.field?.trim()) {
              nodeErrors.push(`Rule ${index + 1}: field is required`);
            }
            if (!rule.operator || !CONDITIONAL_OPERATORS.has(rule.operator)) {
              nodeErrors.push(`Rule ${index + 1}: operator is invalid`);
            }
            if (!rule.targetNodeId?.trim()) {
              nodeErrors.push(`Rule ${index + 1}: target node is required`);
            } else if (!nodeIds.has(rule.targetNodeId)) {
              nodeErrors.push(`Rule ${index + 1}: target node does not exist`);
            }
          });
        }

        if (mode === "llm_classify") {
          const categories = Array.isArray(nodeConfig.categories) ? nodeConfig.categories as ConditionalCategory[] : [];
          if (categories.length < 2) {
            nodeErrors.push("LLM classify mode requires at least 2 categories");
          }
          categories.forEach((category, index) => {
            if (!category.label?.trim()) {
              nodeErrors.push(`Category ${index + 1}: label is required`);
            }
            if (!category.targetNodeId?.trim()) {
              nodeErrors.push(`Category ${index + 1}: target node is required`);
            } else if (!nodeIds.has(category.targetNodeId)) {
              nodeErrors.push(`Category ${index + 1}: target node does not exist`);
            }
          });
        }

        if (mode === "context_check") {
          const conditions = Array.isArray(nodeConfig.contextConditions) ? nodeConfig.contextConditions as ConditionalContext[] : [];
          if (conditions.length === 0) {
            nodeErrors.push("Context check mode requires at least 1 condition");
          }
          conditions.forEach((condition, index) => {
            if (!condition.targetNodeId?.trim()) {
              nodeErrors.push(`Context condition ${index + 1}: target node is required`);
            } else if (!nodeIds.has(condition.targetNodeId)) {
              nodeErrors.push(`Context condition ${index + 1}: target node does not exist`);
            }
          });
        }
      }

      if (nodeType === "parallel_fan_out") {
        const branches = Array.isArray(nodeConfig.branches) ? nodeConfig.branches as FanOutBranch[] : [];
        if (branches.length < 2) {
          nodeErrors.push("Parallel fan-out requires at least 2 branches");
        }
        branches.forEach((branch, index) => {
          if (!branch.targetNodeId?.trim()) {
            nodeErrors.push(`Branch ${index + 1}: target node is required`);
          } else if (!nodeIds.has(branch.targetNodeId)) {
            nodeErrors.push(`Branch ${index + 1}: target node does not exist`);
          }
        });

        const mergeStrategy = String(nodeConfig.mergeStrategy ?? "");
        if (!PARALLEL_MERGE_STRATEGIES.has(mergeStrategy)) {
          nodeErrors.push("Merge strategy is invalid");
        }
        if (mergeStrategy === "custom_prompt" && !String(nodeConfig.mergePrompt ?? "").trim()) {
          nodeErrors.push("Custom merge prompt is required");
        }
      }

      if (nodeType === "loop_retry") {
        const loopTargetNodeId = String(nodeConfig.loopTargetNodeId ?? "");
        if (!loopTargetNodeId) {
          nodeErrors.push("Loop target node is required");
        } else if (!nodeIds.has(loopTargetNodeId)) {
          nodeErrors.push("Loop target node does not exist");
        }

        const exitCondition = (nodeConfig.exitCondition ?? {}) as Record<string, unknown>;
        const mode = String(exitCondition.mode ?? "max_iterations");
        if (!LOOP_EXIT_MODES.has(mode)) {
          nodeErrors.push("Loop exit mode is invalid");
        }

        const maxIterations = Number(exitCondition.maxIterations ?? 5);
        if (!Number.isFinite(maxIterations) || maxIterations < 1 || maxIterations > 20) {
          nodeErrors.push("Max iterations must be between 1 and 20");
        }
      }

      if (nodeType === "skill_discovery") {
        const taskSource = String(nodeConfig.taskSource ?? "static");
        if (taskSource === "static" && !String(nodeConfig.taskValue ?? "").trim()) {
          nodeErrors.push("Static task description is required");
        }
        if (taskSource === "context" && !String(nodeConfig.contextKey ?? "").trim()) {
          nodeErrors.push("Context key is required");
        }
        const confidenceThreshold = Number(nodeConfig.confidenceThreshold ?? 0.7);
        if (!Number.isFinite(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) {
          nodeErrors.push("Confidence threshold must be between 0 and 1");
        }
        const maxResults = Number(nodeConfig.maxResults ?? 5);
        if (!Number.isFinite(maxResults) || maxResults < 1 || maxResults > 10) {
          nodeErrors.push("Max results must be between 1 and 10");
        }
      }

      if (nodeType === "error_handler") {
        const watchedNodeIds = Array.isArray(nodeConfig.watchedNodeIds) ? nodeConfig.watchedNodeIds as string[] : [];
        if (watchedNodeIds.length === 0) {
          nodeErrors.push("At least one watched node is required");
        }

        const onError = String(nodeConfig.onError ?? "retry");
        if (!ERROR_STRATEGIES.has(onError)) {
          nodeErrors.push("On-error strategy is invalid");
        }
        if (onError === "fallback") {
          const fallbackNodeId = String(nodeConfig.fallbackNodeId ?? "");
          const fallbackMessage = String(nodeConfig.fallbackMessage ?? "");
          if (fallbackNodeId && !nodeIds.has(fallbackNodeId)) {
            nodeErrors.push("Fallback node does not exist");
          }
          if (!fallbackNodeId && !fallbackMessage.trim()) {
            nodeErrors.push("Fallback node or fallback message is required");
          }
        }
      }

      if (nodeType === "data_transform") {
        const transformMode = String(nodeConfig.transformMode ?? "jsonpath");
        if (!["jsonpath", "template", "filter"].includes(transformMode)) {
          nodeErrors.push("Transform mode is invalid");
        }
        if (transformMode === "jsonpath" && !String(nodeConfig.jsonpathExpression ?? "").trim()) {
          nodeErrors.push("JSONPath expression is required");
        }
        if (transformMode === "template" && !String(nodeConfig.template ?? "").trim()) {
          nodeErrors.push("Template is required");
        }
      }

      if (nodeType === "engine_boundary") {
        if (node.data.isEntryPoint) {
          nodeErrors.push("Boundary nodes cannot be entry points");
        }
        if (!String(nodeConfig.bridgeMode ?? "").trim()) {
          nodeErrors.push("Bridge mode is required");
        }
        if (!String(nodeConfig.inputContract ?? "").trim()) {
          nodeErrors.push("Input contract is required");
        }
        if (!String(nodeConfig.outputContract ?? "").trim()) {
          nodeErrors.push("Output contract is required");
        }
        const targetSubgraphId = String(nodeConfig.targetSubgraphId ?? "");
        if (!targetSubgraphId) {
          nodeErrors.push("Target subgraph is required");
        } else if (subgraphs.length > 0 && !subgraphs.some((subgraph) => subgraph.id === targetSubgraphId)) {
          nodeErrors.push("Target subgraph does not exist");
        }
      }

      if (nodeErrors.length > 0) {
        errors.set(node.id, nodeErrors);
      }
    }

    if (nodes.length > 0 && entryPoints.length === 0) {
      for (const node of nodes) {
        if (["agent", "supervisor", "autonomous_agent"].includes(node.data.nodeType ?? "agent")) {
          addNodeError(errors, node.id, "One entry point is required");
        }
      }
    }

    if (entryPoints.length > 1) {
      for (const node of entryPoints) {
        addNodeError(errors, node.id, "Only one entry point is allowed");
      }
    }

    if (subgraphs.length > 0) {
      const engineBySubgraph = new Map(subgraphs.map((subgraph) => [subgraph.id, subgraph.engine] as const));

      for (const edge of edges) {
        const sourceNode = nodes.find((node) => node.id === edge.source);
        const targetNode = nodes.find((node) => node.id === edge.target);
        if (!sourceNode || !targetNode) {
          continue;
        }

        const sourceSubgraphId = sourceNode.data.subgraphId ?? null;
        const targetSubgraphId = targetNode.data.subgraphId ?? null;
        const sourceEngine = sourceSubgraphId ? engineBySubgraph.get(sourceSubgraphId) : (sourceNode.data.engineHint ?? defaultEngine);
        const targetEngine = targetSubgraphId ? engineBySubgraph.get(targetSubgraphId) : (targetNode.data.engineHint ?? defaultEngine);
        const crossesEngine = !!sourceEngine && !!targetEngine && sourceEngine !== targetEngine;

        if (!crossesEngine) {
          continue;
        }

        const explicitBoundary = sourceNode.data.nodeType === "engine_boundary" || targetNode.data.nodeType === "engine_boundary";
        if (!explicitBoundary) {
          addNodeError(errors, sourceNode.id, "Cross-engine edges require an engine boundary node");
          addNodeError(errors, targetNode.id, "Cross-engine edges require an engine boundary node");
        }
      }
    }

    return errors;
  }, [defaultEngine, edges, nodes, subgraphs]);
}
