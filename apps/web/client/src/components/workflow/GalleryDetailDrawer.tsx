import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  NODE_TYPE_CATEGORY_COLORS,
  DEFAULT_NODE_COLOR,
} from "./galleryConstants";

interface GalleryDetailDrawerProps {
  open: boolean;
  templateId: number | null;
  onClose: () => void;
}

function svgToDataUrl(svgString: string): string {
  const base64 = btoa(unescape(encodeURIComponent(svgString)));
  return `data:image/svg+xml;base64,${base64}`;
}

export function GalleryDetailDrawer({
  open,
  templateId,
  onClose,
}: GalleryDetailDrawerProps) {
  const [, setLocation] = useLocation();

  const { data: template, isLoading } = trpc.workflow.getTemplate.useQuery(
    { id: templateId! },
    { enabled: open && templateId !== null }
  );

  const useTemplateMutation = trpc.workflow.useTemplate.useMutation();

  async function handleUseTemplate() {
    if (!template) return;
    try {
      const result = await useTemplateMutation.mutateAsync({
        templateId: template.id,
      });
      onClose();
      toast.success("Template loaded — configure your connections and run.");
      setLocation(`/workflows/editor/${result.id}`);
    } catch {
      toast.error("Could not load template. Please try again.");
    }
  }

  // Extract unique node types from workflowJson
  const nodeTypes = template?.workflowJson?.nodes
    ? [
        ...new Set(
          template.workflowJson.nodes.map(
            (n: any) => n.data?.nodeType as string
          )
        ),
      ].filter(Boolean)
    : [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[520px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-4 py-6">
            <div className="h-6 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-48 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
          </div>
        ) : template ? (
          <>
            <SheetHeader>
              <SheetTitle>{template.name}</SheetTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {template.stepCount != null && (
                  <span>{template.stepCount} steps</span>
                )}
                {template.estimatedSetupMinutes != null && (
                  <>
                    <span>·</span>
                    <span>~{template.estimatedSetupMinutes} min setup</span>
                  </>
                )}
                {template.downloadCount > 0 && (
                  <>
                    <span>·</span>
                    <span>{template.downloadCount} uses</span>
                  </>
                )}
              </div>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              {/* SVG Preview */}
              {template.previewSvg && (
                <img
                  src={svgToDataUrl(template.previewSvg)}
                  alt="Workflow topology diagram"
                  className="w-full rounded-lg border"
                />
              )}

              {/* Description */}
              {template.description && (
                <p className="text-sm text-muted-foreground">
                  {template.description}
                </p>
              )}

              {/* Node type badges */}
              {nodeTypes.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2">
                    Node Types
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {nodeTypes.map((nt: string) => (
                      <span
                        key={nt}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs text-white"
                        style={{
                          backgroundColor:
                            NODE_TYPE_CATEGORY_COLORS[nt] ?? DEFAULT_NODE_COLOR,
                        }}
                      >
                        {nt}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Industry tags */}
              {template.industry && template.industry.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2">
                    Industries
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(template.industry as string[]).map((ind: string) => (
                      <span
                        key={ind}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground"
                      >
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <SheetFooter className="mt-6">
              <Button
                className="w-full"
                onClick={handleUseTemplate}
                disabled={useTemplateMutation.isPending}
              >
                {useTemplateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Use This Template
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
