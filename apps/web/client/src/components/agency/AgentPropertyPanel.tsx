import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToolPicker } from "./ToolPicker";
import { ModelPicker } from "./ModelPicker";
import type { AgencyNodeData } from "./nodes/types";
import { X, Wrench, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentPropertyPanelProps {
  agent: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
  onClose: () => void;
  onDelete: () => void;
}

export function AgentPropertyPanel({
  agent,
  onChange,
  onClose,
  onDelete,
}: AgentPropertyPanelProps) {
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleAddTool = (tool: { toolId: string; toolName: string; toolConfig?: Record<string, unknown> }) => {
    onChange({ tools: [...(agent.tools ?? []), tool] });
  };

  const handleRemoveTool = (toolId: string) => {
    onChange({ tools: (agent.tools ?? []).filter((t) => t.toolId !== toolId) });
  };

  return (
    <div className="flex h-full w-80 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">Agent Properties</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={agent.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Agent name"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="agent-description">Description</Label>
            <Textarea
              id="agent-description"
              value={agent.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Short description"
              rows={2}
            />
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <Label htmlFor="agent-instructions">Instructions</Label>
            <Textarea
              id="agent-instructions"
              value={agent.instructions}
              onChange={(e) => {
                if (e.target.value.length <= 10000) {
                  onChange({ instructions: e.target.value });
                }
              }}
              placeholder="Agent system prompt / instructions"
              rows={5}
              maxLength={10000}
              className="min-h-[120px] resize-y"
            />
            <p className="text-xs text-muted-foreground text-right">
              {(agent.instructions ?? "").length.toLocaleString()}/10,000
            </p>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label htmlFor="agent-model">Model</Label>
            <ModelPicker
              value={agent.model ?? ""}
              onChange={(value) => onChange({ model: value })}
            />
          </div>

          <Separator />

          {/* Advanced Settings (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Advanced Settings
              {settingsOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {settingsOpen && (
              <div className="mt-2 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="max-tokens">Max Tokens</Label>
                  <Input
                    id="max-tokens"
                    type="number"
                    value={agent.modelSettings?.maxTokens ?? ""}
                    onChange={(e) =>
                      onChange({
                        modelSettings: {
                          ...agent.modelSettings,
                          maxTokens: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        },
                      })
                    }
                    placeholder="4096"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="temperature">
                    Temperature ({agent.modelSettings?.temperature ?? 0.7})
                  </Label>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={agent.modelSettings?.temperature ?? 0.7}
                    onChange={(e) =>
                      onChange({
                        modelSettings: {
                          ...agent.modelSettings,
                          temperature: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="top-p">
                    Top P ({agent.modelSettings?.topP ?? 1})
                  </Label>
                  <input
                    id="top-p"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={agent.modelSettings?.topP ?? 1}
                    onChange={(e) =>
                      onChange({
                        modelSettings: {
                          ...agent.modelSettings,
                          topP: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reasoning Effort</Label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    value={agent.modelSettings?.reasoningEffort ?? ""}
                    onChange={(e) =>
                      onChange({
                        modelSettings: {
                          ...agent.modelSettings,
                          reasoningEffort: e.target.value
                            ? (e.target.value as "minimal" | "low" | "medium" | "high")
                            : undefined,
                        },
                      })
                    }
                  >
                    <option value="">Default</option>
                    <option value="minimal">Minimal</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Parallel Tool Calls</Label>
                    <input
                      type="checkbox"
                      checked={agent.parallelToolCalls ?? true}
                      onChange={(e) => onChange({ parallelToolCalls: e.target.checked })}
                      className="rounded"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Allow multiple tools to execute simultaneously</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Max Turns</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={agent.maxTurns ?? 25}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) onChange({ maxTurns: Math.min(100, Math.max(1, val)) });
                    }}
                    placeholder="25"
                  />
                  <p className="text-xs text-slate-500">Maximum number of LLM turns per run</p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Flags */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="entry-point">Entry Point</Label>
              <Switch
                id="entry-point"
                checked={agent.isEntryPoint}
                onCheckedChange={(checked) => onChange({ isEntryPoint: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="optional">Optional</Label>
              <Switch
                id="optional"
                checked={agent.isOptional}
                onCheckedChange={(checked) => onChange({ isOptional: checked })}
              />
            </div>
          </div>

          <Separator />

          {/* Tools */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5" />
                Tools
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setToolPickerOpen(true)}
              >
                Add Tool
              </Button>
            </div>

            {(agent.tools ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No tools assigned.</p>
            ) : (
              <div className="space-y-1">
                {(agent.tools ?? []).map((tool) => (
                  <div
                    key={tool.toolId}
                    className="flex items-center justify-between rounded border px-2 py-1"
                  >
                    <span className="truncate text-xs">{tool.toolName}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => handleRemoveTool(tool.toolId)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Delete */}
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Agent
          </Button>
        </div>
      </ScrollArea>

      <ToolPicker
        open={toolPickerOpen}
        onClose={() => setToolPickerOpen(false)}
        onSelect={handleAddTool}
        excludeToolIds={(agent.tools ?? []).map((t) => t.toolId)}
      />
    </div>
  );
}
