import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Bot, Crown, GitBranch, Merge, Database, Zap, UserCheck,
  MonitorPlay, GitFork, Layers, RefreshCw, Sparkles,
  ShieldAlert, Braces, Brain, Plug,
  Briefcase, FileText, Code, BarChart, Calendar, Search, PenTool,
  ChevronDown, Info, Wrench,
} from "lucide-react";
import { CustomToolCreator } from "./CustomToolCreator";
import { GuardrailsPanel } from "./guardrails/GuardrailsPanel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Static node-type sections for the "Nodes" tab
const NODE_TYPE_SECTIONS = [
  {
    label: "AI Agents",
    color: "indigo",
    items: [
      {
        nodeType: "agent",
        label: "Agent",
        description: "AI worker with custom instructions & tools",
        detail: "Versatile AI worker that can handle any task. Change its instructions and tools to create any role — researcher, writer, coder, analyst, support agent, and more. One node type, unlimited possibilities.",
        icon: <Bot className="h-3.5 w-3.5" />,
        color: "text-indigo-500",
      },
      {
        nodeType: "supervisor",
        label: "Supervisor",
        description: "AI coordinator that manages other agents",
        detail: "Smart team leader that uses AI to decide which agent handles each task, in what order, and when to loop back for revisions. No manual IF/ELSE conditions needed — the LLM makes routing decisions automatically.",
        icon: <Crown className="h-3.5 w-3.5" />,
        color: "text-amber-500",
      },
      {
        nodeType: "autonomous_agent",
        label: "Autonomous Agent",
        description: "AI agent that plans, delegates, and self-evaluates",
        detail: "Advanced agent that autonomously decomposes complex tasks into sub-tasks, executes them via ReAct loops, delegates to other agents, and reflects on quality to re-plan if needed. Supports long-term memory across runs.",
        icon: <Brain className="h-3.5 w-3.5" />,
        color: "text-purple-500",
      },
    ],
  },
  {
    label: "Flow Control",
    color: "blue",
    items: [
      {
        nodeType: "router",
        label: "Router / Decision",
        description: "Directs messages to the right agent",
        detail: "Routes incoming messages to the correct agent based on rules: keyword matching, regex patterns, or AI-powered classification. Includes a fallback default route for unmatched messages.",
        icon: <GitBranch className="h-3.5 w-3.5" />,
        color: "text-blue-500",
      },
      {
        nodeType: "aggregator",
        label: "Aggregator",
        description: "Combines results from multiple agents",
        detail: "Collects outputs from several agents running in parallel and merges them into one result. Supports multiple strategies: first response wins, majority vote, AI-powered merge, or simple concatenation.",
        icon: <Merge className="h-3.5 w-3.5" />,
        color: "text-green-500",
      },
      {
        nodeType: "conditional_branch",
        label: "Conditional Branch",
        description: "Branches flow based on rules or AI classification",
        detail: "Evaluates the previous output and routes to different branches. Three modes: rule-based (field operators), LLM classification (AI categorizes content), or context check (reads shared context). Always includes a default fallback branch.",
        icon: <GitFork className="h-3.5 w-3.5" />,
        color: "text-amber-500",
      },
      {
        nodeType: "parallel_fan_out",
        label: "Parallel Fan-Out",
        description: "Runs multiple branches concurrently",
        detail: "Splits execution into N parallel branches that run simultaneously, then merges results. Merge strategies: wait for all, first to complete, majority vote, or custom AI-powered merge. Configurable concurrency limits.",
        icon: <Layers className="h-3.5 w-3.5" />,
        color: "text-violet-500",
      },
      {
        nodeType: "loop_retry",
        label: "Loop / Retry",
        description: "Repeats a step until condition is met",
        detail: "Loops a target node until an exit condition is satisfied. Exit modes: max iterations, rule-based check, LLM evaluation, or context check. Built-in safety guards: max 20 iterations, configurable timeout, credit cap.",
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        color: "text-emerald-500",
      },
    ],
  },
  {
    label: "Data & Skills",
    color: "teal",
    items: [
      {
        nodeType: "knowledge_base",
        label: "Knowledge Base",
        description: "Searches your documents via RAG",
        detail: "Retrieves relevant information from your uploaded document collections using RAG (Retrieval-Augmented Generation). Agents can use this to answer questions based on your company's actual data, manuals, and policies.",
        icon: <Database className="h-3.5 w-3.5" />,
        color: "text-teal-500",
      },
      {
        nodeType: "skill_call",
        label: "Skill Call",
        description: "Runs a SmartSpec skill in the workflow",
        detail: "Executes any existing SmartSpec skill (image generation, content creation, data analysis, etc.) as a step in the agent workflow. Connects AI agent intelligence with SmartSpec's specialized skill engine.",
        icon: <Zap className="h-3.5 w-3.5" />,
        color: "text-purple-500",
      },
      {
        nodeType: "skill_discovery",
        label: "Skill Discovery",
        description: "Auto-detects the best skill for a task",
        detail: "Analyzes the current context and automatically selects the most appropriate SmartSpec skill. Configurable confidence threshold and category filters. Returns matched skills ranked by relevance.",
        icon: <Sparkles className="h-3.5 w-3.5" />,
        color: "text-pink-500",
      },
      {
        nodeType: "data_transform",
        label: "Data Transform",
        description: "Transforms data between nodes",
        detail: "Processes the previous node's output using JSONPath extraction, Mustache template rendering, or array filtering. Useful for reformatting data, extracting specific fields, or filtering results before passing to the next node.",
        icon: <Braces className="h-3.5 w-3.5" />,
        color: "text-slate-500",
      },
    ],
  },
  {
    label: "Human in the Loop",
    color: "orange",
    items: [
      {
        nodeType: "browser_session",
        label: "Browser Session",
        description: "Launches a Browser Session for AI work and review",
        detail: "Starts a shared Browser Session the agency can use, then hands it back as Continue in Browser, Review Required, or Needs Your Input without exposing low-level runtime terms.",
        icon: <MonitorPlay className="h-3.5 w-3.5" />,
        color: "text-cyan-500",
      },
      {
        nodeType: "human_approval",
        label: "Human Approval",
        description: "Pauses for human review & decision",
        detail: "Pauses the workflow and sends a notification to designated approvers. Waits for a human to approve, reject, or modify before continuing. Configurable timeout with auto-approve/reject/escalate policies.",
        icon: <UserCheck className="h-3.5 w-3.5" />,
        color: "text-orange-500",
      },
    ],
  },
  {
    label: "Resilience",
    color: "red",
    items: [
      {
        nodeType: "error_handler",
        label: "Error Handler",
        description: "Catches errors and applies recovery strategy",
        detail: "Watches selected nodes for errors and applies a recovery strategy: retry with exponential backoff (max 5 attempts), redirect to a fallback node, skip with a message, or terminate the run. Error details are scrubbed for security.",
        icon: <ShieldAlert className="h-3.5 w-3.5" />,
        color: "text-red-500",
      },
    ],
  },
  {
    label: "Integrations",
    color: "orange",
    items: [
      {
        nodeType: "mcp_server",
        label: "MCP Server",
        description: "Connect to external MCP tools and resources",
        detail: "Connects to an external MCP (Model Context Protocol) server to call tools, read resources, or list capabilities. Supports HTTP, Streamable HTTP, and stdio transports. Configure via Admin > MCP Servers, then assign to this agent.",
        icon: <Plug className="h-3.5 w-3.5" />,
        color: "text-orange-500",
      },
    ],
  },
];

