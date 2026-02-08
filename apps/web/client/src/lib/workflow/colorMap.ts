/**
 * Static color mappings for workflow node types and data types.
 *
 * IMPORTANT: All Tailwind classes must be defined statically.
 * Never use dynamic class interpolation (e.g., `border-${color}-400`)
 * as Tailwind JIT purging won't recognize them.
 */

/**
 * Color map for data types (used for connection handles)
 */
export const dataTypeColorMap: Record<
  string,
  { border: string; bg: string; text: string; dot: string }
> = {
  text: {
    border: "border-blue-400",
    bg: "bg-blue-50",
    text: "text-blue-600",
    dot: "bg-blue-500",
  },
  json: {
    border: "border-green-400",
    bg: "bg-green-50",
    text: "text-green-600",
    dot: "bg-green-500",
  },
  array: {
    border: "border-purple-400",
    bg: "bg-purple-50",
    text: "text-purple-600",
    dot: "bg-purple-500",
  },
  image: {
    border: "border-pink-400",
    bg: "bg-pink-50",
    text: "text-pink-600",
    dot: "bg-pink-500",
  },
  number: {
    border: "border-orange-400",
    bg: "bg-orange-50",
    text: "text-orange-600",
    dot: "bg-orange-500",
  },
  boolean: {
    border: "border-cyan-400",
    bg: "bg-cyan-50",
    text: "text-cyan-600",
    dot: "bg-cyan-500",
  },
  any: {
    border: "border-gray-400",
    bg: "bg-gray-50",
    text: "text-gray-600",
    dot: "bg-gray-500",
  },
};

/**
 * Color map for node types (used for node backgrounds)
 */
export const nodeColorMap: Record<string, { border: string; bg: string; text: string }> = {
  blue: {
    border: "border-blue-500",
    bg: "bg-blue-100",
    text: "text-blue-700",
  },
  green: {
    border: "border-green-500",
    bg: "bg-green-100",
    text: "text-green-700",
  },
  purple: {
    border: "border-purple-500",
    bg: "bg-purple-100",
    text: "text-purple-700",
  },
  pink: {
    border: "border-pink-500",
    bg: "bg-pink-100",
    text: "text-pink-700",
  },
  orange: {
    border: "border-orange-500",
    bg: "bg-orange-100",
    text: "text-orange-700",
  },
  cyan: {
    border: "border-cyan-500",
    bg: "bg-cyan-100",
    text: "text-cyan-700",
  },
  yellow: {
    border: "border-yellow-500",
    bg: "bg-yellow-100",
    text: "text-yellow-700",
  },
  red: {
    border: "border-red-500",
    bg: "bg-red-100",
    text: "text-red-700",
  },
  gray: {
    border: "border-gray-500",
    bg: "bg-gray-100",
    text: "text-gray-700",
  },
};

/**
 * Get color classes for a data type.
 * Falls back to gray if type not found.
 */
export function getDataTypeColor(dataType: string) {
  return dataTypeColorMap[dataType] || dataTypeColorMap.any;
}

/**
 * Get color classes for a node color.
 * Falls back to gray if color not found.
 */
export function getNodeColor(color: string) {
  return nodeColorMap[color] || nodeColorMap.gray;
}
