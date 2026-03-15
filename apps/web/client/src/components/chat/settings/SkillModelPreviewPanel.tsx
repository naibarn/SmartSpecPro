import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface SkillModelPreviewPanelProps {
  skillId: number;
  /** When changed, triggers a debounced re-fetch of the preview */
  requirementsVersion?: number | string;
}

export function SkillModelPreviewPanel({
  skillId,
  requirementsVersion,
}: SkillModelPreviewPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fetchEnabled, setFetchEnabled] = useState(false);

  const { data, isFetching, refetch } = trpc.skills.previewModelResolution.useQuery(
    { skillId },
    { enabled: fetchEnabled, staleTime: 0 },
  );

  // Enable fetch when panel opens
  useEffect(() => {
    if (isOpen && !fetchEnabled) {
      setFetchEnabled(true);
    }
  }, [isOpen, fetchEnabled]);

  // Debounced auto-refresh when requirementsVersion changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fetchEnabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refetch();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [requirementsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Model Preview
        </CollapsibleTrigger>
        {isOpen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>
      <CollapsibleContent className="mt-2 space-y-1 px-3 pb-2 text-sm">
        {isFetching && !data && (
          <p className="text-muted-foreground">Loading...</p>
        )}
        {data && <PreviewResult data={data} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreviewResult({
  data,
}: {
  data: {
    modelId: string | null;
    modelSource: string;
    matchedCapabilities: string[];
    requirementsFallback: boolean;
    availableModelCount: number;
  };
}) {
  // Requirements match (no fallback)
  if (data.modelSource === "requirements_match" && !data.requirementsFallback) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>
            Would use: <strong>{data.modelId}</strong>
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Source: {data.modelSource}
          {data.matchedCapabilities.length > 0 && (
            <> | Matched: {data.matchedCapabilities.join(", ")}</>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          Available models: {data.availableModelCount}
        </p>
      </div>
    );
  }

  // Requirements fallback
  if (data.requirementsFallback) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-yellow-600">
          <AlertTriangle className="h-4 w-4" />
          <span>
            No model matched requirements — using {data.modelSource}: <strong>{data.modelId ?? "none"}</strong>
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Available models: {data.availableModelCount}
        </p>
      </div>
    );
  }

  // Fixed model (skill_llmModelId or skill_fixedModel)
  if (data.modelSource === "skill_llmModelId" || data.modelSource === "skill_fixedModel") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">Fixed</Badge>
          <span>
            Model: <strong>{data.modelId}</strong>
          </span>
        </div>
        <p className="text-muted-foreground text-xs">Source: {data.modelSource}</p>
      </div>
    );
  }

  // Default / unconfigured
  return (
    <div className="space-y-1">
      <p>
        Model: <strong>{data.modelId ?? "none"}</strong>
      </p>
      <p className="text-muted-foreground text-xs">Source: {data.modelSource}</p>
      <p className="text-muted-foreground text-xs">
        Available models: {data.availableModelCount}
      </p>
    </div>
  );
}
