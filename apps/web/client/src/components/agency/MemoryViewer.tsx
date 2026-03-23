import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Trash2 } from "lucide-react";

interface MemoryViewerProps {
  agencyId: string;
  agentNodeId: string;
  userId: number;
  isAdmin?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  constraint: "bg-red-100 text-red-700",
  preference: "bg-blue-100 text-blue-700",
  fact: "bg-green-100 text-green-700",
  skill: "bg-purple-100 text-purple-700",
};

export function MemoryViewer({ agencyId, agentNodeId, userId, isAdmin }: MemoryViewerProps) {
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [showReset, setShowReset] = useState(false);

  const memoriesQuery = trpc.agency.listAgentMemories.useQuery({
    agencyId,
    agentNodeId,
    memoryType: selectedType as any,
    page: currentPage,
    pageSize: 20,
  });

  const deleteMutation = trpc.agency.deleteAgentMemory.useMutation({
    onSuccess: () => memoriesQuery.refetch(),
  });

  const resetMutation = trpc.agency.resetAgentMemories.useMutation({
    onSuccess: () => {
      memoriesQuery.refetch();
      setShowReset(false);
    },
  });

  const memories = memoriesQuery.data?.items ?? [];
  const total = memoriesQuery.data?.total ?? 0;

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Select
          value={selectedType ?? "all"}
          onValueChange={(v) => {
            setSelectedType(v === "all" ? undefined : v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue placeholder="Filter type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="constraint">Constraint</SelectItem>
            <SelectItem value="preference">Preference</SelectItem>
            <SelectItem value="fact">Fact</SelectItem>
            <SelectItem value="skill">Skill</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="destructive"
          size="sm"
          className="ml-auto text-xs h-7"
          onClick={() => setShowReset(true)}
        >
          Reset All
        </Button>
      </div>

      {/* Reset confirmation */}
      {showReset && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs space-y-2">
          <p className="text-red-800">
            Are you sure you want to reset all memories for this agent? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-xs"
              onClick={() => resetMutation.mutate({ agencyId, agentNodeId, userId: isAdmin ? userId : undefined })}
            >
              Confirm Reset
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setShowReset(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Memory list */}
      {memories.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground">
          <Database className="h-6 w-6 mx-auto mb-2 opacity-50" aria-hidden="true" />
          No memories recorded yet
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((m: Record<string, unknown>) => {
            const id = Number(m.id) || 0;
            const memoryType = String(m.memoryType ?? "fact");
            const content = String(m.content ?? "");
            const confidence = Number(m.confidence) || 0;
            const useCount = Number(m.useCount) || 0;
            const lastUsedAt = m.lastUsedAt ? String(m.lastUsedAt) : null;

            return (
            <div key={id} className="border rounded-md p-2 text-xs space-y-1">
              <div className="flex items-center gap-1.5">
                <Badge className={`text-[9px] px-1 py-0 ${TYPE_COLORS[memoryType] ?? ""}`}>
                  {memoryType}
                </Badge>
                <span className="text-muted-foreground ml-auto">
                  Used {useCount}x
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({ memoryId: id })}
                >
                  <Trash2 className="h-3 w-3 text-red-400" />
                </Button>
              </div>
              <p className="text-slate-700 line-clamp-2">{content}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>Confidence: {(confidence * 100).toFixed(0)}%</span>
                {lastUsedAt && <span>Last used: {new Date(lastUsedAt).toLocaleDateString()}</span>}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Page {currentPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            disabled={currentPage * 20 >= total}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
