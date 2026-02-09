/**
 * Hook for fetching and caching the workflow node registry from the backend.
 *
 * The backend is the single source of truth for node definitions.
 * This hook fetches from GET /api/v1/workflows/node-types and caches with TanStack Query.
 */

import { useQuery } from "@tanstack/react-query";
import type { DataType } from "./dataTypes";

export interface InputSpec {
  name: string;
  display_name: string;
  data_type: DataType;
  ui_type: string;
  required: boolean;
  accepts_connection: boolean;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  options_endpoint?: string;
  validation?: Record<string, unknown>;
  placeholder?: string;
}

export interface OutputSpec {
  name: string;
  display_name: string;
  data_type: DataType;
}

export interface NodeTypeSpec {
  type: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  category: "ai" | "flow_control" | "human" | "skills" | "media" | "triggers" | "inputs" | "outputs" | "data" | "integrations";
  inputs: InputSpec[];
  outputs: OutputSpec[];
  executor: string;
}

interface NodeRegistryResponse {
  node_types: NodeTypeSpec[];
}

/**
 * Fetch node registry from backend.
 */
async function fetchNodeRegistry(): Promise<NodeTypeSpec[]> {
  const response = await fetch("/api/v1/workflows/node-types");

  if (!response.ok) {
    throw new Error(`Failed to fetch node registry: ${response.statusText}`);
  }

  const data: NodeRegistryResponse = await response.json();
  return data.node_types;
}

/**
 * Hook to access the workflow node registry.
 *
 * @returns Node registry data, loading state, and helper functions
 */
export function useNodeRegistry() {
  const {
    data: nodeTypes,
    isLoading,
    error,
  } = useQuery<NodeTypeSpec[], Error>({
    queryKey: ["nodeRegistry"],
    queryFn: fetchNodeRegistry,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Cache for 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  /**
   * Get a node type definition by its type identifier.
   *
   * @param type - The node type (e.g., "llm_call", "rag_query")
   * @returns Node type spec if found, undefined otherwise
   */
  const getNodeType = (type: string): NodeTypeSpec | undefined => {
    return nodeTypes?.find((nodeType) => nodeType.type === type);
  };

  /**
   * Get all node types in a specific category.
   *
   * @param category - Category to filter by
   * @returns Array of node types in that category
   */
  const getNodeTypesByCategory = (
    category: NodeTypeSpec["category"]
  ): NodeTypeSpec[] => {
    if (!nodeTypes) return [];
    return nodeTypes.filter((nodeType) => nodeType.category === category);
  };

  return {
    nodeTypes: nodeTypes || [],
    isLoading,
    error,
    getNodeType,
    getNodeTypesByCategory,
  };
}
