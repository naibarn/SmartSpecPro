import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Wrench, AlertTriangle, ArrowLeft, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { ToolConfigPanel } from "./ToolConfigPanel";

interface ToolPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (tool: { toolId: string; toolName: string; toolConfig?: Record<string, unknown> }) => void;
  excludeToolIds: string[];
}

const RISK_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const TYPE_LABELS: Record<string, string> = {
  builtin: "Built-in",
  skill: "Skill",
  sandbox: "Sandbox",
  custom: "Custom",
};

export function ToolPicker({
  open,
  onClose,
  onSelect,
  excludeToolIds,
}: ToolPickerProps) {
  const [search, setSearch] = useState("");
  const [selectedTool, setSelectedTool] = useState<{
    id: string;
    name: string;
    configSchema?: { fields: unknown[] } | null;
  } | null>(null);
  const [toolConfig, setToolConfig] = useState<Record<string, unknown>>({});

  const { data: toolsData } = (trpc as any).agency?.listTools?.useQuery?.(
    undefined,
    { enabled: open },
  ) ?? { data: undefined };

  const tools = useMemo(() => {
    const allTools: Array<{
      id: string;
      name: string;
      description?: string;
      toolType?: string;
      riskLevel?: string;
      requiresApproval?: boolean;
      configSchema?: { fields: unknown[] } | null;
    }> = toolsData?.tools ?? [];

    return allTools.filter(
      (t) =>
        !excludeToolIds.includes(t.id) &&
        (!search ||
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.description?.toLowerCase().includes(search.toLowerCase())),
    );
  }, [toolsData, excludeToolIds, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof tools> = {};
    for (const tool of tools) {
      const type = tool.toolType ?? "custom";
      if (!groups[type]) groups[type] = [];
      groups[type].push(tool);
    }
    return groups;
  }, [tools]);

  const handleClose = () => {
    setSelectedTool(null);
    setToolConfig({});
    setSearch("");
    onClose();
  };

  const handleSelectTool = (tool: typeof tools[number]) => {
    if (tool.configSchema?.fields?.length) {
      // Step 2: show config form
      setSelectedTool(tool);
      setToolConfig({});
    } else {
      // No config needed — select immediately
      onSelect({ toolId: tool.id, toolName: tool.name });
      handleClose();
    }
  };

  const handleConfirmConfig = () => {
    if (!selectedTool) return;
    onSelect({ toolId: selectedTool.id, toolName: selectedTool.name, toolConfig });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedTool ? (
              <button type="button" onClick={() => setSelectedTool(null)} className="mr-1">
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            {selectedTool ? `Configure ${selectedTool.name}` : "Select Tool"}
          </DialogTitle>
        </DialogHeader>

        {/* Step 2: Config form */}
        {selectedTool && selectedTool.configSchema && (
          <div className="space-y-4">
            <ToolConfigPanel
              toolId={selectedTool.id}
              toolName={selectedTool.name}
              configSchema={selectedTool.configSchema as { fields: unknown[] } & Parameters<typeof ToolConfigPanel>[0]["configSchema"]}
              value={toolConfig}
              onChange={setToolConfig}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedTool(null)}>
                Back
              </Button>
              <Button size="sm" onClick={handleConfirmConfig}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Add Tool
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Tool list */}
        {!selectedTool && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tools..."
                className="pl-9"
              />
            </div>

            <ScrollArea className="max-h-[60vh] pr-4">
              {tools.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {toolsData === undefined ? "Loading tools..." : "No tools available."}
                </p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(grouped).map(([type, typeTools]) => (
                    <div key={type}>
                      <h4 className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
                        {TYPE_LABELS[type] ?? type}
                      </h4>
                      <div className="space-y-1">
                        {typeTools.map((tool) => (
                          <button
                            key={tool.id}
                            type="button"
                            className="flex w-full items-start gap-2 rounded border px-3 py-2 text-left transition-colors hover:bg-accent"
                            onClick={() => handleSelectTool(tool)}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">{tool.name}</span>
                                {tool.riskLevel && (
                                  <Badge
                                    variant="secondary"
                                    className={cn("px-1 py-0 text-[10px]", RISK_STYLES[tool.riskLevel] ?? "")}
                                  >
                                    {tool.riskLevel}
                                  </Badge>
                                )}
                                {tool.requiresApproval && (
                                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                                )}
                                {tool.configSchema?.fields?.length ? (
                                  <span className="text-[10px] text-blue-500">⚙ configurable</span>
                                ) : null}
                              </div>
                              {tool.description && (
                                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                  {tool.description}
                                </p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
