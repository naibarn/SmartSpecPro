/**
 * Data type system for workflow node connections.
 *
 * Defines the type system used for port compatibility validation.
 */

export type DataType = "text" | "json" | "array" | "image" | "number" | "boolean" | "any";

/**
 * Port type compatibility matrix.
 *
 * Maps each source data type to the target data types it can connect to.
 */
export const dataTypeCompatibility: Record<DataType, Set<DataType>> = {
  text: new Set<DataType>(["text", "any"]),
  json: new Set<DataType>(["json", "text", "any"]), // JSON can stringify to text
  array: new Set<DataType>(["array", "json", "any"]), // Arrays are JSON-compatible
  image: new Set<DataType>(["image", "any"]),
  number: new Set<DataType>(["number", "text", "any"]), // Numbers can convert to text
  boolean: new Set<DataType>(["boolean", "any"]), // Booleans can convert to text
  any: new Set<DataType>(["text", "json", "array", "image", "number", "boolean", "any"]), // Any accepts all
};

/**
 * Check if a connection between two port types is valid.
 *
 * @param sourceType - Data type of the source output port
 * @param targetType - Data type of the target input port
 * @returns true if the connection is valid, false otherwise
 */
export function isCompatibleConnection(sourceType: DataType, targetType: DataType): boolean {
  const compatibleTargets = dataTypeCompatibility[sourceType];
  return compatibleTargets ? compatibleTargets.has(targetType) : false;
}

/**
 * Get a human-readable description of a data type.
 */
export function getDataTypeDescription(dataType: DataType): string {
  const descriptions: Record<DataType, string> = {
    text: "Plain text or string value",
    json: "JSON object with structured data",
    array: "Array or list of items",
    image: "Image data (URL or binary)",
    number: "Numeric value",
    boolean: "True or false value",
    any: "Any data type (accepts all connections)",
  };

  return descriptions[dataType] || "Unknown data type";
}
