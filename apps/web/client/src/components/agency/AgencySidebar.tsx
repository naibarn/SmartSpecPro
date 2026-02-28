import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Bot, Briefcase, FileText, Code, BarChart, Calendar, Search, PenTool } from "lucide-react";

export function AgencySidebar() {
    const { data, isLoading } = trpc.agency.listAgentTemplates.useQuery();

    const onDragStart = (event: React.DragEvent, nodeType: string, templateData: any) => {
        event.dataTransfer.setData("application/reactflow", nodeType);
        event.dataTransfer.setData("application/templateData", JSON.stringify(templateData));
        event.dataTransfer.effectAllowed = "copy";
    };

    const getIcon = (iconName: string) => {
        switch (iconName) {
            case "briefcase": return <Briefcase className="h-4 w-4" />;
            case "pen-tool": return <PenTool className="h-4 w-4" />;
            case "code": return <Code className="h-4 w-4" />;
            case "bar-chart": return <BarChart className="h-4 w-4" />;
            case "calendar": return <Calendar className="h-4 w-4" />;
            case "search": return <Search className="h-4 w-4" />;
            case "file-text": return <FileText className="h-4 w-4" />;
            default: return <Bot className="h-4 w-4" />;
        }
    };

    return (
        <div className="w-64 bg-slate-50 border-r border-slate-200 h-full flex flex-col shadow-inner z-10 shrink-0">
            <div className="p-4 border-b border-slate-200 bg-white">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-indigo-500" />
                    Agent Library
                </h3>
                <p className="text-xs text-slate-500 mt-1">Drag and drop roles directly onto the canvas</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {isLoading ? (
                    <div className="text-sm text-center text-slate-500 py-8 animate-pulse">Loading library...</div>
                ) : (
                    Object.entries(
                        (data?.agentTemplates || []).reduce((acc: any, template: any) => {
                            if (!acc[template.category]) acc[template.category] = [];
                            acc[template.category].push(template);
                            return acc;
                        }, {})
                    ).map(([category, templates]: [string, any]) => (
                        <div key={category} className="space-y-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{category}</h4>
                            <div className="grid gap-2">
                                {templates.map((template: any) => (
                                    <div
                                        key={template.id}
                                        className="group bg-white border border-slate-200 rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-indigo-400 hover:shadow shadow-sm transition-all text-sm relative overflow-hidden"
                                        draggable
                                        onDragStart={(e) => onDragStart(e, "agentNode", template)}
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="flex items-center gap-2 font-medium text-slate-700">
                                            <span className="text-indigo-600 group-hover:scale-110 transition-transform">
                                                {getIcon(template.icon)}
                                            </span>
                                            {template.role}
                                        </div>
                                        {template.description && (
                                            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{template.description}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
