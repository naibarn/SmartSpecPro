import type { Connection, Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

import type { AgencyNodeData } from "./nodes/types";

export interface RouterRouteConfig {
  id?: string;
  condition?: string;
  targetNodeId?: string;
  label?: string;
  handleId?: string;
}

interface ConditionalRuleConfig {
  id?: string;
  targetNodeId?: string;
}

interface ConditionalCategoryConfig {
  label?: string;
  targetNodeId?: string;
}

interface ConditionalContextConfig {
  targetNodeId?: string;
}

interface FanOutBranchConfig {
  id?: string;
  targetNodeId?: string;
}

const SPECIAL_FLOW_NODE_TYPES = new Set(["router", "conditional_branch", "parallel_fan_out"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nextNodeConfig(
  node: Node<AgencyNodeData>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(node.data.nodeConfig ?? {}),
    ...updates,
  };
}

function edgeId(source: string, target: string, sourceHandle?: string | null): string {
  return `e-${source}-${sourceHandle ?? "default"}-${target}`;
}

function specialEdgeStyle(nodeType: AgencyNodeData["nodeType"] | undefined, sourceHandle?: string | null) {
  if (nodeType === "router") {
    return {
      color: sourceHandle === "default" ? "#3b82f6" : "#2563eb",
      flowType: "delegation" as const,
    };
  }
  if (nodeType === "conditional_branch") {
    return {
      color: "#d97706",
      flowType: "delegation" as const,
    };
  }
  return {
    color: "#06b6d4",
    flowType: "parallel" as const,
  };
}

export function isSpecialFlowNodeType(nodeType?: string | null): boolean {
  return !!nodeType && SPECIAL_FLOW_NODE_TYPES.has(nodeType);
}

export function normalizeRouterRoutes(
  routes: unknown,
): RouterRouteConfig[] {
  if (!Array.isArray(routes)) {
    return [];
  }

  return routes.map((route, index) => {
    if (!isRecord(route)) {
      return {
        id: `route-${index + 1}`,
        condition: "",
        targetNodeId: "",
        label: "",
      };
    }

    const rawHandleId = typeof route.handleId === "string" && route.handleId.trim()
      ? route.handleId.trim()
      : undefined;
    const rawId = typeof route.id === "string" && route.id.trim()
      ? route.id.trim()
      : rawHandleId;

    return {
      ...route,
      id: rawId || `route-${index + 1}`,
      condition: typeof route.condition === "string" ? route.condition : "",
      targetNodeId: typeof route.targetNodeId === "string" ? route.targetNodeId : "",
      label: typeof route.label === "string" ? route.label : "",
    };
  });
}

export function getRouterRouteHandleId(route: RouterRouteConfig, index: number): string {
  return route.id || route.handleId || `route-${index + 1}`;
}

export function buildSpecialFlowEdges(
  nodes: Array<Node<AgencyNodeData>>,
  currentEdges: Edge[],
): Edge[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const preserved = currentEdges.filter((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    return !isSpecialFlowNodeType(sourceNode?.data.nodeType);
  });
  const existingBySignature = new Map(
    currentEdges.map((edge) => [
      `${edge.source}|${edge.sourceHandle ?? "default"}|${edge.target}`,
      edge,
    ]),
  );

  const derived: Edge[] = [];

  for (const node of nodes) {
    const nodeType = node.data.nodeType;
    const nodeConfig = node.data.nodeConfig ?? {};

    if (nodeType === "router") {
      const routes = normalizeRouterRoutes(nodeConfig.routes);
      routes.forEach((route, index) => {
        if (!route.targetNodeId) {
          return;
        }
        const handleId = getRouterRouteHandleId(route, index);
        const signature = `${node.id}|${handleId}|${route.targetNodeId}`;
        const existing = existingBySignature.get(signature);
        const style = specialEdgeStyle(nodeType, handleId);
        derived.push({
          id: existing?.id ?? edgeId(node.id, route.targetNodeId, handleId),
          source: node.id,
          target: route.targetNodeId,
          sourceHandle: handleId,
          type: "communication",
          data: { flowType: style.flowType },
          markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
          style: { stroke: style.color, strokeWidth: 2 },
        });
      });

      const defaultTargetNodeId = typeof nodeConfig.defaultTargetNodeId === "string"
        ? nodeConfig.defaultTargetNodeId
        : "";
      if (defaultTargetNodeId) {
        const signature = `${node.id}|default|${defaultTargetNodeId}`;
        const existing = existingBySignature.get(signature);
        const style = specialEdgeStyle(nodeType, "default");
        derived.push({
          id: existing?.id ?? edgeId(node.id, defaultTargetNodeId, "default"),
          source: node.id,
          target: defaultTargetNodeId,
          sourceHandle: "default",
          type: "communication",
          data: { flowType: style.flowType },
          markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
          style: { stroke: style.color, strokeWidth: 2 },
        });
      }
      continue;
    }

    if (nodeType === "conditional_branch") {
      const evaluationMode = typeof nodeConfig.evaluationMode === "string"
        ? nodeConfig.evaluationMode
        : "rule_based";

      if (evaluationMode === "rule_based" && Array.isArray(nodeConfig.rules)) {
        (nodeConfig.rules as ConditionalRuleConfig[]).forEach((rule, index) => {
          if (!rule.targetNodeId) {
            return;
          }
          const handleId = rule.id || `rule-${index}`;
          const signature = `${node.id}|${handleId}|${rule.targetNodeId}`;
          const existing = existingBySignature.get(signature);
          const style = specialEdgeStyle(nodeType, handleId);
          derived.push({
            id: existing?.id ?? edgeId(node.id, rule.targetNodeId, handleId),
            source: node.id,
            target: rule.targetNodeId,
            sourceHandle: handleId,
            type: "communication",
            data: { flowType: style.flowType },
            markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
            style: { stroke: style.color, strokeWidth: 2 },
          });
        });
      }

      if (evaluationMode === "llm_classify" && Array.isArray(nodeConfig.categories)) {
        (nodeConfig.categories as ConditionalCategoryConfig[]).forEach((category, index) => {
          if (!category.targetNodeId) {
            return;
          }
          const handleId = `cat-${index}`;
          const signature = `${node.id}|${handleId}|${category.targetNodeId}`;
          const existing = existingBySignature.get(signature);
          const style = specialEdgeStyle(nodeType, handleId);
          derived.push({
            id: existing?.id ?? edgeId(node.id, category.targetNodeId, handleId),
            source: node.id,
            target: category.targetNodeId,
            sourceHandle: handleId,
            type: "communication",
            data: { flowType: style.flowType },
            markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
            style: { stroke: style.color, strokeWidth: 2 },
          });
        });
      }

      if (evaluationMode === "context_check" && Array.isArray(nodeConfig.contextConditions)) {
        (nodeConfig.contextConditions as ConditionalContextConfig[]).forEach((condition, index) => {
          if (!condition.targetNodeId) {
            return;
          }
          const handleId = `ctx-${index}`;
          const signature = `${node.id}|${handleId}|${condition.targetNodeId}`;
          const existing = existingBySignature.get(signature);
          const style = specialEdgeStyle(nodeType, handleId);
          derived.push({
            id: existing?.id ?? edgeId(node.id, condition.targetNodeId, handleId),
            source: node.id,
            target: condition.targetNodeId,
            sourceHandle: handleId,
            type: "communication",
            data: { flowType: style.flowType },
            markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
            style: { stroke: style.color, strokeWidth: 2 },
          });
        });
      }

      const defaultTargetNodeId = typeof nodeConfig.defaultTargetNodeId === "string"
        ? nodeConfig.defaultTargetNodeId
        : "";
      if (defaultTargetNodeId) {
        const signature = `${node.id}|default|${defaultTargetNodeId}`;
        const existing = existingBySignature.get(signature);
        const style = specialEdgeStyle(nodeType, "default");
        derived.push({
          id: existing?.id ?? edgeId(node.id, defaultTargetNodeId, "default"),
          source: node.id,
          target: defaultTargetNodeId,
          sourceHandle: "default",
          type: "communication",
          data: { flowType: style.flowType },
          markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
          style: { stroke: style.color, strokeWidth: 2 },
        });
      }
      continue;
    }

    if (nodeType === "parallel_fan_out" && Array.isArray(nodeConfig.branches)) {
      (nodeConfig.branches as FanOutBranchConfig[]).forEach((branch, index) => {
        if (!branch.targetNodeId) {
          return;
        }
        const handleId = branch.id || `branch-${index}`;
        const signature = `${node.id}|${handleId}|${branch.targetNodeId}`;
        const existing = existingBySignature.get(signature);
        const style = specialEdgeStyle(nodeType, handleId);
        derived.push({
          id: existing?.id ?? edgeId(node.id, branch.targetNodeId, handleId),
          source: node.id,
          target: branch.targetNodeId,
          sourceHandle: handleId,
          type: "communication",
          data: { flowType: style.flowType },
          markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
          style: { stroke: style.color, strokeWidth: 2 },
        });
      });
    }
  }

  return [...preserved, ...derived];
}

export function specialEdgesEquivalent(a: Edge[], b: Edge[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const serialize = (edges: Edge[]) => edges
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      flowType: edge.data?.flowType ?? null,
      stroke: edge.style?.stroke ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return JSON.stringify(serialize(a)) === JSON.stringify(serialize(b));
}

export function applySpecialEdgeConnection(
  nodes: Array<Node<AgencyNodeData>>,
  connection: Connection,
): Array<Node<AgencyNodeData>> {
  if (!connection.source || !connection.target) {
    return nodes;
  }

  return nodes.map((node) => {
    if (node.id !== connection.source) {
      return node;
    }

    const nodeConfig = node.data.nodeConfig ?? {};
    const sourceHandle = connection.sourceHandle ?? "default";

    if (node.data.nodeType === "router") {
      if (sourceHandle === "default") {
        return {
          ...node,
          data: {
            ...node.data,
            nodeConfig: nextNodeConfig(node, {
              defaultTargetNodeId: connection.target,
            }),
          },
        };
      }

      const routes = normalizeRouterRoutes(nodeConfig.routes).map((route, index) => (
        getRouterRouteHandleId(route, index) === sourceHandle
          ? { ...route, targetNodeId: connection.target, id: getRouterRouteHandleId(route, index) }
          : route
      ));
      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, { routes }),
        },
      };
    }

    if (node.data.nodeType === "conditional_branch") {
      const evaluationMode = typeof nodeConfig.evaluationMode === "string"
        ? nodeConfig.evaluationMode
        : "rule_based";

      if (sourceHandle === "default") {
        return {
          ...node,
          data: {
            ...node.data,
            nodeConfig: nextNodeConfig(node, {
              defaultTargetNodeId: connection.target,
            }),
          },
        };
      }

      if (evaluationMode === "rule_based" && Array.isArray(nodeConfig.rules)) {
        const rules = (nodeConfig.rules as ConditionalRuleConfig[]).map((rule, index) => (
          (rule.id || `rule-${index}`) === sourceHandle
            ? { ...rule, targetNodeId: connection.target }
            : rule
        ));
        return {
          ...node,
          data: {
            ...node.data,
            nodeConfig: nextNodeConfig(node, { rules }),
          },
        };
      }

      if (evaluationMode === "llm_classify" && Array.isArray(nodeConfig.categories)) {
        const categories = (nodeConfig.categories as ConditionalCategoryConfig[]).map((category, index) => (
          `cat-${index}` === sourceHandle
            ? { ...category, targetNodeId: connection.target }
            : category
        ));
        return {
          ...node,
          data: {
            ...node.data,
            nodeConfig: nextNodeConfig(node, { categories }),
          },
        };
      }

      if (evaluationMode === "context_check" && Array.isArray(nodeConfig.contextConditions)) {
        const contextConditions = (nodeConfig.contextConditions as ConditionalContextConfig[]).map((condition, index) => (
          `ctx-${index}` === sourceHandle
            ? { ...condition, targetNodeId: connection.target }
            : condition
        ));
        return {
          ...node,
          data: {
            ...node.data,
            nodeConfig: nextNodeConfig(node, { contextConditions }),
          },
        };
      }
    }

    if (node.data.nodeType === "parallel_fan_out" && Array.isArray(nodeConfig.branches)) {
      const branches = (nodeConfig.branches as FanOutBranchConfig[]).map((branch, index) => (
        (branch.id || `branch-${index}`) === sourceHandle
          ? { ...branch, targetNodeId: connection.target }
          : branch
      ));
      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, { branches }),
        },
      };
    }

    return node;
  });
}