const ICON_MAP: Record<string, React.ReactNode> = {
  briefcase: <Briefcase className="h-4 w-4" />,
  "pen-tool": <PenTool className="h-4 w-4" />,
  code: <Code className="h-4 w-4" />,
  "bar-chart": <BarChart className="h-4 w-4" />,
  calendar: <Calendar className="h-4 w-4" />,
  search: <Search className="h-4 w-4" />,
  "file-text": <FileText className="h-4 w-4" />,
};

export interface NodeTemplateData {
  nodeType: string;
  name: string;
  description?: string;
  instructions?: string;
  defaultModel?: string;
  isEntryPoint?: boolean;
  nodeConfig?: Record<string, unknown>;
  defaultTools?: unknown[];
}

interface AgencySidebarProps {
  onNodeAdd?: (templateData: NodeTemplateData) => void;
  agencyId?: string;
}

export function AgencySidebar({ onNodeAdd, agencyId }: AgencySidebarProps) {
  const [activeTab, setActiveTab] = useState<"nodes" | "templates" | "guardrails">("nodes");
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(NODE_TYPE_SECTIONS.map((s) => s.label)),
  );
  const [customToolCreatorOpen, setCustomToolCreatorOpen] = useState(false);
  const { data, isLoading } = trpc.agency.listAgentTemplates.useQuery();

  const toggleSection = (label: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const onDragStart = (event: React.DragEvent, templateData: NodeTemplateData) => {
    event.dataTransfer.setData("application/reactflow", templateData.nodeType);
    event.dataTransfer.setData("application/templateData", JSON.stringify(templateData));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-60 bg-slate-50 border-r border-slate-200 h-full flex flex-col z-10 shrink-0">
      {/* Tab bar */}
      <div className="flex border-b border-slate-200 bg-white">
        {(["nodes", "templates", "guardrails"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "flex-1 py-2.5 text-xs font-medium capitalize transition-colors",
              activeTab === tab
                ? "text-indigo-600 border-b-2 border-indigo-500"
                : "text-slate-500 hover:text-slate-700",
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Nodes Tab ── */}
        {activeTab === "nodes" && (
          <div className="p-3 space-y-2">
            {NODE_TYPE_SECTIONS.map((section) => (
              <div key={section.label}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
                  onClick={() => toggleSection(section.label)}
                >
                  {section.label}
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      openSections.has(section.label) && "rotate-180",
                    )}
                  />
                </button>

                {openSections.has(section.label) && (
                  <div className="grid gap-1.5 mt-1">
                    {section.items.map((item) => {
                      const templateData: NodeTemplateData = {
                        nodeType: item.nodeType,
                        name: item.label,
                        description: item.description,
                      };
                      return (
                        <Tooltip key={item.nodeType} delayDuration={400}>
                          <TooltipTrigger asChild>
                            <div
                              className="group bg-white border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                              draggable
                              onDragStart={(e) => onDragStart(e, templateData)}
                              onClick={() => onNodeAdd?.(templateData)}
                            >
                              <div className={cn("flex items-center gap-2 font-medium text-slate-700 text-xs", item.color)}>
                                {item.icon}
                                <span className="text-slate-700">{item.label}</span>
                                <Info className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                {item.description}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" align="start" className="max-w-[260px] text-xs leading-relaxed">
                            <p className="font-semibold mb-1">{item.label}</p>
                            <p>{item.detail}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Templates Tab ── */}
        {activeTab === "templates" && (
          <div className="p-3 space-y-4">
            <p className="text-xs text-slate-500">Click or drag templates onto the canvas</p>

            {isLoading ? (
              <div className="text-sm text-center text-slate-500 py-8 animate-pulse">Loading...</div>
            ) : (
              Object.entries(
                (data?.agentTemplates ?? []).reduce((acc: Record<string, unknown[]>, template: unknown) => {
                  const t = template as { category: string };
                  if (!acc[t.category]) acc[t.category] = [];
                  acc[t.category].push(template);
                  return acc;
                }, {}),
              ).map(([category, templates]) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{category}</h4>
                  <div className="grid gap-1.5">
                    {(templates as unknown[]).map((template: unknown) => {
                      const t = template as { id: string; icon?: string; role: string; description?: string; name?: string; instructions?: string; defaultModel?: string; isEntryPoint?: boolean };
                      const templateData: NodeTemplateData = {
                        nodeType: "agent",
                        name: t.role,
                        description: t.description,
                        instructions: t.instructions,
                        defaultModel: t.defaultModel,
                        isEntryPoint: t.isEntryPoint,
                      };
                      return (
                        <div
                          key={t.id}
                          className="group bg-white border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all text-sm"
                          draggable
                          onDragStart={(e) => onDragStart(e, templateData)}
                          onClick={() => onNodeAdd?.(templateData)}
                        >
                          <div className="flex items-center gap-2 font-medium text-slate-700 text-xs">
                            <span className="text-indigo-500">
                              {ICON_MAP[t.icon ?? ""] ?? <Bot className="h-3.5 w-3.5" />}
                            </span>
                            {t.role}
                          </div>
                          {t.description && (
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">{t.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Guardrails Tab ── */}
        {activeTab === "guardrails" && agencyId && (
          <GuardrailsPanel agencyId={agencyId} />
        )}
        {activeTab === "guardrails" && !agencyId && (
          <div className="p-6 text-center text-sm text-slate-400">
            Save the agency first to manage guardrails.
          </div>
        )}
      </div>

      {/* Custom Tools shortcut */}
      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg bg-white border border-slate-200 p-2.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:shadow-sm transition-all"
          onClick={() => setCustomToolCreatorOpen(true)}
          data-testid="manage-custom-tools-btn"
        >
          <Wrench className="h-3.5 w-3.5 text-slate-500" />
          Create Custom Tool
        </button>
      </div>

      <CustomToolCreator
        open={customToolCreatorOpen}
        onClose={() => setCustomToolCreatorOpen(false)}
      />
    </div>
  );
}
