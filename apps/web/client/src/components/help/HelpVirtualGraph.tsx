import { useMemo } from "react";
import { useLocation } from "wouter";
import KnowledgeGraphView from "@/components/library/KnowledgeGraphView";
import { useIsMobile } from "@/hooks/useMobile";

type HelpGraphNodeKind = "active" | "outgoing" | "backlink" | "shared_tag";

interface HelpGraphNode {
  slug: string;
  title: string;
  description: string;
  kind: HelpGraphNodeKind;
  tags: string[];
  sharedTags: string[];
}

interface HelpTopicGraph {
  outgoing: HelpGraphNode[];
  backlinks: HelpGraphNode[];
  sharedTags: HelpGraphNode[];
}

interface HelpVirtualGraphProps {
  slug: string;
  title: string;
  graph: HelpTopicGraph;
  locale: string;
  compact?: boolean;
}

function stableHelpNodeId(slug: string): number {
  let hash = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (hash * 31 + slug.charCodeAt(index)) >>> 0;
  }
  return 1_000_000 + (hash % 900_000_000);
}

export function HelpVirtualGraph({
  slug,
  title,
  graph,
  compact = false,
}: HelpVirtualGraphProps) {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const effectiveCompact = compact || isMobile;
  const { idToSlug, activeNote, outgoing, backlinks, sharedTags } = useMemo(() => {
    const slugById = new Map<number, string>();
    const register = (nodeSlug: string) => {
      const id = stableHelpNodeId(nodeSlug);
      slugById.set(id, nodeSlug);
      return id;
    };

    const activeId = register(slug);
    const toRelationNode = (node: HelpGraphNode) => {
      const libraryItemId = register(node.slug);
      return {
        libraryItemId,
        title: node.title,
        logicalPath: node.slug,
        rawReference: node.slug,
        status: "resolved",
      };
    };

    return {
      idToSlug: slugById,
      activeNote: {
        libraryItemId: activeId,
        title,
        logicalPath: slug,
      },
      outgoing: graph.outgoing.map(toRelationNode),
      backlinks: graph.backlinks.map(toRelationNode),
      sharedTags: graph.sharedTags.map((node) => ({
        libraryItemId: register(node.slug),
        title: node.title,
        logicalPath: node.slug,
        sharedTags: node.sharedTags,
      })),
    };
  }, [graph.backlinks, graph.outgoing, graph.sharedTags, slug, title]);

  return (
    <div
      className={
        effectiveCompact
          ? "w-full overflow-hidden"
          : "h-[760px] min-h-0 w-full"
      }
    >
      <KnowledgeGraphView
        compact={effectiveCompact}
        fillAvailable={!effectiveCompact}
        activeNote={activeNote}
        outgoing={outgoing}
        backlinks={backlinks}
        sharedTags={sharedTags}
        semanticRelated={[]}
        onOpenItem={(itemId) => {
          const targetSlug = idToSlug.get(itemId);
          if (targetSlug) {
            navigate(`/help/${targetSlug}`);
          }
        }}
      />
    </div>
  );
}
