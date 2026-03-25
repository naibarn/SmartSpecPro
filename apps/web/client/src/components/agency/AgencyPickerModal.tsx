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
  onSelect: (agency: {
    id: string;
    name: string;
    description?: string;
  }) => void;
}

export function AgencyPickerModal({
  open,
  onClose,
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
    }> = agencyData?.agencies ?? [];

    if (!search) return all;

    const q = search.toLowerCase();
    return all.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [agencyData, search]);

  const handleClose = () => {
    setSearch("");
    onClose();
  };

  const handleSelect = (agency: (typeof agencies)[number]) => {
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
                  className="flex w-full items-start gap-2 rounded border px-3 py-2.5 text-left transition-colors hover:bg-accent"
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
                    </div>
                    {agency.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {agency.description}
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
