/**
 * ExpressionInput - Text input with support for {{expression}} syntax.
 *
 * Future enhancement: Add autocomplete dropdown triggered by {{ for upstream node outputs.
 * For now, provides basic input with expression highlighting.
 */

import React, { useState } from "react";

export interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * ExpressionInput component.
 *
 * Supports writing expressions like {{nodeId.output.field}}.
 * TODO: Implement autocomplete dropdown when {{ is typed.
 * TODO: Highlight {{...}} tokens with visual styling.
 */
export function ExpressionInput({
  value,
  onChange,
  placeholder = "Enter value or {{expression}}...",
  className = "",
}: ExpressionInputProps) {
  const [showHint, setShowHint] = useState(false);

  // Detect if value contains expression syntax
  const hasExpression = /\{\{[^}]+\}\}/.test(value);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShowHint(true)}
        onBlur={() => setShowHint(false)}
        placeholder={placeholder}
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-md
          focus:outline-none focus:ring-2 focus:ring-blue-500
          ${hasExpression ? "font-mono text-sm" : ""}
          ${className}
        `}
      />

      {/* Expression indicator */}
      {hasExpression && (
        <div className="absolute right-2 top-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
          Expression
        </div>
      )}

      {/* Hint tooltip */}
      {showHint && (
        <div className="absolute left-0 right-0 top-full mt-1 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
          <p className="font-semibold mb-1">Expression Syntax:</p>
          <p>
            Use <code className="bg-gray-700 px-1 rounded">{"{{nodeId.output}}"}</code> to reference
            values from upstream nodes.
          </p>
          <p className="mt-1 text-gray-400">
            Example: <code>{"{{llm_call_1.text}}"}</code>
          </p>
        </div>
      )}
    </div>
  );
}