export function removeSpecialEdgeTargets(
  nodes: Array<Node<AgencyNodeData>>,
  removedEdges: Edge[],
): Array<Node<AgencyNodeData>> {
  if (removedEdges.length === 0) {
    return nodes;
  }

  const removedBySource = new Map<string, Edge[]>();
  removedEdges.forEach((edge) => {
    const bucket = removedBySource.get(edge.source) ?? [];
    bucket.push(edge);
    removedBySource.set(edge.source, bucket);
  });

  return nodes.map((node) => {
    const outgoing = removedBySource.get(node.id);
    if (!outgoing || !isSpecialFlowNodeType(node.data.nodeType)) {
      return node;
    }

    const nodeConfig = node.data.nodeConfig ?? {};

    if (node.data.nodeType === "router") {
      let changed = false;
      const routes = normalizeRouterRoutes(nodeConfig.routes).map((route, index) => {
        const handleId = getRouterRouteHandleId(route, index);
        const matched = outgoing.some((edge) => edge.target === route.targetNodeId && (edge.sourceHandle ?? "default") === handleId);
        if (!matched) {
          return route;
        }
        changed = true;
        return {
          ...route,
          targetNodeId: "",
        };
      });

      let defaultTargetNodeId = typeof nodeConfig.defaultTargetNodeId === "string"
        ? nodeConfig.defaultTargetNodeId
        : "";
      if (outgoing.some((edge) => (edge.sourceHandle ?? "default") === "default" && edge.target === defaultTargetNodeId)) {
        changed = true;
        defaultTargetNodeId = "";
      }

      if (!changed) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, {
            routes,
            defaultTargetNodeId,
          }),
        },
      };
    }

    if (node.data.nodeType === "conditional_branch") {
      const evaluationMode = typeof nodeConfig.evaluationMode === "string"
        ? nodeConfig.evaluationMode
        : "rule_based";
      let changed = false;
      let nextConfig: Record<string, unknown> = {};

      if (evaluationMode === "rule_based" && Array.isArray(nodeConfig.rules)) {
        nextConfig.rules = (nodeConfig.rules as ConditionalRuleConfig[]).map((rule, index) => {
          const handleId = rule.id || `rule-${index}`;
          const matched = outgoing.some((edge) => edge.target === rule.targetNodeId && (edge.sourceHandle ?? "default") === handleId);
          if (!matched) {
            return rule;
          }
          changed = true;
          return { ...rule, targetNodeId: "" };
        });
      }

      if (evaluationMode === "llm_classify" && Array.isArray(nodeConfig.categories)) {
        nextConfig.categories = (nodeConfig.categories as ConditionalCategoryConfig[]).map((category, index) => {
          const handleId = `cat-${index}`;
          const matched = outgoing.some((edge) => edge.target === category.targetNodeId && (edge.sourceHandle ?? "default") === handleId);
          if (!matched) {
            return category;
          }
          changed = true;
          return { ...category, targetNodeId: "" };
        });
      }

      if (evaluationMode === "context_check" && Array.isArray(nodeConfig.contextConditions)) {
        nextConfig.contextConditions = (nodeConfig.contextConditions as ConditionalContextConfig[]).map((condition, index) => {
          const handleId = `ctx-${index}`;
          const matched = outgoing.some((edge) => edge.target === condition.targetNodeId && (edge.sourceHandle ?? "default") === handleId);
          if (!matched) {
            return condition;
          }
          changed = true;
          return { ...condition, targetNodeId: "" };
        });
      }

      let defaultTargetNodeId = typeof nodeConfig.defaultTargetNodeId === "string"
        ? nodeConfig.defaultTargetNodeId
        : "";
      if (outgoing.some((edge) => (edge.sourceHandle ?? "default") === "default" && edge.target === defaultTargetNodeId)) {
        changed = true;
        defaultTargetNodeId = "";
      }

      if (!changed) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, {
            ...nextConfig,
            defaultTargetNodeId,
          }),
        },
      };
    }

    if (node.data.nodeType === "parallel_fan_out" && Array.isArray(nodeConfig.branches)) {
      let changed = false;
      const branches = (nodeConfig.branches as FanOutBranchConfig[]).map((branch, index) => {
        const handleId = branch.id || `branch-${index}`;
        const matched = outgoing.some((edge) => edge.target === branch.targetNodeId && (edge.sourceHandle ?? "default") === handleId);
        if (!matched) {
          return branch;
        }
        changed = true;
        return { ...branch, targetNodeId: "" };
      });

      if (!changed) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, { branches }),
        },
      };
    }

    return node;
  });
}

