/**
 * CostEstimation - Pre-execution cost estimate with balance check.
 *
 * Displays estimated credit cost breakdown and warnings when cost exceeds user balance.
 */

import React from "react";
import { AlertTriangle, DollarSign, Info } from "lucide-react";
import type { Node, Edge } from "reactflow";

export interface CostEstimationProps {
  nodes: Node[];
  edges: Edge[];
  userBalance: number;
  onRunClick?: () => void;
  disabled?: boolean;
  className?: string;
}

interface CostBreakdown {
  llmNodes: { count: number; estimatedCredits: number };
  imageNodes: { count: number; estimatedCredits: number };
  skillNodes: { count: number; estimatedCredits: number };
  otherNodes: { count: number; estimatedCredits: number };
  totalEstimated: number;
}

/**
 * Estimate cost for a workflow.
 * Simplified estimation - actual costs may vary based on configuration.
 */
function estimateCost(nodes: Node[]): CostBreakdown {
  let llmCount = 0,
    imageCount = 0,
    skillCount = 0,
    otherCount = 0;
  let llmCredits = 0,
    imageCredits = 0,
    skillCredits = 0,
    otherCredits = 0;

  nodes.forEach((node) => {
    const nodeType = node.data?.nodeType || "";

    if (nodeType === "llm_call") {
      llmCount++;
      // Rough estimate: 5 credits per LLM call (varies by model and prompt length)
      llmCredits += 5;
    } else if (nodeType === "generate_image") {
      imageCount++;
      // Rough estimate: 15 credits per image (varies by size and provider)
      imageCredits += 15;
    } else if (nodeType.startsWith("skill_")) {
      skillCount++;
      // Rough estimate: 3 credits per skill execution
      skillCredits += 3;
    } else if (!["conditional", "loop", "approval_gate"].includes(nodeType)) {
      // Other nodes that might have costs
      otherCount++;
      otherCredits += 1;
    }
  });

  return {
    llmNodes: { count: llmCount, estimatedCredits: llmCredits },
    imageNodes: { count: imageCount, estimatedCredits: imageCredits },
    skillNodes: { count: skillCount, estimatedCredits: skillCredits },
    otherNodes: { count: otherCount, estimatedCredits: otherCredits },
    totalEstimated: llmCredits + imageCredits + skillCredits + otherCredits,
  };
}

/**
 * CostEstimation component.
 */
export function CostEstimation({
  nodes,
  edges,
  userBalance,
  onRunClick,
  disabled = false,
  className = "",
}: CostEstimationProps) {
  const breakdown = estimateCost(nodes);
  const insufficientBalance = breakdown.totalEstimated > userBalance;
  const nearBalance = breakdown.totalEstimated > userBalance * 0.7;

  const canRun = !disabled && !insufficientBalance && breakdown.totalEstimated > 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <DollarSign className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-lg">Cost Estimation</h3>
      </div>

      {/* Total Estimate */}
      <div className="flex items-baseline justify-between">
        <span className="text-gray-700">Estimated Total:</span>
        <span className="text-2xl font-bold text-gray-900">
          {breakdown.totalEstimated.toFixed(1)} credits
        </span>
      </div>

      {/* Breakdown */}
      <div className="space-y-2 text-sm">
        {breakdown.llmNodes.count > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">
              LLM Calls ({breakdown.llmNodes.count} nodes):
            </span>
            <span className="font-medium">{breakdown.llmNodes.estimatedCredits} credits</span>
          </div>
        )}
        {breakdown.imageNodes.count > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">
              Image Generation ({breakdown.imageNodes.count} nodes):
            </span>
            <span className="font-medium">{breakdown.imageNodes.estimatedCredits} credits</span>
          </div>
        )}
        {breakdown.skillNodes.count > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">
              Skills ({breakdown.skillNodes.count} nodes):
            </span>
            <span className="font-medium">{breakdown.skillNodes.estimatedCredits} credits</span>
          </div>
        )}
        {breakdown.otherNodes.count > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">
              Other ({breakdown.otherNodes.count} nodes):
            </span>
            <span className="font-medium">{breakdown.otherNodes.estimatedCredits} credits</span>
          </div>
        )}
      </div>

      {/* User Balance */}
      <div className="flex justify-between items-center pt-2 border-t">
        <span className="text-gray-700">Your Balance:</span>
        <span className="text-lg font-semibold text-gray-900">
          {userBalance.toFixed(1)} credits
        </span>
      </div>

      {/* Warnings */}
      {insufficientBalance && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-700">Insufficient Credits</p>
            <p className="text-red-600 mt-1">
              You need {(breakdown.totalEstimated - userBalance).toFixed(1)} more credits to run
              this workflow.
            </p>
          </div>
        </div>
      )}

      {!insufficientBalance && nearBalance && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-yellow-700">High Cost Warning</p>
            <p className="text-yellow-600 mt-1">
              This workflow will use over 70% of your current balance.
            </p>
          </div>
        </div>
      )}

      {/* Info Note */}
      {breakdown.totalEstimated === 0 && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            This workflow has no estimated cost. It may use control flow nodes only.
          </div>
        </div>
      )}

      {/* Run Button */}
      {onRunClick && (
        <button
          onClick={onRunClick}
          disabled={!canRun || disabled}
          className={`
            w-full py-3 px-4 rounded-lg font-semibold text-white
            ${
              canRun && !disabled
                ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                : "bg-gray-300 cursor-not-allowed"
            }
            transition-colors
          `}
        >
          {insufficientBalance
            ? "Insufficient Credits"
            : disabled
            ? "Running..."
            : "Run Workflow"}
        </button>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 text-center">
        * Actual costs may vary based on node configuration and runtime behavior.
      </p>
    </div>
  );
}
