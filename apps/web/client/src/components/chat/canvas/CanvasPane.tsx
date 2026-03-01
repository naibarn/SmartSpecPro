import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, History, Code2, BarChart3, Table2, FileText, Globe, Component, GitBranch, Image } from "lucide-react";
import { CodeRenderer } from "./renderers/CodeRenderer";
import { ChartRenderer } from "./renderers/ChartRenderer";
import { TableRenderer } from "./renderers/TableRenderer";
import { MarkdownRenderer } from "./renderers/MarkdownRenderer";
import { SvgRenderer } from "./renderers/SvgRenderer";
import { MermaidRenderer } from "./renderers/MermaidRenderer";
import { ArtifactSandbox } from "./ArtifactSandbox";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  code: Code2,
  chart: BarChart3,
  table: Table2,
  markdown: FileText,
  react: Component,
  html: Globe,
  mermaid: GitBranch,
  svg: Image,
};

interface CanvasPaneProps {
  conversationId: number;
  selectedArtifactId?: string | null;
  onClose: () => void;
}

export function CanvasPane({ conversationId, selectedArtifactId, onClose }: CanvasPaneProps) {
  const [activeId, setActiveId] = useState<string | null>(selectedArtifactId ?? null);
  const [showVersions, setShowVersions] = useState(false);

  const { data: artifacts = [] } = trpc.artifact.getArtifacts.useQuery(
    { conversationId },
    { enabled: conversationId > 0 },
  );

  const activeArtifact = artifacts.find((a: any) => a.id === activeId) ?? artifacts[0];

  const { data: versions = [] } = trpc.artifact.getArtifactVersions.useQuery(
    { artifactId: activeArtifact?.id ?? "" },
    { enabled: showVersions && !!activeArtifact?.id },
  );

  if (artifacts.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="text-sm font-medium">Canvas</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">No artifacts in this conversation</p>
        </div>
      </div>
    );
  }

  const TypeIcon = TYPE_ICONS[activeArtifact?.artifactType] ?? Code2;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{activeArtifact?.title || "Artifact"}</span>
          <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
            {activeArtifact?.artifactType}
          </Badge>
          {(activeArtifact?.version ?? 1) > 1 && (
            <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
              v{activeArtifact.version}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowVersions(!showVersions)}
            title="Version history"
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Artifact selector (if multiple) */}
      {artifacts.length > 1 && (
        <div className="border-b px-3 py-1.5">
          <Select value={activeId ?? ""} onValueChange={setActiveId}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select artifact" />
            </SelectTrigger>
            <SelectContent>
              {artifacts.map((a: any) => {
                const Icon = TYPE_ICONS[a.artifactType] ?? Code2;
                return (
                  <SelectItem key={a.id} value={a.id}>
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3" />
                      <span>{a.title || a.artifactType}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Version history */}
      {showVersions && versions.length > 0 && (
        <div className="border-b px-3 py-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Versions</p>
          <div className="flex flex-wrap gap-1">
            {versions.map((v: any) => (
              <Button
                key={v.id}
                variant={v.id === activeId ? "default" : "outline"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setActiveId(v.id)}
              >
                v{v.version}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {activeArtifact && renderArtifact(activeArtifact)}
        </div>
      </ScrollArea>
    </div>
  );
}

function renderArtifact(artifact: any) {
  const { artifactType, content, language } = artifact;

  switch (artifactType) {
    case "code":
      return <CodeRenderer content={content} language={language} />;
    case "chart":
      return <ChartRenderer content={content} />;
    case "table":
      return <TableRenderer content={content} />;
    case "markdown":
      return <MarkdownRenderer content={content} />;
    case "svg":
      return <SvgRenderer content={content} />;
    case "mermaid":
      return <MermaidRenderer content={content} />;
    case "react":
    case "html":
      return <ArtifactSandbox artifactType={artifactType} content={content} />;
    default:
      return (
        <pre className="overflow-x-auto rounded-md border p-4 text-sm">{content}</pre>
      );
  }
}
