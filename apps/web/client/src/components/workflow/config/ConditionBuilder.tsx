/**
 * ConditionBuilder - Visual and advanced mode condition builder for Conditional nodes.
 *
 * Future enhancement: Full visual mode with operator dropdowns and rule management.
 * For now, provides text area for advanced expressions.
 */

import React from "react";

export interface ConditionRule {
  field: string;
  operator: string;
  compareValue: any;
  combineWith: "AND" | "OR";
}

export interface ConditionBuilderProps {
  mode: "visual" | "advanced";
  value: ConditionRule[] | string;
  onChange: (value: ConditionRule[] | string) => void;
  onModeChange: (mode: "visual" | "advanced") => void;
}

/**
 * ConditionBuilder component for building boolean conditions.
 *
 * Supports two modes:
 * - Visual: GUI for building conditions with dropdowns (TODO: implement full UI)
 * - Advanced: Text area for writing expressions directly
 */
export function ConditionBuilder({
  mode,
  value,
  onChange,
  onModeChange,
}: ConditionBuilderProps) {
  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => onModeChange("visual")}
          className={`
            px-3 py-1 rounded text-sm font-medium
            ${
              mode === "visual"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }
          `}
        >
          Visual Mode
        </button>
        <button
          onClick={() => onModeChange("advanced")}
          className={`
            px-3 py-1 rounded text-sm font-medium
            ${
              mode === "advanced"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }
          `}
        >
          Advanced Mode
        </button>
      </div>

      {/* Visual Mode (TODO: Full implementation) */}
      {mode === "visual" && (
        <div className="p-4 bg-gray-50 border border-gray-300 rounded">
          <p className="text-sm text-gray-600 mb-3">
            Visual condition builder coming soon.
          </p>

          {/* Temporary: Show current value */}
          {Array.isArray(value) && value.length > 0 ? (
            <div className="space-y-2">
              {value.map((rule, idx) => (
                <div
                  key={idx}
                  className="p-2 bg-white border border-gray-200 rounded text-sm"
                >
                  <code>
                    {rule.field} {rule.operator} {String(rule.compareValue)}
                  </code>
                  {idx < value.length - 1 && (
                    <span className="ml-2 text-gray-500">
                      {rule.combineWith}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No conditions defined</p>
          )}

          {/* Switch to advanced for now */}
          <button
            onClick={() => onModeChange("advanced")}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Use advanced mode to write expressions
          </button>
        </div>
      )}

      {/* Advanced Mode */}
      {mode === "advanced" && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Boolean Expression
          </label>
          <textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g., user.age > 18 AND user.verified == true"
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <p className="text-xs text-gray-500">
            Use Python-like expressions. Available operators: ==, !=, &gt;, &lt;,
            &gt;=, &lt;=, AND, OR, NOT
          </p>
        </div>
      )}
    </div>
  );
}
