import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Bot, Crown, GitBranch, Merge, Database, Zap, UserCheck,
  Briefcase, FileText, Code, BarChart, Calendar, Search, PenTool,
  ChevronDown, Info,
} from "lucide-react";
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
    ],
  },
  {
    label: "Human in the Loop",
    color: "orange",
    items: [
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
}

export function AgencySidebar({ onNodeAdd }: AgencySidebarProps) {
  const [activeTab, setActiveTab] = useState<"nodes" | "templates">("nodes");
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(NODE_TYPE_SECTIONS.map((s) => s.label)),
  );
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
        {(["nodes", "templates"] as const).map((tab) => (
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
      </div>
    </div>
  );
}
