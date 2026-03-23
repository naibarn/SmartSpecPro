/**
 * NodePropertyPanel — polymorphic property panel for all 7 agency node types.
 *
 * Dispatches to the appropriate form based on data.nodeType:
 *   agent / supervisor   → AgentSupervisorForm
 *   router               → RouterForm
 *   aggregator           → AggregatorForm
 *   knowledge_base       → KnowledgeBaseForm
 *   skill_call           → SkillCallForm
 *   browser_session      → BrowserSessionForm
 *   human_approval       → HumanApprovalForm
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ToolPicker } from "./ToolPicker";
import { ModelPicker } from "./ModelPicker";
import { GuardrailsPanel } from "./guardrails/GuardrailsPanel";
import { McpServersPanel } from "./McpServersPanel";
import { FewShotExamplesEditor, type ExamplePair } from "./FewShotExamplesEditor";
import { AutonomousConfigPanel } from "./AutonomousConfigPanel";
import type { AgencyNodeData } from "./nodes/types";
import { BROWSER_SESSION_COPY } from "@shared/browserSession";
import {
  X, Wrench, ChevronDown, ChevronRight, Trash2, Plus,
  Search, Loader2, Zap, GripVertical, Check, ChevronsUpDown,
  BookOpen, Shield, Server, Brain,
} from "lucide-react";

const PANEL_MIN_W = 340;
const PANEL_MAX_W = 700;
const PANEL_DEFAULT_W = 400;
const PANEL_STORAGE_KEY = "agency-panel-width";

/** Minimal info about a sibling node — used for target dropdowns in Router etc. */
export interface SiblingNode {
  id: string;
  name: string;
  nodeType: string;
}

interface NodePropertyPanelProps {
  node: AgencyNodeData;
  /** Current node's ReactFlow ID — shown in the panel header */
  nodeId?: string;
  /** All other nodes in the canvas (for target dropdowns) */
  siblingNodes?: SiblingNode[];
  /** Agency ID for guardrails panel */
  agencyId?: string;
  onChange: (updates: Partial<AgencyNodeData>) => void;
  onClose: () => void;
  onDelete: () => void;
}

// ── nodeConfig helpers ───────────────────────────────────────────────────────

function ncGet<T>(node: AgencyNodeData, key: string, fallback: T): T {
  return (node.nodeConfig?.[key] as T) ?? fallback;
}

function ncSet(node: AgencyNodeData, key: string, value: unknown): Partial<AgencyNodeData> {
  return { nodeConfig: { ...(node.nodeConfig ?? {}), [key]: value } };
}

function normalizeLibraryPickerDocs(rows: unknown): Array<{ id: number; title: string; item_type?: string }> {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.reduce<Array<{ id: number; title: string; item_type?: string }>>((acc, row: any) => {
    const id = Number(row?.id ?? row?.item_id);
    if (!Number.isFinite(id) || id <= 0) {
      return acc;
    }
    acc.push({
      id,
      title: String(row?.title ?? `Document ${id}`),
      item_type: typeof row?.item_type === "string" ? row.item_type : undefined,
    });
    return acc;
  }, []);
}

// ── Root dispatcher ──────────────────────────────────────────────────────────