export function removeNodeConfigReferences(
  nodes: Array<Node<AgencyNodeData>>,
  removedNodeId: string,
): Array<Node<AgencyNodeData>> {
  return nodes.map((node) => {
    const nodeConfig = node.data.nodeConfig ?? {};

    if (node.data.nodeType === "router") {
      const routes = normalizeRouterRoutes(nodeConfig.routes).map((route) => (
        route.targetNodeId === removedNodeId
          ? { ...route, targetNodeId: "" }
          : route
      ));
      const defaultTargetNodeId = nodeConfig.defaultTargetNodeId === removedNodeId ? "" : nodeConfig.defaultTargetNodeId;
      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, {
            routes,
            defaultTargetNodeId,
          }),
        },
      };
    }

    if (node.data.nodeType === "conditional_branch") {
      const rules = Array.isArray(nodeConfig.rules)
        ? (nodeConfig.rules as ConditionalRuleConfig[]).map((rule) => (
          rule.targetNodeId === removedNodeId ? { ...rule, targetNodeId: "" } : rule
        ))
        : nodeConfig.rules;
      const categories = Array.isArray(nodeConfig.categories)
        ? (nodeConfig.categories as ConditionalCategoryConfig[]).map((category) => (
          category.targetNodeId === removedNodeId ? { ...category, targetNodeId: "" } : category
        ))
        : nodeConfig.categories;
      const contextConditions = Array.isArray(nodeConfig.contextConditions)
        ? (nodeConfig.contextConditions as ConditionalContextConfig[]).map((condition) => (
          condition.targetNodeId === removedNodeId ? { ...condition, targetNodeId: "" } : condition
        ))
        : nodeConfig.contextConditions;
      const defaultTargetNodeId = nodeConfig.defaultTargetNodeId === removedNodeId ? "" : nodeConfig.defaultTargetNodeId;
      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, {
            rules,
            categories,
            contextConditions,
            defaultTargetNodeId,
          }),
        },
      };
    }

    if (node.data.nodeType === "parallel_fan_out") {
      const branches = Array.isArray(nodeConfig.branches)
        ? (nodeConfig.branches as FanOutBranchConfig[]).map((branch) => (
          branch.targetNodeId === removedNodeId ? { ...branch, targetNodeId: "" } : branch
        ))
        : nodeConfig.branches;
      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, { branches }),
        },
      };
    }

    if (node.data.nodeType === "loop_retry") {
      const loopTargetNodeId = nodeConfig.loopTargetNodeId === removedNodeId ? "" : nodeConfig.loopTargetNodeId;
      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, { loopTargetNodeId }),
        },
      };
    }

    if (node.data.nodeType === "error_handler") {
      const watchedNodeIds = Array.isArray(nodeConfig.watchedNodeIds)
        ? (nodeConfig.watchedNodeIds as string[]).filter((nodeId) => nodeId !== removedNodeId)
        : nodeConfig.watchedNodeIds;
      const fallbackNodeId = nodeConfig.fallbackNodeId === removedNodeId ? "" : nodeConfig.fallbackNodeId;
      return {
        ...node,
        data: {
          ...node.data,
          nodeConfig: nextNodeConfig(node, {
            watchedNodeIds,
            fallbackNodeId,
          }),
        },
      };
    }

    return node;
  });
}
