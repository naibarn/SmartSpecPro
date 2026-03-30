import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Bot } from "lucide-react";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";

interface AgencyPickerModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId?: string | number | null;
  requireRunnable?: boolean;
  onSelect: (agency: {
    id: string;
    name: string;
    description?: string;
  }) => void;
}

export function AgencyPickerModal({
  open,
  onClose,
  currentUserId = null,
  requireRunnable = false,
  onSelect,
}: AgencyPickerModalProps) {
  const [search, setSearch] = useState("");

  const { data: agencyData } = (trpc as any).agency?.list?.useQuery?.(
    { limit: 100, offset: 0 },
    { enabled: open },
  ) ?? { data: undefined };

  const agencies = useMemo(() => {
    const all: Array<{
      id: string;
      name: string;
      description?: string | null;
      agentCount?: number;
      status?: string;
      visibility?: string;
      createdBy?: number | null;
      isPublished?: boolean;
      canRun?: boolean;
      readinessLabel?: string;
    }> = agencyData?.agencies ?? [];

    const withRunState = all.map((agency) => {
      const isTemplate = agency.visibility === "template";
      const normalizedUserId = currentUserId != null ? String(currentUserId) : null;
      const isOwnAgency = normalizedUserId != null && String(agency.createdBy ?? "") === normalizedUserId;
      const isRunnable = agency.status === "published" || isTemplate || isOwnAgency;
      const readinessLabel = agency.status === "archived"
        ? "Archived"
        : agency.status === "published"
          ? "Ready"
          : isTemplate
            ? "Template"
            : isOwnAgency
              ? "Owner draft"
              : "Draft";
      return {
        ...agency,
        canRun: isRunnable && agency.status !== "archived",
        readinessLabel,
      };
    }).filter((agency) => !requireRunnable || agency.canRun);

    if (!search) return withRunState;

    const q = search.toLowerCase();
    return withRunState.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [agencyData, currentUserId, requireRunnable, search]);

  const handleClose = () => {
    setSearch("");
    onClose();
  };

  const handleSelect = (agency: (typeof agencies)[number]) => {
    if (requireRunnable && !agency.canRun) {
      return;
    }
    onSelect({
      id: agency.id,
      name: agency.name,
      description: agency.description ?? undefined,
    });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="!flex !flex-col max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Select Agency
          </DialogTitle>
          {requireRunnable && (
            <p className="text-sm text-muted-foreground">
              Only runnable agencies are shown here: published agencies, templates, or agencies you created.
            </p>
          )}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agencies..."
            className="pl-9"
          />
        </div>

        <ScrollArea className="flex-1 pr-4">
          {agencies.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {agencyData === undefined
                ? "Loading..."
                : search
                  ? "No agencies found."
                  : "No agencies available."}
            </p>
          ) : (
            <div className="space-y-1 pb-2">
              {agencies.map((agency) => (
                <button
                  key={agency.id}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-cyan-300 hover:bg-cyan-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={requireRunnable && !agency.canRun}
                  onClick={() => handleSelect(agency)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{agency.name}</span>
                      {agency.agentCount !== undefined && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {agency.agentCount}{" "}
                          {agency.agentCount === 1 ? "agent" : "agents"}
                        </Badge>
                      )}
                      {agency.readinessLabel && (
                        <Badge
                          variant={agency.canRun ? "default" : "outline"}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {agency.readinessLabel}
                        </Badge>
                      )}
                    </div>
                    {agency.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {agency.description}
                      </p>
                    )}
                    {requireRunnable && !agency.canRun && (
                      <p className="mt-0.5 text-xs text-amber-700">
                        This agency is not ready to run yet. Publish it or mark it as a template.
                      </p>
                    )}
                    {!requireRunnable && !agency.canRun && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Not runnable in composer yet.
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