export function NodePropertyPanel({ node, nodeId, siblingNodes = [], agencyId, onChange, onClose, onDelete }: NodePropertyPanelProps) {
  const nodeType = node.nodeType ?? "agent";

  // ── Resizable width ──────────────────────────────────────────────────────
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(PANEL_STORAGE_KEY);
      if (saved) {
        const n = Number(saved);
        if (n >= PANEL_MIN_W && n <= PANEL_MAX_W) return n;
      }
    } catch { /* ignore */ }
    return PANEL_DEFAULT_W;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(width);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [width]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    // Dragging left edge: moving pointer left = wider panel
    const delta = startX.current - e.clientX;
    const next = Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, startW.current + delta));
    setWidth(next);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    try { localStorage.setItem(PANEL_STORAGE_KEY, String(width)); } catch { /* ignore */ }
  }, [width]);

  const TITLES: Record<string, string> = {
    agent: "Agent Properties",
    supervisor: "Supervisor Properties",
    router: "Router Properties",
    aggregator: "Aggregator Properties",
    knowledge_base: "Knowledge Base Properties",
    skill_call: "Skill Call Properties",
    browser_session: "Browser Session Properties",
    human_approval: "Human Approval Properties",
    conditional_branch: "Conditional Branch Properties",
    parallel_fan_out: "Parallel Fan-Out Properties",
    loop_retry: "Loop / Retry Properties",
    skill_discovery: "Skill Discovery Properties",
    data_transform: "Data Transform Properties",
    error_handler: "Error Handler Properties",
  };

  return (
    <div
      className="relative flex h-full flex-col border-l bg-background"
      style={{ width, minWidth: PANEL_MIN_W, maxWidth: PANEL_MAX_W, flexShrink: 0 }}
    >
      {/* Resize handle — left edge */}
      <div
        className="absolute inset-y-0 left-0 z-20 flex w-2 cursor-col-resize items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors -translate-x-1/2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Drag to resize"
      >
        <GripVertical className="h-5 w-3 text-muted-foreground/50" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <span className="text-sm font-medium truncate mr-2">{TITLES[nodeType] ?? "Node Properties"}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 p-4">
          {(nodeType === "agent" || nodeType === "supervisor" || nodeType === "autonomous_agent") && (
            <AgentSupervisorForm node={node} onChange={onChange} agencyId={agencyId} nodeId={nodeId} />
          )}
          {nodeType === "autonomous_agent" && (
            <AutonomousConfigPanel node={node} onChange={onChange} />
          )}
          {nodeType === "router" && <RouterForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
          {nodeType === "aggregator" && <AggregatorForm node={node} onChange={onChange} />}
          {nodeType === "knowledge_base" && <KnowledgeBaseForm node={node} onChange={onChange} />}
          {nodeType === "skill_call" && <SkillCallForm node={node} onChange={onChange} />}
          {nodeType === "browser_session" && <BrowserSessionForm node={node} onChange={onChange} />}
          {nodeType === "human_approval" && <HumanApprovalForm node={node} onChange={onChange} />}
          {nodeType === "conditional_branch" && <ConditionalBranchForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
          {nodeType === "parallel_fan_out" && <ParallelFanOutForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
          {nodeType === "loop_retry" && <LoopRetryForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
          {nodeType === "skill_discovery" && <SkillDiscoveryForm node={node} onChange={onChange} />}
          {nodeType === "error_handler" && <ErrorHandlerForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
          {nodeType === "data_transform" && <DataTransformForm node={node} onChange={onChange} />}

          <Separator />

          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Node
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Agent / Supervisor Form ──────────────────────────────────────────────────

function AgentSupervisorForm({
  node,
  onChange,
  agencyId,
  nodeId,
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
  agencyId?: string;
  nodeId?: string;
}) {
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [v18FeaturesOpen, setV18FeaturesOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [guardrailsOpen, setGuardrailsOpen] = useState(false);
  const [mcpServersOpen, setMcpServersOpen] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [kbDocPickerOpen, setKbDocPickerOpen] = useState(false);
  const [kbSettingsOpen, setKbSettingsOpen] = useState(false);
  const [kbDocTypeFilter, setKbDocTypeFilter] = useState<string>("all");
  const [kbDocSearchQuery, setKbDocSearchQuery] = useState("");
  const isSupervisor = node.nodeType === "supervisor";

  // Knowledge Base config from nodeConfig
  const kbConfig = (node.nodeConfig?.knowledgeBase ?? {}) as {
    documentIds?: string[];
    searchMode?: string;
    topK?: number;
    scoreThreshold?: number;
    maxContextTokens?: number;
  };
  const kbDocumentIds: string[] = kbConfig.documentIds ?? [];
  const kbSearchMode = kbConfig.searchMode ?? "hybrid";
  const kbTopK = kbConfig.topK ?? 5;
  const kbScoreThreshold = kbConfig.scoreThreshold ?? 0.7;
  const kbMaxContextTokens = kbConfig.maxContextTokens ?? 4000;

  const { data: kbDocsData, isLoading: kbDocsListLoading } = trpc.library.listDocuments.useQuery(
    { limit: 50, filters: {} },
    { enabled: kbOpen && kbDocSearchQuery.trim().length === 0 },
  );
  const { data: kbDocsSearchData, isLoading: kbDocsSearchLoading } = trpc.library.search.useQuery(
    { query: kbDocSearchQuery.trim() || undefined, limit: 50, filters: {} },
    { enabled: kbOpen && kbDocSearchQuery.trim().length > 0 },
  );
  const kbDocs = useMemo(
    () => normalizeLibraryPickerDocs(
      kbDocSearchQuery.trim().length > 0 ? kbDocsSearchData?.results : kbDocsData?.results,
    ),
    [kbDocSearchQuery, kbDocsData?.results, kbDocsSearchData?.results],
  );
  const kbDocsLoading = kbDocsListLoading || kbDocsSearchLoading;

  const kbDocTypes = Array.from(new Set(kbDocs.map((d) => (d.item_type ?? "doc").toLowerCase()))).sort();
  const filteredKbDocs = kbDocTypeFilter === "all" ? kbDocs : kbDocs.filter((d) => (d.item_type ?? "doc").toLowerCase() === kbDocTypeFilter);

  const updateKbConfig = (updates: Partial<typeof kbConfig>) => {
    const current = (node.nodeConfig?.knowledgeBase ?? {}) as Record<string, unknown>;
    onChange({
      nodeConfig: {
        ...(node.nodeConfig ?? {}),
        knowledgeBase: { ...current, ...updates },
      },
    });
  };

  const handleAddTool = (tool: {
    toolId: string;
    toolName: string;
    toolConfig?: Record<string, unknown>;
  }) => {
    onChange({ tools: [...(node.tools ?? []), tool] });
  };

  const handleRemoveTool = (toolId: string) => {
    onChange({ tools: (node.tools ?? []).filter((t) => t.toolId !== toolId) });
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Agent name"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={node.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Short description"
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Instructions</Label>
        <Textarea
          value={node.instructions}
          onChange={(e) => {
            if (e.target.value.length <= 10000) {
              onChange({ instructions: e.target.value });
            }
          }}
          placeholder="System prompt / instructions"
          rows={5}
          maxLength={10000}
          className="min-h-[120px] resize-y"
        />
        <p className="text-xs text-muted-foreground text-right">
          {(node.instructions ?? "").length.toLocaleString()}/10,000
        </p>
      </div>

      {/* Knowledge Base */}
      <Separator />
      <div>
        <button
          type="button"
          onClick={() => setKbOpen(!kbOpen)}
          className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Knowledge Base
            {kbDocumentIds.length > 0 && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                {kbDocumentIds.length}
              </span>
            )}
          </span>
          {kbOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {kbOpen && (
          <div className="mt-2 space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Attach library documents for this agent to reference. Only relevant chunks are retrieved via RAG.
            </p>

            {/* Document multi-select picker */}
            <div className="space-y-1.5">
              <Label className="text-xs">Documents ({kbDocumentIds.length}/20)</Label>
              {kbDocsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading documents...
                </div>
              ) : kbDocs.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5">
                  No documents found. Upload documents in the Library first.
                </p>
              ) : (
                <Popover open={kbDocPickerOpen} onOpenChange={setKbDocPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={kbDocPickerOpen}
                      className="w-full justify-between font-normal h-9 text-sm"
                      disabled={kbDocumentIds.length >= 20}
                    >
                      <span className="text-muted-foreground">
                        {kbDocumentIds.length >= 20 ? "Maximum 20 documents" : "Add documents..."}
                      </span>
                      <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search documents..."
                        value={kbDocSearchQuery}
                        onValueChange={setKbDocSearchQuery}
                      />
                      {kbDocTypes.length > 1 && (
                        <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b">
                          <button
                            type="button"
                            onClick={() => setKbDocTypeFilter("all")}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors",
                              kbDocTypeFilter === "all"
                                ? "bg-slate-800 text-white border-slate-800"
                                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400",
                            )}
                          >
                            All ({kbDocs.length})
                          </button>
                          {kbDocTypes.map((t) => {
                            const count = kbDocs.filter((d) => (d.item_type ?? "doc").toLowerCase() === t).length;
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setKbDocTypeFilter(t)}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase transition-colors",
                                  kbDocTypeFilter === t
                                    ? "bg-slate-800 text-white border-slate-800"
                                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400",
                                )}
                              >
                                {t} ({count})
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <CommandList className="max-h-[250px]">
                        <CommandEmpty>No documents found.</CommandEmpty>
                        <CommandGroup>
                          {filteredKbDocs.map((doc) => {
                            const docIdStr = String(doc.id);
                            const isSelected = kbDocumentIds.includes(docIdStr);
                            return (
                              <CommandItem
                                key={doc.id}
                                value={`${doc.title} ${doc.item_type ?? ""}`}
                                onSelect={() => {
                                  if (isSelected) {
                                    updateKbConfig({ documentIds: kbDocumentIds.filter((id) => id !== docIdStr) });
                                  } else if (kbDocumentIds.length < 20) {
                                    updateKbConfig({ documentIds: [...kbDocumentIds, docIdStr] });
                                  }
                                }}
                                className="flex items-center gap-1.5"
                              >
                                <Check
                                  className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                                />
                                <span className="text-[10px] bg-slate-100 px-1 rounded uppercase shrink-0">
                                  {doc.item_type ?? "doc"}
                                </span>
                                <span className="truncate">{doc.title}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Selected documents list */}
            {kbDocumentIds.length > 0 && (
              <div className="space-y-1">
                {kbDocumentIds.map((docId) => {
                  const doc = kbDocs.find((d) => String(d.id) === docId);
                  return (
                    <div key={docId} className="flex items-center justify-between rounded border px-2 py-1">
                      <span className="flex items-center gap-1.5 truncate text-xs">
                        {doc && (
                          <span className="text-[10px] bg-slate-100 px-1 rounded uppercase shrink-0">
                            {doc.item_type ?? "doc"}
                          </span>
                        )}
                        <span className="truncate">{doc ? doc.title : `Document #${docId}`}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={() => updateKbConfig({ documentIds: kbDocumentIds.filter((id) => id !== docId) })}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* RAG Settings (collapsible) */}
            <button
              type="button"
              onClick={() => setKbSettingsOpen(!kbSettingsOpen)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-slate-700 transition-colors"
            >
              {kbSettingsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              RAG Settings
            </button>
            {kbSettingsOpen && (
              <div className="space-y-3 pl-1">
                <div className="space-y-1">
                  <Label className="text-xs">Search Mode</Label>
                  <Select value={kbSearchMode} onValueChange={(v) => updateKbConfig({ searchMode: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hybrid">Hybrid (recommended)</SelectItem>
                      <SelectItem value="vector">Vector only</SelectItem>
                      <SelectItem value="keyword">Keyword only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Top K Results</Label>
                  <Select value={String(kbTopK)} onValueChange={(v) => updateKbConfig({ topK: Number(v) })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 3, 5, 10, 15, 20].map((k) => (
                        <SelectItem key={k} value={String(k)}>{k} results</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Score Threshold ({kbScoreThreshold})</Label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={kbScoreThreshold}
                    onChange={(e) => updateKbConfig({ scoreThreshold: Number(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0 (include all)</span>
                    <span>1 (exact only)</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Context Tokens</Label>
                  <Input
                    type="number"
                    min={100}
                    max={32000}
                    value={kbMaxContextTokens}
                    onChange={(e) => updateKbConfig({ maxContextTokens: Math.max(100, Number(e.target.value) || 4000) })}
                    className="h-8 text-xs"
                    placeholder="4000"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Maximum tokens to inject from KB. Reduce for smaller models.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Model Selection</Label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={cn("text-[10px] px-2 py-0.5 rounded-l border transition-colors", !node.modelRequirements ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
              onClick={() => onChange({ modelRequirements: undefined })}
            >Manual</button>
            <button
              type="button"
              className={cn("text-[10px] px-2 py-0.5 rounded-r border transition-colors", node.modelRequirements ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
              onClick={() => onChange({ modelRequirements: { strategy: "cheapest" }, model: undefined })}
            >Smart</button>
          </div>
        </div>

        {!node.modelRequirements ? (
          <ModelPicker value={node.model ?? ""} onChange={(v) => onChange({ model: v })} />
        ) : (
          <SmartModelConfig
            requirements={node.modelRequirements}
            onChange={(reqs) => onChange({ modelRequirements: reqs, model: undefined })}
          />
        )}
      </div>

      {/* Supervisor-only: maxRounds + routingStrategy */}
      {isSupervisor && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Max Rounds</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={ncGet(node, "maxRounds", 5)}
                onChange={(e) =>
                  onChange(ncSet(node, "maxRounds", Math.max(1, Number(e.target.value) || 5)))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Routing Strategy</Label>
              <Select
                value={ncGet(node, "routingStrategy", "llm")}
                onValueChange={(v) => onChange(ncSet(node, "routingStrategy", v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llm">LLM — AI decides</SelectItem>
                  <SelectItem value="round_robin">Round Robin — sequential order</SelectItem>
                  <SelectItem value="broadcast">Broadcast — send to all</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Advanced Settings */}
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
              <Label>Max Tokens</Label>
              <Input
                type="number"
                value={node.modelSettings?.maxTokens ?? ""}
                onChange={(e) =>
                  onChange({
                    modelSettings: {
                      ...node.modelSettings,
                      maxTokens: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
                placeholder="4096"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Temperature ({node.modelSettings?.temperature ?? 0.7})</Label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={node.modelSettings?.temperature ?? 0.7}
                onChange={(e) =>
                  onChange({
                    modelSettings: {
                      ...node.modelSettings,
                      temperature: Number(e.target.value),
                    },
                  })
                }
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Top P ({node.modelSettings?.topP ?? 1})</Label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={node.modelSettings?.topP ?? 1}
                onChange={(e) =>
                  onChange({
                    modelSettings: {
                      ...node.modelSettings,
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
                value={node.modelSettings?.reasoningEffort ?? ""}
                onChange={(e) =>
                  onChange({
                    modelSettings: {
                      ...node.modelSettings,
                      reasoningEffort: e.target.value || undefined,
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
                  checked={node.parallelToolCalls ?? true}
                  onChange={(e) => onChange({ parallelToolCalls: e.target.checked })}
                  className="rounded"
                />
              </div>
              <p className="text-xs text-slate-500">Allow multiple tools to execute simultaneously</p>
              {(node.parallelToolCalls === false) && (node.toolIds?.length ?? 0) > 5 && (
                <p className="text-xs text-amber-600">Sequential execution with many tools may be slow</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Max Turns</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={node.maxTurns ?? 25}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) onChange({ maxTurns: Math.min(100, Math.max(1, val)) });
                }}
                placeholder="25"
              />
              <p className="text-xs text-slate-500">Maximum number of LLM turns per run</p>
              {(node.maxTurns ?? 25) < 5 && (
                <p className="text-xs text-amber-600">Low turn limit may prevent complex tasks from completing</p>
              )}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Intelligence */}
      <div>
        <button
          type="button"
          onClick={() => setIntelligenceOpen(!intelligenceOpen)}
          aria-expanded={intelligenceOpen}
          className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Intelligence
          </span>
          {intelligenceOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {intelligenceOpen && (
          <div className="mt-2 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Execution Mode</Label>
              <Select
                value={ncGet(node, "executionMode", "single_shot")}
                onValueChange={(v) => onChange(ncSet(node, "executionMode", v))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_shot">Standard</SelectItem>
                  <SelectItem value="agentic">Agentic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ncGet(node, "executionMode", "single_shot") === "agentic" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Planning Strategy</Label>
                  <Select
                    value={ncGet(node, "planningStrategy", "basic")}
                    onValueChange={(v) => onChange(ncSet(node, "planningStrategy", v))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="cot">Chain-of-Thought</SelectItem>
                      <SelectItem value="react">ReAct</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Max Reflection Cycles</Label>
                    <span className="text-xs text-muted-foreground font-mono">
                      {ncGet(node, "maxReflectionCycles", 3)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={ncGet(node, "maxReflectionCycles", 3)}
                    onChange={(e) => onChange(ncSet(node, "maxReflectionCycles", Number(e.target.value)))}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">Show reasoning steps in output</Label>
                  <Switch
                    checked={ncGet(node, "showReasoning", false)}
                    onCheckedChange={(v) => onChange(ncSet(node, "showReasoning", v))}
                  />
                </div>

                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2 text-xs flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  Agentic mode may use 2-5x more credits per run
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Guardrails */}
      {agencyId && (
        <div>
          <button
            type="button"
            onClick={() => setGuardrailsOpen(!guardrailsOpen)}
            className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Guardrails
            </span>
            {guardrailsOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {guardrailsOpen && (
            <div className="mt-2">
              <GuardrailsPanel agencyId={agencyId} agentId={nodeId} />
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* MCP Servers (section-14) */}
      {(node.nodeType === "agent" || node.nodeType === "supervisor") && (
        <div>
          <button
            type="button"
            onClick={() => setMcpServersOpen(!mcpServersOpen)}
            className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" />
              MCP Servers
            </span>
            {mcpServersOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {mcpServersOpen && (
            <div className="mt-2">
              <McpServersPanel
                agentId={nodeId ?? ""}
                mcpServers={node.mcpServers}
                onChange={(servers) => {
                  onChange({ mcpServers: servers });
                }}
              />
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* v1.8 Agent Features */}
      <div>
        <button
          type="button"
          onClick={() => setV18FeaturesOpen(!v18FeaturesOpen)}
          className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Agent Features
          </span>
          {v18FeaturesOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {v18FeaturesOpen && (
          <div className="mt-2 space-y-3">
            {/* Conversation Starters */}
            <div className="space-y-1.5">
              <Label className="text-xs">Conversation Starters</Label>
              <p className="text-[10px] text-muted-foreground">
                Suggested opening messages shown to users.
              </p>
              {(ncGet<string[]>(node, "conversationStarters", []) ?? []).map(
                (starter, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      value={starter}
                      onChange={(e) => {
                        const starters = [...(ncGet<string[]>(node, "conversationStarters", []) ?? [])];
                        starters[i] = e.target.value;
                        onChange(ncSet(node, "conversationStarters", starters));
                      }}
                      className="h-7 text-xs"
                      placeholder="e.g. How can I help?"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => {
                        const starters = (ncGet<string[]>(node, "conversationStarters", []) ?? []).filter((_, idx) => idx !== i);
                        onChange(ncSet(node, "conversationStarters", starters.length ? starters : undefined));
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs w-full"
                onClick={() => {
                  const starters = [...(ncGet<string[]>(node, "conversationStarters", []) ?? []), ""];
                  onChange(ncSet(node, "conversationStarters", starters));
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Starter
              </Button>
            </div>

            {/* Quick Replies */}
            <div className="space-y-1.5">
              <Label className="text-xs">Quick Replies</Label>
              <p className="text-[10px] text-muted-foreground">
                Pre-canned reply buttons shown after agent responses.
              </p>
              {(ncGet<string[]>(node, "quickReplies", []) ?? []).map(
                (reply, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      value={reply}
                      onChange={(e) => {
                        const replies = [...(ncGet<string[]>(node, "quickReplies", []) ?? [])];
                        replies[i] = e.target.value;
                        onChange(ncSet(node, "quickReplies", replies));
                      }}
                      className="h-7 text-xs"
                      placeholder="e.g. Tell me more"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => {
                        const replies = (ncGet<string[]>(node, "quickReplies", []) ?? []).filter((_, idx) => idx !== i);
                        onChange(ncSet(node, "quickReplies", replies.length ? replies : undefined));
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs w-full"
                onClick={() => {
                  const replies = [...(ncGet<string[]>(node, "quickReplies", []) ?? []), ""];
                  onChange(ncSet(node, "quickReplies", replies));
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Reply
              </Button>
            </div>

            {/* Tool Use Behavior */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tool Use Behavior</Label>
              <Select
                value={ncGet<string>(node, "toolUseBehavior", "")}
                onValueChange={(v) => onChange(ncSet(node, "toolUseBehavior", v || undefined))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Default (run LLM again)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="run_llm_again">Run LLM again (default)</SelectItem>
                  <SelectItem value="stop_on_first_tool">Stop on first tool</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Files Folder */}
            <div className="space-y-1.5">
              <Label className="text-xs">Files Folder</Label>
              <Input
                value={ncGet<string>(node, "filesFolder", "")}
                onChange={(e) => onChange(ncSet(node, "filesFolder", e.target.value || undefined))}
                className="h-8 text-xs"
                placeholder="Path to agent files (optional)"
              />
              <p className="text-[10px] text-muted-foreground">
                Directory of documents for this agent. Auto-adds FileSearchTool.
              </p>
            </div>

            {/* Output Type (JSON schema) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Output Type (JSON Schema)</Label>
              <Textarea
                value={
                  ncGet(node, "outputType", null)
                    ? JSON.stringify(ncGet(node, "outputType", null), null, 2)
                    : ""
                }
                onChange={(e) => {
                  const val = e.target.value.trim();
                  if (!val) {
                    onChange(ncSet(node, "outputType", undefined));
                    return;
                  }
                  try {
                    onChange(ncSet(node, "outputType", JSON.parse(val)));
                  } catch {
                    // Don't update if invalid JSON — user is still typing
                  }
                }}
                className="min-h-[60px] resize-y font-mono text-[11px]"
                placeholder='{"type":"object","properties":{"result":{"type":"string"}}}'
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground">
                Enforce structured output. Paste a JSON Schema.
              </p>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Flags */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Entry Point</Label>
          <Switch
            checked={node.isEntryPoint}
            onCheckedChange={(v) => onChange({ isEntryPoint: v })}
          />
        </div>
        {/* Optional toggle hidden — not yet implemented in execution layer */}
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

        {(node.tools ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No tools assigned.</p>
        ) : (
          <div className="space-y-1">
            {(node.tools ?? []).map((tool) => (
              <div
                key={tool.toolId}
                className="flex items-center justify-between rounded border px-2 py-1"
              >
                <span className="truncate text-xs flex items-center gap-1">
                  {tool.toolName}
                  {!tool.toolId.startsWith("builtin-") && !tool.toolId.startsWith("sandbox-") && (
                    <Badge variant="outline" className="px-1 py-0 text-[9px] leading-tight">
                      Custom
                    </Badge>
                  )}
                </span>
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

      {/* Few-Shot Examples */}
      <Separator className="my-3" />
      <FewShotExamplesEditor
        examples={node.examples ?? []}
        onChange={(examples) => onChange({ examples })}
      />

      <ToolPicker
        open={toolPickerOpen}
        onClose={() => setToolPickerOpen(false)}
        onSelect={handleAddTool}
        excludeToolIds={(node.tools ?? []).map((t) => t.toolId)}
      />
    </>
  );
}

// ── Router Form ──────────────────────────────────────────────────────────────

type Route = { condition: string; targetNodeId: string; label?: string; handleId?: string };

function RouterForm({
  node,
  onChange,
  siblingNodes = [],
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
  siblingNodes?: SiblingNode[];
}) {
  const routingMode = ncGet<string>(node, "routingMode", "keyword");
  const routes: Route[] = ncGet(node, "routes", []);

  const updateRoute = (i: number, key: keyof Route, value: string) => {
    const newRoutes = routes.map((r, idx) => (idx === i ? { ...r, [key]: value } : r));
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), routes: newRoutes } });
  };

  const conditionPlaceholder =
    routingMode === "regex"
      ? "Regex pattern (e.g. \\d{4})"
      : routingMode === "llm_classify"
        ? "Option label shown to the classifier"
        : "Keyword to match in input";

  // Resolve node names from siblingNodes
  const nodeNameMap = new Map(siblingNodes.map((sn) => [sn.id, sn]));

  // Node type icon prefix
  const nodeTypeIcon: Record<string, string> = {
    agent: "\uD83E\uDD16", supervisor: "\uD83D\uDC51", router: "\u2194\uFE0F",
    aggregator: "\uD83D\uDD00", knowledge_base: "\uD83D\uDCDA", skill_call: "\u26A1",
    browser_session: "\uD83D\uDDA5\uFE0F", human_approval: "\uD83D\uDC64",
    conditional_branch: "\u2696\uFE0F",
    parallel_fan_out: "\u2194\uFE0F",
    loop_retry: "\uD83D\uDD04",
  };

  // Handle badge styles
  const handleBadge: Record<string, { bg: string; text: string; label: string }> = {
    true: { bg: "bg-green-100 border-green-300", text: "text-green-700", label: "True" },
    false: { bg: "bg-red-100 border-red-300", text: "text-red-600", label: "False" },
    default: { bg: "bg-blue-100 border-blue-300", text: "text-blue-600", label: "Else" },
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Router name"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={node.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Short description"
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Routing Mode</Label>
        <Select
          value={routingMode}
          onValueChange={(v) => onChange(ncSet(node, "routingMode", v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="keyword">Keyword match</SelectItem>
            <SelectItem value="regex">Regex pattern</SelectItem>
            <SelectItem value="llm_classify">LLM classification</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {routingMode === "llm_classify" && (
        <div className="space-y-1.5">
          <Label>Classifier Model</Label>
          <ModelPicker value={node.model ?? ""} onChange={(v) => onChange({ model: v })} />
        </div>
      )}

      <Separator />

      {/* Routes — auto-created from canvas edges */}
      <div className="space-y-2">
        <div>
          <Label className="text-sm font-medium">Routes</Label>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Drag from <span className="text-green-600 font-semibold">True</span> (right),{" "}
            <span className="text-red-500 font-semibold">False</span> (left), or{" "}
            <span className="text-blue-500 font-semibold">Else</span> (bottom) handle to target nodes
          </p>
        </div>

        {routes.length === 0 && (
          <div className="rounded-md border border-dashed border-blue-200 bg-blue-50/50 p-3 text-center">
            <p className="text-xs text-blue-600 font-medium">No routes yet</p>
            <p className="text-[10px] text-blue-400 mt-0.5">
              Drag from the <span className="text-green-600 font-bold">True</span> or <span className="text-red-500 font-bold">False</span> handle to another node
            </p>
          </div>
        )}

        {routes.map((route, i) => {
          const targetNode = nodeNameMap.get(route.targetNodeId);
          const icon = targetNode ? (nodeTypeIcon[targetNode.nodeType] ?? "") : "";
          const targetLabel = targetNode ? `${icon} ${targetNode.name}` : route.targetNodeId;
          const hid = route.handleId ?? "default";
          const badge = handleBadge[hid] ?? handleBadge.default;

          return (
            <div
              key={`${route.targetNodeId}-${hid}-${i}`}
              className={`rounded border p-2.5 space-y-2 ${badge.bg}`}
            >
              {/* Handle badge + target node */}
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badge.bg} ${badge.text}`}>
                  {badge.label}
                </span>
                <span className="text-[11px] text-slate-500">→</span>
                <span className="text-xs font-semibold text-slate-700 truncate" title={route.targetNodeId}>
                  {targetLabel}
                </span>
              </div>

              {/* Condition input */}
              <Input
                value={route.condition}
                onChange={(e) => updateRoute(i, "condition", e.target.value)}
                placeholder={conditionPlaceholder}
                className="h-7 text-xs bg-white/80"
              />

              {/* Optional label */}
              <Input
                value={route.label ?? ""}
                onChange={(e) => updateRoute(i, "label", e.target.value)}
                placeholder="Label (optional, shown on edge)"
                className="h-7 text-xs bg-white/80"
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Aggregator Form ──────────────────────────────────────────────────────────

function AggregatorForm({
  node,
  onChange,
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}) {
  const aggregationMode = ncGet<string>(node, "aggregationMode", "concatenate");
  const minResponses = ncGet(node, "minResponses", 1);

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Aggregator name"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={node.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Short description"
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Aggregation Mode</Label>
        <Select
          value={aggregationMode}
          onValueChange={(v) => onChange(ncSet(node, "aggregationMode", v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first_wins">First wins</SelectItem>
            <SelectItem value="concatenate">Concatenate all</SelectItem>
            <SelectItem value="majority_vote">Majority vote</SelectItem>
            <SelectItem value="llm_merge">LLM merge</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {aggregationMode === "llm_merge" && (
        <>
          <div className="space-y-1.5">
            <Label>Merge Model</Label>
            <ModelPicker value={node.model ?? ""} onChange={(v) => onChange({ model: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Merge Instructions</Label>
            <Textarea
              value={ncGet(node, "mergeInstructions", "")}
              onChange={(e) => onChange(ncSet(node, "mergeInstructions", e.target.value))}
              placeholder="How should the LLM synthesize the inputs?"
              rows={3}
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label>Min Responses Before Aggregating</Label>
        <Input
          type="number"
          min={1}
          value={minResponses}
          onChange={(e) =>
            onChange(ncSet(node, "minResponses", Math.max(1, Number(e.target.value) || 1)))
          }
        />
      </div>
    </>
  );
}

// ── Knowledge Base Form ──────────────────────────────────────────────────────

function KnowledgeBaseForm({
  node,
  onChange,
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}) {
  const collectionId = ncGet(node, "collectionId", "");
  const searchScope = ncGet<string>(node, "searchScope", "all"); // "all" | "specific"
  const topK = ncGet(node, "topK", 5);
  const searchMode = ncGet(node, "searchMode", "hybrid");
  const scoreThreshold = ncGet(node, "scoreThreshold", 0.7);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [docSearchQuery, setDocSearchQuery] = useState("");

  // Fetch library documents for "specific" mode
  const { data: docsData, isLoading: docsListLoading } = trpc.library.listDocuments.useQuery(
    { limit: 50, filters: {} },
    { enabled: searchScope === "specific" && docSearchQuery.trim().length === 0 },
  );
  const { data: docsSearchData, isLoading: docsSearchLoading } = trpc.library.search.useQuery(
    { query: docSearchQuery.trim() || undefined, limit: 50, filters: {} },
    { enabled: searchScope === "specific" && docSearchQuery.trim().length > 0 },
  );
  const docs = useMemo(
    () => normalizeLibraryPickerDocs(
      docSearchQuery.trim().length > 0 ? docsSearchData?.results : docsData?.results,
    ),
    [docSearchQuery, docsData?.results, docsSearchData?.results],
  );
  const docsLoading = docsListLoading || docsSearchLoading;

  // Derive unique file types from docs
  const docTypes = Array.from(new Set(docs.map((d: any) => (d.item_type ?? "doc").toLowerCase()))).sort();
  const filteredDocs = docTypeFilter === "all" ? docs : docs.filter((d: any) => (d.item_type ?? "doc").toLowerCase() === docTypeFilter);

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Knowledge base name"
        />
      </div>

      <Separator />

      {/* Search scope toggle */}
      <div className="space-y-1.5">
        <Label>Search Scope</Label>
        <Select
          value={searchScope}
          onValueChange={(v) => {
            const updates: Record<string, unknown> = { searchScope: v };
            if (v === "all") updates.collectionId = ""; // clear specific selection
            onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), ...updates } });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Search all documents</SelectItem>
            <SelectItem value="specific">Specific document</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {searchScope === "all"
            ? "Searches across all documents in the library using vector search"
            : "Searches within a specific document only"}
        </p>
      </div>

      {/* Document picker — shown only in "specific" mode */}
      {searchScope === "specific" && (
        <div className="space-y-1.5">
          <Label>Document</Label>
          {docsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading documents...
            </div>
          ) : docs.length === 0 ? (
            <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5">
              No documents found. Upload documents in the Library first.
            </p>
          ) : (
            <Popover open={docPickerOpen} onOpenChange={setDocPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={docPickerOpen}
                  className="w-full justify-between font-normal h-9 text-sm"
                >
                  {collectionId ? (
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="text-[10px] bg-slate-100 px-1 rounded uppercase shrink-0">
                        {docs.find((d: any) => String(d.id) === collectionId)?.item_type ?? "doc"}
                      </span>
                      <span className="truncate">
                        {docs.find((d: any) => String(d.id) === collectionId)?.title ?? "Unknown"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select a document...</span>
                  )}
                  <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search documents..."
                    value={docSearchQuery}
                    onValueChange={setDocSearchQuery}
                  />
                  {/* File type filter chips */}
                  {docTypes.length > 1 && (
                    <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b">
                      <button
                        type="button"
                        onClick={() => setDocTypeFilter("all")}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors",
                          docTypeFilter === "all"
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-400",
                        )}
                      >
                        All ({docs.length})
                      </button>
                      {docTypes.map((t) => {
                        const count = docs.filter((d: any) => (d.item_type ?? "doc").toLowerCase() === t).length;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setDocTypeFilter(t)}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase transition-colors",
                              docTypeFilter === t
                                ? "bg-slate-800 text-white border-slate-800"
                                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400",
                            )}
                          >
                            {t} ({count})
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <CommandList className="max-h-[250px]">
                    <CommandEmpty>No documents found.</CommandEmpty>
                    <CommandGroup>
                      {filteredDocs.map((doc: any) => (
                        <CommandItem
                          key={doc.id}
                          value={`${doc.title} ${doc.item_type ?? ""}`}
                          onSelect={() => {
                            onChange(ncSet(node, "collectionId", String(doc.id)));
                            setDocPickerOpen(false);
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <Check
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              String(doc.id) === collectionId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="text-[10px] bg-slate-100 px-1 rounded uppercase shrink-0">
                            {doc.item_type ?? doc.source ?? "doc"}
                          </span>
                          <span className="truncate">{doc.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      <Separator />

      <div className="space-y-1.5">
        <Label>Top K Results</Label>
        <Select
          value={String(topK)}
          onValueChange={(v) => onChange(ncSet(node, "topK", Number(v)))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 3, 5, 10, 20].map((k) => (
              <SelectItem key={k} value={String(k)}>
                {k} results
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Search Mode</Label>
        <Select
          value={searchMode}
          onValueChange={(v) => onChange(ncSet(node, "searchMode", v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hybrid">Hybrid (recommended)</SelectItem>
            <SelectItem value="vector">Vector only</SelectItem>
            <SelectItem value="keyword">Keyword only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Score Threshold ({scoreThreshold})</Label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={scoreThreshold}
          onChange={(e) => onChange(ncSet(node, "scoreThreshold", Number(e.target.value)))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0 (include all)</span>
          <span>1 (exact only)</span>
        </div>
      </div>
    </>
  );
}

// ── Skill Call Form ──────────────────────────────────────────────────────────

function SkillCallForm({
  node,
  onChange,
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}) {
  const skillSlug = ncGet<string>(node, "skillSlug", "");
  const passInputThrough = ncGet(node, "passInputThrough", false);

  const handleSkillChange = (newSlug: string, skillName?: string) => {
    // Update slug + clear old skillInputs when switching skills
    const updates: Record<string, unknown> = {
      ...(node.nodeConfig ?? {}),
      skillSlug: newSlug,
      skillInputs: {},
    };
    onChange({
      nodeConfig: updates,
      ...(skillName ? { name: skillName } : {}),
    });
  };

  const handleSkillInputChange = (fieldId: string, value: unknown) => {
    const prev = (node.nodeConfig?.skillInputs as Record<string, unknown>) ?? {};
    onChange(ncSet(node, "skillInputs", { ...prev, [fieldId]: value }));
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Skill call name"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Skill</Label>
        <SkillPicker
          value={skillSlug}
          onChange={handleSkillChange}
        />
      </div>

      {/* Dynamic skill inputs based on skill's schema */}
      {skillSlug && (
        <AgencySkillInputs
          skillSlug={skillSlug}
          skillInputs={(node.nodeConfig?.skillInputs as Record<string, unknown>) ?? {}}
          onFieldChange={handleSkillInputChange}
        />
      )}

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <Label>Pass Input Through</Label>
          <p className="text-xs text-muted-foreground">Forward upstream input to the next node</p>
        </div>
        <Switch
          checked={passInputThrough}
          onCheckedChange={(v) => onChange(ncSet(node, "passInputThrough", v))}
        />
      </div>
    </>
  );
}

// ── Skill Picker (searchable dropdown) ──────────────────────────────────────

function SkillPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (slug: string, name?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = (trpc as any).skills.listForWorkflow.useQuery(
    { search: search || undefined, limit: 50 },
    { enabled: true },
  );

  const skills: Array<{
    slug: string;
    name: string;
    description?: string;
    icon?: string;
    category?: string;
    creditMultiplier?: number;
  }> = data?.skills ?? [];

  const selected = skills.find((s) => s.slug === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent/50 transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <Zap className="h-3.5 w-3.5 text-purple-500 shrink-0" />
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select a skill...</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skills..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-60 py-1">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            ) : skills.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {search ? "No skills match your search" : "No skills available"}
              </p>
            ) : (
              skills.map((skill) => (
                <button
                  key={skill.slug}
                  type="button"
                  onClick={() => {
                    onChange(skill.slug, skill.name);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-accent/50 transition-colors ${
                    value === skill.slug ? "bg-purple-50 dark:bg-purple-950/30" : ""
                  }`}
                >
                  <Zap className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{skill.name}</div>
                    {skill.description && (
                      <div className="text-[10px] text-muted-foreground truncate">{skill.description}</div>
                    )}
                  </div>
                  {skill.creditMultiplier && skill.creditMultiplier !== 1 && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      ×{skill.creditMultiplier}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dynamic Skill Inputs (schema-based form) ────────────────────────────────

interface SkillSchemaSection {
  id: string;
  title: string;
  titleTh?: string;
  icon?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  fields: Array<{
    id: string;
    type: string;
    label: string;
    labelTh?: string;
    placeholder?: string;
    placeholderTh?: string;
    helpText?: string;
    helpTextTh?: string;
    required?: boolean;
    default?: unknown;
    rows?: number;
    options?: Array<{ value: string; label: string; labelTh?: string }>;
    optionGroups?: Record<string, Array<{ value: string; label: string }>>;
    dependsOn?: { field: string; value?: string; notEmpty?: boolean };
  }>;
}

function AgencySkillInputs({
  skillSlug,
  skillInputs,
  onFieldChange,
}: {
  skillSlug: string;
  skillInputs: Record<string, unknown>;
  onFieldChange: (fieldId: string, value: unknown) => void;
}) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const { data: schemaData, isLoading } = (trpc as any).skills.getInputSchema.useQuery(
    { skillId: skillSlug },
    { enabled: !!skillSlug, staleTime: 5 * 60 * 1000 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading skill inputs...</span>
      </div>
    );
  }

  const schema = schemaData?.schema as { sections?: SkillSchemaSection[] } | null;

  // No schema — show JSON fallback
  if (!schemaData?.hasSchema || !schema?.sections) {
    return (
      <div className="space-y-1.5">
        <Label>Input Data (JSON)</Label>
        <Textarea
          value={
            typeof skillInputs === "object" && Object.keys(skillInputs).length > 0
              ? JSON.stringify(skillInputs, null, 2)
              : ""
          }
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              if (typeof parsed === "object" && parsed !== null) {
                for (const [k, v] of Object.entries(parsed)) {
                  onFieldChange(k, v);
                }
              }
            } catch {
              // Let user keep typing invalid JSON
            }
          }}
          placeholder={'{"prompt": "your prompt here"}'}
          rows={4}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          This skill has no input schema. Enter raw JSON data.
        </p>
      </div>
    );
  }

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs font-semibold text-purple-600 uppercase tracking-wider">
        Skill Inputs
      </Label>

      {schema.sections.map((section) => {
        // Filter fields hidden by dependsOn
        const visibleFields = section.fields.filter((field) => {
          if (!field.dependsOn) return true;
          const depVal = skillInputs[field.dependsOn.field];
          if (field.dependsOn.notEmpty) return !!depVal;
          if (field.dependsOn.value !== undefined) return depVal === field.dependsOn.value;
          return true;
        });

        if (visibleFields.length === 0) return null;

        const isCollapsed =
          section.collapsible !== false &&
          (collapsedSections.has(section.id) || (section.collapsed && !collapsedSections.has(`open:${section.id}`)));

        const actuallyCollapsed = collapsedSections.has(section.id)
          ? true
          : section.collapsed && !collapsedSections.has(`open:${section.id}`)
            ? true
            : false;

        return (
          <div key={section.id} className="rounded-md border border-purple-100 bg-purple-50/30">
            {/* Section header */}
            <button
              type="button"
              onClick={() => {
                if (section.collapsible === false) return;
                if (actuallyCollapsed) {
                  setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    next.delete(section.id);
                    next.add(`open:${section.id}`);
                    return next;
                  });
                } else {
                  setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    next.add(section.id);
                    next.delete(`open:${section.id}`);
                    return next;
                  });
                }
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition-colors"
            >
              {section.title}
              {section.collapsible !== false && (
                actuallyCollapsed
                  ? <ChevronRight className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Section fields */}
            {!actuallyCollapsed && (
              <div className="px-3 pb-3 space-y-3">
                {visibleFields.map((field) => {
                  const fieldValue = (skillInputs[field.id] ?? field.default ?? "") as string;

                  // Resolve options for dependent selects
                  let fieldOptions = field.options;
                  if (field.optionGroups) {
                    const depField = field.dependsOn?.field;
                    const parentValue = depField ? (skillInputs[depField] as string) : "";
                    fieldOptions = parentValue
                      ? field.optionGroups[parentValue] ?? []
                      : [];
                  }

                  return (
                    <div key={field.id} className="space-y-1">
                      <label className="block text-xs font-medium text-foreground">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>

                      {field.type === "text" && (
                        <Input
                          value={fieldValue}
                          onChange={(e) => onFieldChange(field.id, e.target.value)}
                          placeholder={field.placeholder}
                          className="h-8 text-xs"
                        />
                      )}

                      {field.type === "textarea" && (
                        <Textarea
                          value={fieldValue}
                          onChange={(e) => onFieldChange(field.id, e.target.value)}
                          placeholder={field.placeholder}
                          rows={field.rows ?? 3}
                          className="text-xs min-h-[60px] resize-y"
                        />
                      )}

                      {field.type === "number" && (
                        <Input
                          type="number"
                          value={fieldValue}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value);
                            onFieldChange(field.id, Number.isNaN(parsed) ? undefined : parsed);
                          }}
                          placeholder={field.placeholder}
                          className="h-8 text-xs"
                        />
                      )}

                      {field.type === "select" && fieldOptions && (
                        <Select
                          value={String(fieldValue)}
                          onValueChange={(v) => onFieldChange(field.id, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="-- Select --" />
                          </SelectTrigger>
                          <SelectContent>
                            {fieldOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {field.type === "boolean" && (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!fieldValue}
                            onCheckedChange={(v) => onFieldChange(field.id, v)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {fieldValue ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      )}

                      {field.type === "imageUpload" && (
                        <Input
                          value={fieldValue}
                          onChange={(e) => onFieldChange(field.id, e.target.value)}
                          placeholder={field.placeholder ?? "Image URL(s), comma-separated"}
                          className="h-8 text-xs"
                        />
                      )}

                      {field.helpText && (
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {field.helpText}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Browser Session Form ────────────────────────────────────────────────────

function BrowserSessionForm({
  node,
  onChange,
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}) {
  const goal = ncGet(node, "goal", "");
  const startUrl = ncGet(node, "startUrl", "");
  const handoffMode = ncGet<string>(node, "handoffMode", "continue_running");
  const handoffSummary = ncGet(node, "handoffSummary", "");

  const handoffHelp =
    handoffMode === "review_required"
      ? BROWSER_SESSION_COPY.reviewRequired
      : handoffMode === "needs_user_input"
        ? BROWSER_SESSION_COPY.needsYourInput
        : BROWSER_SESSION_COPY.continue;

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Browser Session"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Browser Goal</Label>
        <Textarea
          value={goal}
          onChange={(e) => onChange(ncSet(node, "goal", e.target.value))}
          placeholder="Explain what the agency should accomplish in the Browser Session."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Use user-facing language that matches what the AI should do in the browser.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Starting URL</Label>
        <Input
          value={startUrl}
          onChange={(e) => onChange(ncSet(node, "startUrl", e.target.value))}
          placeholder="https://example.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label>When The Session Needs A Human</Label>
        <Select
          value={handoffMode}
          onValueChange={(value) => onChange(ncSet(node, "handoffMode", value))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continue_running">{BROWSER_SESSION_COPY.continue}</SelectItem>
            <SelectItem value="review_required">{BROWSER_SESSION_COPY.reviewRequired}</SelectItem>
            <SelectItem value="needs_user_input">{BROWSER_SESSION_COPY.needsYourInput}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Agency Chat will summarize this Browser Session using {handoffHelp}.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Human Handoff Summary</Label>
        <Textarea
          value={handoffSummary}
          onChange={(e) => onChange(ncSet(node, "handoffSummary", e.target.value))}
          placeholder="Explain what the person should review or provide when the Browser Session pauses."
          rows={3}
        />
      </div>
    </>
  );
}

// ── Human Approval Form ──────────────────────────────────────────────────────

function HumanApprovalForm({
  node,
  onChange,
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}) {
  const approvalMessage = ncGet(node, "approvalMessage", "");
  const timeoutHours = ncGet(node, "timeoutHours", 24);
  const onTimeout = ncGet(node, "onTimeout", "auto_reject");
  const requireAllApprovers = ncGet(node, "requireAllApprovers", false);
  const approvers: string[] = ncGet(node, "approvers", []);
  const [newApprover, setNewApprover] = useState("");

  const addApprover = () => {
    const trimmed = newApprover.trim();
    if (!trimmed) return;
    onChange(ncSet(node, "approvers", [...approvers, trimmed]));
    setNewApprover("");
  };

  const removeApprover = (i: number) =>
    onChange(ncSet(node, "approvers", approvers.filter((_, idx) => idx !== i)));

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Approval step name"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Approval Message</Label>
        <Textarea
          value={approvalMessage}
          onChange={(e) => onChange(ncSet(node, "approvalMessage", e.target.value))}
          placeholder="Describe what approvers need to review..."
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Timeout</Label>
        <Select
          value={String(timeoutHours)}
          onValueChange={(v) => onChange(ncSet(node, "timeoutHours", Number(v)))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 hour</SelectItem>
            <SelectItem value="4">4 hours</SelectItem>
            <SelectItem value="24">24 hours</SelectItem>
            <SelectItem value="48">48 hours</SelectItem>
            <SelectItem value="72">72 hours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>On Timeout</Label>
        <Select
          value={onTimeout}
          onValueChange={(v) => onChange(ncSet(node, "onTimeout", v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto_approve">Auto approve</SelectItem>
            <SelectItem value="auto_reject">Auto reject</SelectItem>
            <SelectItem value="escalate">Escalate to next approver</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label>Require All Approvers</Label>
          <p className="text-xs text-muted-foreground">Off = any one approver is enough</p>
        </div>
        <Switch
          checked={requireAllApprovers}
          onCheckedChange={(v) => onChange(ncSet(node, "requireAllApprovers", v))}
        />
      </div>

      <div className="space-y-2">
        <Label>Approvers</Label>
        <div className="flex gap-2">
          <Input
            value={newApprover}
            onChange={(e) => setNewApprover(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addApprover();
              }
            }}
            placeholder="Email or role name"
            className="text-xs h-7"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={addApprover}
          >
            Add
          </Button>
        </div>

        {approvers.length === 0 && (
          <p className="text-xs text-muted-foreground">No approvers added.</p>
        )}

        {approvers.map((a, i) => (
          <div key={i} className="flex items-center justify-between rounded border px-2 py-1">
            <span className="text-xs truncate">{a}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={() => removeApprover(i)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Conditional Branch Form ──────────────────────────────────────────────────

interface ConditionalRule {
  id: string;
  field: string;
  operator: string;
  value: string;
  targetNodeId: string;
  label?: string;
}

interface CategoryEntry {
  label: string;
  targetNodeId: string;
}

interface ContextCondition {
  operator: string;
  value: string;
  targetNodeId: string;
}

function ConditionalBranchForm({
  node,
  onChange,
  siblingNodes = [],
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
  siblingNodes?: SiblingNode[];
}) {
  const evaluationMode = ncGet<string>(node, "evaluationMode", "rule_based");
  const rules: ConditionalRule[] = ncGet(node, "rules", []);
  const categories: CategoryEntry[] = ncGet(node, "categories", []);
  const contextKey = ncGet<string>(node, "contextKey", "");
  const contextConditions: ContextCondition[] = ncGet(node, "contextConditions", []);
  const classificationLabel = ncGet<string>(node, "classificationLabel", "");
  const classificationDescription = ncGet<string>(node, "classificationDescription", "");
  const defaultTargetNodeId = ncGet<string>(node, "defaultTargetNodeId", "");

  const CB_OPERATORS = ["equals", "contains", "regex", "gt", "lt", "gte", "lte", "exists"];

  const updateRule = (i: number, key: keyof ConditionalRule, value: string) => {
    const updated = rules.map((r, idx) => (idx === i ? { ...r, [key]: value } : r));
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), rules: updated } });
  };

  const addRule = () => {
    const newRule: ConditionalRule = {
      id: `rule-${Date.now()}`,
      field: "$.result",
      operator: "equals",
      value: "",
      targetNodeId: "",
    };
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), rules: [...rules, newRule] } });
  };

  const removeRule = (i: number) => {
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), rules: rules.filter((_, idx) => idx !== i) } });
  };

  const updateCategory = (i: number, key: keyof CategoryEntry, value: string) => {
    const updated = categories.map((c, idx) => (idx === i ? { ...c, [key]: value } : c));
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), categories: updated } });
  };

  const addCategory = () => {
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), categories: [...categories, { label: "", targetNodeId: "" }] } });
  };

  const removeCategory = (i: number) => {
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), categories: categories.filter((_, idx) => idx !== i) } });
  };

  const updateContextCondition = (i: number, key: keyof ContextCondition, value: string) => {
    const updated = contextConditions.map((c, idx) => (idx === i ? { ...c, [key]: value } : c));
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), contextConditions: updated } });
  };

  const addContextCondition = () => {
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), contextConditions: [...contextConditions, { operator: "equals", value: "", targetNodeId: "" }] } });
  };

  const removeContextCondition = (i: number) => {
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), contextConditions: contextConditions.filter((_, idx) => idx !== i) } });
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Branch name"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={node.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Short description"
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Evaluation Mode</Label>
        <Select
          value={evaluationMode}
          onValueChange={(v) => onChange(ncSet(node, "evaluationMode", v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rule_based">Rule-based</SelectItem>
            <SelectItem value="llm_classify">LLM Classification</SelectItem>
            <SelectItem value="context_check">Context Check</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* ── Rule-based mode ── */}
      {evaluationMode === "rule_based" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Rules</Label>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={addRule}>
              <Plus className="h-3 w-3 mr-1" /> Add Rule
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Rules are evaluated in order. First match wins.</p>

          {rules.map((rule, i) => (
            <div key={rule.id} className="rounded border border-amber-200 bg-amber-50/50 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-amber-700">Rule {i + 1}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeRule(i)}>
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              </div>
              <Input
                value={rule.field}
                onChange={(e) => updateRule(i, "field", e.target.value)}
                placeholder="JSONPath (e.g. $.result.status)"
                className="text-xs h-7"
              />
              <div className="flex gap-1.5">
                <Select value={rule.operator} onValueChange={(v) => updateRule(i, "operator", v)}>
                  <SelectTrigger className="h-7 text-xs w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CB_OPERATORS.map((op) => (
                      <SelectItem key={op} value={op}>{op}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rule.operator !== "exists" && (
                  <Input
                    value={rule.value}
                    onChange={(e) => updateRule(i, "value", e.target.value)}
                    placeholder="Value"
                    className="text-xs h-7 flex-1"
                  />
                )}
              </div>
              <Select value={rule.targetNodeId} onValueChange={(v) => updateRule(i, "targetNodeId", v)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Target node..." />
                </SelectTrigger>
                <SelectContent>
                  {siblingNodes.map((sn) => (
                    <SelectItem key={sn.id} value={sn.id}>{sn.name} ({sn.nodeType})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {/* ── LLM Classify mode ── */}
      {evaluationMode === "llm_classify" && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label>Classification Label</Label>
            <Input
              value={classificationLabel}
              onChange={(e) => onChange(ncSet(node, "classificationLabel", e.target.value))}
              placeholder="e.g. sentiment, topic"
              className="text-xs h-7"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={classificationDescription}
              onChange={(e) => onChange(ncSet(node, "classificationDescription", e.target.value))}
              placeholder="Describe what to classify (max 200 chars)"
              rows={2}
              maxLength={200}
              className="text-xs"
            />
            <p className="text-[10px] text-muted-foreground text-right">{classificationDescription.length}/200</p>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Categories</Label>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={addCategory}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {categories.map((cat, i) => (
            <div key={i} className="rounded border border-amber-200 bg-amber-50/50 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <Input
                  value={cat.label}
                  onChange={(e) => updateCategory(i, "label", e.target.value)}
                  placeholder="Category label"
                  className="text-xs h-7 flex-1 mr-2"
                />
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeCategory(i)}>
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              </div>
              <Select value={cat.targetNodeId} onValueChange={(v) => updateCategory(i, "targetNodeId", v)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Target node..." />
                </SelectTrigger>
                <SelectContent>
                  {siblingNodes.map((sn) => (
                    <SelectItem key={sn.id} value={sn.id}>{sn.name} ({sn.nodeType})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {/* ── Context Check mode ── */}
      {evaluationMode === "context_check" && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label>Context Key</Label>
            <Input
              value={contextKey}
              onChange={(e) => onChange(ncSet(node, "contextKey", e.target.value))}
              placeholder="Key name from AgencyRunContext"
              className="text-xs h-7"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Conditions</Label>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={addContextCondition}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {contextConditions.map((cond, i) => (
            <div key={i} className="rounded border border-amber-200 bg-amber-50/50 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Select value={cond.operator} onValueChange={(v) => updateContextCondition(i, "operator", v)}>
                  <SelectTrigger className="h-7 text-xs w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CB_OPERATORS.map((op) => (
                      <SelectItem key={op} value={op}>{op}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cond.operator !== "exists" && (
                  <Input
                    value={cond.value}
                    onChange={(e) => updateContextCondition(i, "value", e.target.value)}
                    placeholder="Value"
                    className="text-xs h-7 flex-1"
                  />
                )}
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeContextCondition(i)}>
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              </div>
              <Select value={cond.targetNodeId} onValueChange={(v) => updateContextCondition(i, "targetNodeId", v)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Target node..." />
                </SelectTrigger>
                <SelectContent>
                  {siblingNodes.map((sn) => (
                    <SelectItem key={sn.id} value={sn.id}>{sn.name} ({sn.nodeType})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* Default target — always visible */}
      <div className="space-y-1.5">
        <Label>Default Target (fallback)</Label>
        <Select
          value={defaultTargetNodeId}
          onValueChange={(v) => onChange(ncSet(node, "defaultTargetNodeId", v))}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Select default target..." />
          </SelectTrigger>
          <SelectContent>
            {siblingNodes.map((sn) => (
              <SelectItem key={sn.id} value={sn.id}>{sn.name} ({sn.nodeType})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">Used when no rule/condition matches</p>
      </div>
    </>
  );
}

// ── Parallel Fan-Out Form ────────────────────────────────────────────────────

interface FanOutBranch {
  id: string;
  targetNodeId: string;
  taskDescription?: string;
  label?: string;
}

function ParallelFanOutForm({
  node,
  onChange,
  siblingNodes = [],
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
  siblingNodes?: SiblingNode[];
}) {
  const branches: FanOutBranch[] = ncGet(node, "branches", []);
  const mergeStrategy = ncGet<string>(node, "mergeStrategy", "wait_all");
  const mergePrompt = ncGet<string>(node, "mergePrompt", "");
  const timeoutMs = ncGet<number>(node, "timeoutMs", 120000);
  const maxConcurrent = ncGet<number>(node, "maxConcurrent", 5);
  const continueOnError = ncGet<boolean>(node, "continueOnError", true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateBranch = (i: number, key: keyof FanOutBranch, value: string) => {
    const updated = branches.map((b, idx) => (idx === i ? { ...b, [key]: value } : b));
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), branches: updated } });
  };

  const addBranch = () => {
    const newBranch: FanOutBranch = { id: `branch-${Date.now()}`, targetNodeId: "", label: "" };
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), branches: [...branches, newBranch] } });
  };

  const removeBranch = (i: number) => {
    if (branches.length <= 2) return;
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), branches: branches.filter((_, idx) => idx !== i) } });
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={node.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Fan-out name" />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={node.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Short description" rows={2} />
      </div>

      <Separator />

      {/* Branches */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Branches</Label>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={addBranch}>
            <Plus className="h-3 w-3 mr-1" /> Add Branch
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Min 2 branches. All run concurrently.</p>

        {branches.map((branch, i) => (
          <div key={branch.id} className="rounded border border-cyan-200 bg-cyan-50/50 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <Input
                value={branch.label ?? ""}
                onChange={(e) => updateBranch(i, "label", e.target.value)}
                placeholder={`Branch ${i + 1} label`}
                className="text-xs h-7 flex-1 mr-2"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                disabled={branches.length <= 2}
                onClick={() => removeBranch(i)}
              >
                <Trash2 className="h-3 w-3 text-red-500" />
              </Button>
            </div>
            <Select value={branch.targetNodeId} onValueChange={(v) => updateBranch(i, "targetNodeId", v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Target node..." />
              </SelectTrigger>
              <SelectContent>
                {siblingNodes.map((sn) => (
                  <SelectItem key={sn.id} value={sn.id}>{sn.name} ({sn.nodeType})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={branch.taskDescription ?? ""}
              onChange={(e) => updateBranch(i, "taskDescription", e.target.value)}
              placeholder="Task description (optional)"
              rows={2}
              className="text-xs"
            />
          </div>
        ))}
      </div>

      <Separator />

      {/* Merge strategy */}
      <div className="space-y-1.5">
        <Label>Merge Strategy</Label>
        <Select value={mergeStrategy} onValueChange={(v) => onChange(ncSet(node, "mergeStrategy", v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wait_all">Wait All</SelectItem>
            <SelectItem value="first_complete">First Complete</SelectItem>
            <SelectItem value="majority">Majority Vote</SelectItem>
            <SelectItem value="custom_prompt">Custom Prompt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mergeStrategy === "custom_prompt" && (
        <div className="space-y-1.5">
          <Label>Merge Prompt</Label>
          <Textarea
            value={mergePrompt}
            onChange={(e) => onChange(ncSet(node, "mergePrompt", e.target.value))}
            placeholder="Prompt for combining branch results (max 1000 chars)"
            rows={3}
            maxLength={1000}
            className="text-xs"
          />
          <p className="text-[10px] text-muted-foreground text-right">{mergePrompt.length}/1000</p>
        </div>
      )}

      {/* Advanced section */}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Advanced Settings
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-2 border-l-2 border-cyan-100">
          <div className="space-y-1.5">
            <Label>Timeout (ms)</Label>
            <Input
              type="number"
              value={timeoutMs}
              onChange={(e) => onChange(ncSet(node, "timeoutMs", Number(e.target.value)))}
              min={1000}
              max={600000}
              className="text-xs h-7"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max Concurrent</Label>
            <Input
              type="number"
              value={maxConcurrent}
              onChange={(e) => onChange(ncSet(node, "maxConcurrent", Number(e.target.value)))}
              min={1}
              max={10}
              className="text-xs h-7"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Continue on Error</Label>
              <p className="text-[10px] text-muted-foreground">Keep going when a branch fails</p>
            </div>
            <Switch
              checked={continueOnError}
              onCheckedChange={(v) => onChange(ncSet(node, "continueOnError", v))}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ── Loop / Retry Form ────────────────────────────────────────────────────────

interface LoopRule {
  field: string;
  operator: string;
  value: string;
}

function LoopRetryForm({
  node,
  onChange,
  siblingNodes = [],
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
  siblingNodes?: SiblingNode[];
}) {
  const loopTargetNodeId = ncGet<string>(node, "loopTargetNodeId", "");
  const exitCondition = ncGet<any>(node, "exitCondition", { mode: "max_iterations", maxIterations: 5 });
  const feedbackMode = ncGet<string>(node, "feedbackMode", "auto");
  const feedbackPrompt = ncGet<string>(node, "feedbackPrompt", "");
  const timeoutMs = ncGet<number>(node, "timeoutMs", 300000);
  const delayMs = ncGet<number>(node, "delayBetweenIterationsMs", 0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const LOOP_OPERATORS = ["equals", "contains", "regex", "gt", "lt", "gte", "lte", "exists"];

  const updateExit = (key: string, value: unknown) => {
    onChange({ nodeConfig: { ...(node.nodeConfig ?? {}), exitCondition: { ...exitCondition, [key]: value } } });
  };

  const rules: LoopRule[] = exitCondition?.rules ?? [];

  const updateRule = (i: number, key: keyof LoopRule, value: string) => {
    const updated = rules.map((r: LoopRule, idx: number) => (idx === i ? { ...r, [key]: value } : r));
    updateExit("rules", updated);
  };

  const addRule = () => updateExit("rules", [...rules, { field: "$.result", operator: "equals", value: "" }]);
  const removeRule = (i: number) => updateExit("rules", rules.filter((_: LoopRule, idx: number) => idx !== i));

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={node.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Loop name" />
      </div>

      <div className="space-y-1.5">
        <Label>Target Node (loop body)</Label>
        <Select value={loopTargetNodeId} onValueChange={(v) => onChange(ncSet(node, "loopTargetNodeId", v))}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Select target node..." />
          </SelectTrigger>
          <SelectContent>
            {siblingNodes.map((sn) => (
              <SelectItem key={sn.id} value={sn.id}>{sn.name} ({sn.nodeType})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label>Exit Condition Mode</Label>
        <Select value={exitCondition?.mode ?? "max_iterations"} onValueChange={(v) => updateExit("mode", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="max_iterations">Max Iterations Only</SelectItem>
            <SelectItem value="rule_based">Rule-based</SelectItem>
            <SelectItem value="llm_evaluate">LLM Evaluation</SelectItem>
            <SelectItem value="context_check">Context Check</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Max Iterations</Label>
        <Input
          type="number"
          value={exitCondition?.maxIterations ?? 5}
          onChange={(e) => updateExit("maxIterations", Math.min(20, Math.max(1, Number(e.target.value))))}
          min={1}
          max={20}
          className="text-xs h-7"
        />
        <p className="text-[10px] text-muted-foreground">Server-side cap: 20</p>
      </div>

      {exitCondition?.mode === "rule_based" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Exit Rules</Label>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={addRule}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {rules.map((rule: LoopRule, i: number) => (
            <div key={i} className="rounded border border-amber-200 bg-amber-50/50 p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Input value={rule.field} onChange={(e) => updateRule(i, "field", e.target.value)} placeholder="$.result.status" className="text-xs h-7 flex-1 mr-1" />
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeRule(i)}>
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              </div>
              <div className="flex gap-1.5">
                <Select value={rule.operator} onValueChange={(v) => updateRule(i, "operator", v)}>
                  <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOOP_OPERATORS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                  </SelectContent>
                </Select>
                {rule.operator !== "exists" && (
                  <Input value={rule.value} onChange={(e) => updateRule(i, "value", e.target.value)} placeholder="Value" className="text-xs h-7 flex-1" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {exitCondition?.mode === "llm_evaluate" && (
        <div className="space-y-1.5">
          <Label>Evaluation Prompt</Label>
          <Textarea
            value={exitCondition?.evaluationPrompt ?? ""}
            onChange={(e) => updateExit("evaluationPrompt", e.target.value)}
            placeholder="Is the result satisfactory? (max 500 chars)"
            rows={2}
            maxLength={500}
            className="text-xs"
          />
        </div>
      )}

      {exitCondition?.mode === "context_check" && (
        <div className="space-y-1.5">
          <Label>Context Key</Label>
          <Input
            value={exitCondition?.contextKey ?? ""}
            onChange={(e) => updateExit("contextKey", e.target.value)}
            placeholder="Key in AgencyRunContext"
            className="text-xs h-7"
          />
        </div>
      )}

      <Separator />

      <div className="space-y-1.5">
        <Label>Feedback Mode</Label>
        <Select value={feedbackMode} onValueChange={(v) => onChange(ncSet(node, "feedbackMode", v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (include previous output)</SelectItem>
            <SelectItem value="custom_prompt">Custom Prompt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {feedbackMode === "custom_prompt" && (
        <div className="space-y-1.5">
          <Label>Feedback Prompt</Label>
          <Textarea
            value={feedbackPrompt}
            onChange={(e) => onChange(ncSet(node, "feedbackPrompt", e.target.value))}
            placeholder="Use {previous_output}, {iteration}, {original_input}"
            rows={2}
            maxLength={500}
            className="text-xs"
          />
        </div>
      )}

      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Advanced Settings
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-2 border-l-2 border-amber-100">
          <div className="space-y-1.5">
            <Label>Delay Between Iterations (ms)</Label>
            <Input type="number" value={delayMs} onChange={(e) => onChange(ncSet(node, "delayBetweenIterationsMs", Number(e.target.value)))} min={0} max={30000} className="text-xs h-7" />
          </div>
          <div className="space-y-1.5">
            <Label>Total Timeout (ms)</Label>
            <Input type="number" value={timeoutMs} onChange={(e) => onChange(ncSet(node, "timeoutMs", Number(e.target.value)))} min={1000} max={600000} className="text-xs h-7" />
          </div>
        </div>
      )}
    </>
  );
}

// ── Skill Discovery Form ────────────────────────────────────────────────────

const SKILL_CATEGORIES = [
  { value: "prompt_enhancement", label: "Prompt Enhancement" },
  { value: "image_generation", label: "Image Generation" },
  { value: "video_generation", label: "Video Generation" },
  { value: "audio_generation", label: "Audio Generation" },
  { value: "chat_assistant", label: "Chat Assistant" },
] as const;

function SkillDiscoveryForm({
  node,
  onChange,
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}) {
  const taskSource = ncGet<string>(node, "taskSource", "static");
  const taskValue = ncGet<string>(node, "taskValue", "");
  const contextKey = ncGet<string>(node, "contextKey", "");
  const confidenceThreshold = ncGet<number>(node, "confidenceThreshold", 0.7);
  const maxResults = ncGet<number>(node, "maxResults", 5);
  const skillCategories = ncGet<string[]>(node, "skillCategories", []);

  const toggleCategory = (cat: string) => {
    const next = skillCategories.includes(cat)
      ? skillCategories.filter((c) => c !== cat)
      : [...skillCategories, cat];
    onChange(ncSet(node, "skillCategories", next));
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Skill discovery node"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Task Source</Label>
        <select
          value={taskSource}
          onChange={(e) => onChange(ncSet(node, "taskSource", e.target.value))}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="static">Static text</option>
          <option value="context">From context key</option>
          <option value="previous_output">Previous node output</option>
        </select>
      </div>

      {taskSource === "static" && (
        <div className="space-y-1.5">
          <Label>Task Description</Label>
          <Input
            value={taskValue}
            onChange={(e) => onChange(ncSet(node, "taskValue", e.target.value))}
            placeholder="e.g. generate a product image"
            maxLength={500}
          />
        </div>
      )}

      {taskSource === "context" && (
        <div className="space-y-1.5">
          <Label>Context Key</Label>
          <Input
            value={contextKey}
            onChange={(e) => onChange(ncSet(node, "contextKey", e.target.value))}
            placeholder="e.g. task_description"
            maxLength={100}
          />
        </div>
      )}

      <Separator />

      <div className="space-y-1.5">
        <Label>Confidence Threshold</Label>
        <Input
          type="number"
          value={confidenceThreshold}
          onChange={(e) => onChange(ncSet(node, "confidenceThreshold", Number(e.target.value)))}
          min={0}
          max={1}
          step={0.05}
          className="text-xs h-7"
        />
        <p className="text-[10px] text-muted-foreground">Minimum confidence score (0.0 - 1.0)</p>
      </div>

      <div className="space-y-1.5">
        <Label>Max Results</Label>
        <Input
          type="number"
          value={maxResults}
          onChange={(e) => onChange(ncSet(node, "maxResults", Number(e.target.value)))}
          min={1}
          max={10}
          className="text-xs h-7"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Skill Categories (optional filter)</Label>
        <div className="flex flex-wrap gap-1.5">
          {SKILL_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => toggleCategory(cat.value)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                skillCategories.includes(cat.value)
                  ? "bg-teal-50 border-teal-300 text-teal-700"
                  : "bg-background border-input text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Error Handler Form ───────────────────────────────────────────────────────

function ErrorHandlerForm({
  node,
  onChange,
  siblingNodes = [],
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
  siblingNodes?: SiblingNode[];
}) {
  const watchedNodeIds = ncGet<string[]>(node, "watchedNodeIds", []);
  const onError = ncGet<string>(node, "onError", "retry");
  const retryConfig = ncGet<{ maxRetries?: number; backoffMs?: number; backoffMultiplier?: number }>(node, "retryConfig", {});
  const fallbackNodeId = ncGet<string>(node, "fallbackNodeId", "");
  const fallbackMessage = ncGet<string>(node, "fallbackMessage", "");
  const skipMessage = ncGet<string>(node, "skipMessage", "");

  // Exclude self and other error handlers from watched node list
  const watchableNodes = siblingNodes.filter(
    (n) => n.nodeType !== "error_handler",
  );

  return (
    <>
      {/* Name */}
      <div>
        <Label className="text-xs font-medium">Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="mt-1"
          placeholder="Error Handler"
        />
      </div>

      {/* Description */}
      <div>
        <Label className="text-xs font-medium">Description</Label>
        <Textarea
          value={node.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value })}
          className="mt-1"
          rows={2}
          placeholder="Handles errors for watched nodes..."
        />
      </div>

      <Separator />

      {/* Watched Nodes */}
      <div>
        <Label className="text-xs font-medium">Watched Nodes</Label>
        <p className="text-[11px] text-muted-foreground mb-1">Select nodes this handler watches for errors</p>
        <div className="space-y-1.5 mt-1">
          {watchableNodes.map((n) => {
            const checked = watchedNodeIds.includes(n.id);
            return (
              <label key={n.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? watchedNodeIds.filter((id) => id !== n.id)
                      : [...watchedNodeIds, n.id];
                    onChange(ncSet(node, "watchedNodeIds", next));
                  }}
                  className="rounded border-gray-300"
                />
                <span>{n.name}</span>
                <span className="text-muted-foreground">({n.nodeType})</span>
              </label>
            );
          })}
          {watchableNodes.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No nodes available to watch</p>
          )}
        </div>
      </div>

      <Separator />

      {/* On Error Strategy */}
      <div>
        <Label className="text-xs font-medium">On Error Strategy</Label>
        <Select value={onError} onValueChange={(v) => onChange(ncSet(node, "onError", v))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="retry">Retry with backoff</SelectItem>
            <SelectItem value="fallback">Fallback to node/message</SelectItem>
            <SelectItem value="skip">Skip with message</SelectItem>
            <SelectItem value="terminate">Terminate run</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Retry Config */}
      {onError === "retry" && (
        <div className="space-y-2 pl-2 border-l-2 border-red-200">
          <div>
            <Label className="text-xs">Max Retries (1-5)</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={retryConfig.maxRetries ?? 3}
              onChange={(e) =>
                onChange(ncSet(node, "retryConfig", { ...retryConfig, maxRetries: Math.min(5, Math.max(1, Number(e.target.value))) }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Backoff (ms)</Label>
            <Input
              type="number"
              min={50}
              value={retryConfig.backoffMs ?? 100}
              onChange={(e) =>
                onChange(ncSet(node, "retryConfig", { ...retryConfig, backoffMs: Number(e.target.value) }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Backoff Multiplier</Label>
            <Input
              type="number"
              min={1}
              step={0.5}
              value={retryConfig.backoffMultiplier ?? 2}
              onChange={(e) =>
                onChange(ncSet(node, "retryConfig", { ...retryConfig, backoffMultiplier: Number(e.target.value) }))
              }
              className="mt-1"
            />
          </div>
        </div>
      )}

      {/* Fallback Config */}
      {onError === "fallback" && (
        <div className="space-y-2 pl-2 border-l-2 border-red-200">
          <div>
            <Label className="text-xs">Fallback Node</Label>
            <Select value={fallbackNodeId} onValueChange={(v) => onChange(ncSet(node, "fallbackNodeId", v))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select node..." /></SelectTrigger>
              <SelectContent>
                {siblingNodes
                  .filter((n) => n.nodeType !== "error_handler")
                  .map((n) => (
                    <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fallback Message (if no node)</Label>
            <Textarea
              value={fallbackMessage}
              onChange={(e) => onChange(ncSet(node, "fallbackMessage", e.target.value))}
              className="mt-1"
              rows={2}
              placeholder="Default fallback response..."
            />
          </div>
        </div>
      )}

      {/* Skip Config */}
      {onError === "skip" && (
        <div className="pl-2 border-l-2 border-red-200">
          <Label className="text-xs">Skip Message</Label>
          <Textarea
            value={skipMessage}
            onChange={(e) => onChange(ncSet(node, "skipMessage", e.target.value))}
            className="mt-1"
            rows={2}
            placeholder="Step skipped due to error"
          />
        </div>
      )}
    </>
  );
}

// ── Data Transform Form ──────────────────────────────────────────────────────

function DataTransformForm({
  node,
  onChange,
}: {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}) {
  const transformMode = ncGet<string>(node, "transformMode", "jsonpath");
  const jsonpathExpression = ncGet<string>(node, "jsonpathExpression", "");
  const template = ncGet<string>(node, "template", "");
  const filterCondition = ncGet<{ field?: string; operator?: string; value?: string }>(node, "filterCondition", {});
  const outputKey = ncGet<string>(node, "outputKey", "");

  return (
    <>
      {/* Name */}
      <div>
        <Label className="text-xs font-medium">Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="mt-1"
          placeholder="Data Transform"
        />
      </div>

      {/* Description */}
      <div>
        <Label className="text-xs font-medium">Description</Label>
        <Textarea
          value={node.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value })}
          className="mt-1"
          rows={2}
          placeholder="Transforms data from previous node..."
        />
      </div>

      <Separator />

      {/* Transform Mode */}
      <div>
        <Label className="text-xs font-medium">Transform Mode</Label>
        <Select value={transformMode} onValueChange={(v) => onChange(ncSet(node, "transformMode", v))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="jsonpath">JSONPath extraction</SelectItem>
            <SelectItem value="template">Mustache template</SelectItem>
            <SelectItem value="filter">Array filter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* JSONPath Expression */}
      {transformMode === "jsonpath" && (
        <div>
          <Label className="text-xs">JSONPath Expression</Label>
          <Input
            value={jsonpathExpression}
            onChange={(e) => onChange(ncSet(node, "jsonpathExpression", e.target.value))}
            className="mt-1 font-mono text-xs"
            placeholder="$.results[*].title"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">e.g. $.data.items[*].name</p>
        </div>
      )}

      {/* Template */}
      {transformMode === "template" && (
        <div>
          <Label className="text-xs">Mustache Template</Label>
          <Textarea
            value={template}
            onChange={(e) => onChange(ncSet(node, "template", e.target.value))}
            className="mt-1 font-mono text-xs"
            rows={4}
            placeholder={"Title: {{title}}\nSummary: {{summary}}"}
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">Use {"{{field}}"} for values. HTML is auto-escaped.</p>
        </div>
      )}

      {/* Filter Condition */}
      {transformMode === "filter" && (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Field</Label>
            <Input
              value={filterCondition.field ?? ""}
              onChange={(e) =>
                onChange(ncSet(node, "filterCondition", { ...filterCondition, field: e.target.value }))
              }
              className="mt-1"
              placeholder="score"
            />
          </div>
          <div>
            <Label className="text-xs">Operator</Label>
            <Select
              value={filterCondition.operator ?? "equals"}
              onValueChange={(v) =>
                onChange(ncSet(node, "filterCondition", { ...filterCondition, operator: v }))
              }
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Equals</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="gt">Greater than</SelectItem>
                <SelectItem value="lt">Less than</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Value</Label>
            <Input
              value={filterCondition.value ?? ""}
              onChange={(e) =>
                onChange(ncSet(node, "filterCondition", { ...filterCondition, value: e.target.value }))
              }
              className="mt-1"
              placeholder="0.8"
            />
          </div>
        </div>
      )}

      <Separator />

      {/* Output Key */}
      <div>
        <Label className="text-xs font-medium">Output Key (optional)</Label>
        <Input
          value={outputKey}
          onChange={(e) => onChange(ncSet(node, "outputKey", e.target.value))}
          className="mt-1"
          placeholder="transformed_data"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">Store result in context under this key</p>
      </div>
    </>
  );
}

// ── Smart Model Config ───────────────────────────────────────────────────────

const CAPABILITY_OPTIONS = [
  { key: "supportsVision" as const, label: "Vision", description: "Image analysis" },
  { key: "supportsThinking" as const, label: "Thinking", description: "Extended reasoning" },
  { key: "supportsFunctionTools" as const, label: "Function Tools", description: "Tool calling" },
  { key: "supportsStructuredOutputs" as const, label: "Structured Outputs", description: "JSON schema output" },
  { key: "supportsWebSearch" as const, label: "Web Search", description: "Live web search" },
  { key: "supportsCodeExecution" as const, label: "Code Execution", description: "Run code" },
  { key: "supportsComputerUse" as const, label: "Computer Use", description: "Browser control" },
] as const;

type ModelReqs = NonNullable<import("./nodes/types").AgencyNodeData["modelRequirements"]>;

function SmartModelConfig({
  requirements,
  onChange,
}: {
  requirements: ModelReqs;
  onChange: (reqs: ModelReqs) => void;
}) {
  const resolveQuery = trpc.agency.resolveModel.useQuery(
    { requirements },
    { staleTime: 10_000, keepPreviousData: true },
  );

  return (
    <div className="space-y-3">
      {/* Strategy */}
      <div>
        <Label className="text-xs font-medium">Strategy</Label>
        <Select
          value={requirements.strategy ?? "cheapest"}
          onValueChange={(v) => onChange({ ...requirements, strategy: v as ModelReqs["strategy"] })}
        >
          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cheapest">Cheapest matching model</SelectItem>
            <SelectItem value="balanced">Balanced (cost + quality)</SelectItem>
            <SelectItem value="best">Best quality (highest priority)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Capabilities */}
      <div>
        <Label className="text-xs font-medium mb-1.5 block">Required Capabilities</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {CAPABILITY_OPTIONS.map(({ key, label, description }) => {
            const checked = requirements[key] === true;
            return (
              <label
                key={key}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer transition-colors",
                  checked ? "border-primary bg-primary/5" : "border-input hover:bg-accent/50",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = { ...requirements, [key]: checked ? undefined : true };
                    onChange(next);
                  }}
                  className="rounded border-gray-300 h-3.5 w-3.5"
                />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-[10px] text-muted-foreground">{description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Resolved Model Preview */}
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-[10px] text-muted-foreground mb-0.5">Auto-selected model</div>
        {resolveQuery.isLoading ? (
          <div className="text-xs text-muted-foreground">Resolving...</div>
        ) : resolveQuery.data?.modelId ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{resolveQuery.data.modelId}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0">{resolveQuery.data.provider}</Badge>
          </div>
        ) : (
          <div className="text-xs text-destructive">No matching model found — adjust capabilities</div>
        )}
      </div>
    </div>
  );
}
