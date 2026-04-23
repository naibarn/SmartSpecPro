import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Database, AlertCircle, Globe, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyFlowNodeProps } from "./types";

export const KnowledgeBaseNodeCard = memo(function KnowledgeBaseNodeCard({
  data,
  selected,
}: AgencyFlowNodeProps) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const searchScope = (data.nodeConfig?.searchScope as string) ?? "all";
  const collectionId = (data.nodeConfig?.collectionId as string) ?? "";
  const searchMode = (data.nodeConfig?.searchMode as string) ?? "hybrid";
  const topK = (data.nodeConfig?.topK as number) ?? 5;
  const isSearchAll = searchScope === "all" || !collectionId;

  return (
    <div
      className={cn(
        "w-52 rounded-lg border-2 bg-white shadow-sm transition-all",
        "border-teal-300",
        selected && "ring-2 ring-teal-500 shadow-md border-teal-500",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !border-teal-400 !bg-white"
      />

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Database className="h-3.5 w-3.5 shrink-0 text-teal-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded border border-teal-200">
            {searchMode}
          </span>
          <span className="text-[11px] text-slate-400">top {topK}</span>
        </div>

        <div className="mt-1 flex items-center gap-1">
          {isSearchAll ? (
            <>
              <Globe className="h-2.5 w-2.5 text-teal-500" />
              <span className="text-[10px] text-teal-600 font-medium">All documents</span>
            </>
          ) : (
            <>
              <FileText className="h-2.5 w-2.5 text-slate-400" />
              <span className="truncate text-[10px] text-slate-400">Doc #{collectionId}</span>
            </>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-teal-400 !bg-white"
      />
    </div>
  );
});
