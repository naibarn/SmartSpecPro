import { Users, Coins, ArrowUpRight } from "lucide-react";

interface AgencyMarketplaceCardProps {
  agency: {
    id: string;
    name: string;
    description: string | null;
    ownerName: string | null;
    agentCount: number;
    creatorFeeCredits: number;
    createdAt: string;
  };
  onSelect: (id: string) => void;
}

const NODE_TYPE_COLORS: Record<string, string> = {
  agent: "bg-blue-100 text-blue-800",
  supervisor: "bg-purple-100 text-purple-800",
  router: "bg-orange-100 text-orange-800",
  aggregator: "bg-cyan-100 text-cyan-800",
  knowledge_base: "bg-green-100 text-green-800",
  skill_call: "bg-amber-100 text-amber-800",
  human_approval: "bg-red-100 text-red-800",
  browser_session: "bg-cyan-100 text-cyan-800",
  conditional_branch: "bg-amber-100 text-amber-800",
  parallel_fan_out: "bg-violet-100 text-violet-800",
  loop_retry: "bg-emerald-100 text-emerald-800",
  skill_discovery: "bg-pink-100 text-pink-800",
  data_transform: "bg-slate-100 text-slate-800",
  error_handler: "bg-red-100 text-red-800",
};

export function AgencyMarketplaceCard({
  agency,
  onSelect,
}: AgencyMarketplaceCardProps) {
  return (
    <article
      role="button"
      tabIndex={0}
      className="group relative flex flex-col rounded-xl border bg-white/80 backdrop-blur p-4 cursor-pointer transition-all hover:shadow-lg hover:border-purple-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary"
      onClick={() => onSelect(agency.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(agency.id);
        }
      }}
    >
      {/* Agent count badge */}
      <span className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800">
        <Users className="h-3 w-3" />
        {agency.agentCount} Agent{agency.agentCount !== 1 ? "s" : ""}
      </span>

      {/* Title */}
      <h3 className="font-semibold text-sm line-clamp-1 mt-2">
        {agency.name}
      </h3>

      {/* Description */}
      {agency.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {agency.description}
        </p>
      )}

      {/* Owner */}
      {agency.ownerName && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          By {agency.ownerName}
        </p>
      )}

      {/* Bottom stats row */}
      <div className="mt-auto pt-3 flex items-center gap-3 text-xs text-muted-foreground border-t border-dashed">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" />
          {agency.agentCount}
        </span>
        {agency.creatorFeeCredits > 0 && (
          <span className="inline-flex items-center gap-1">
            <Coins className="h-3 w-3" />
            {agency.creatorFeeCredits} credits
          </span>
        )}
        {agency.creatorFeeCredits === 0 && (
          <span className="inline-flex items-center gap-1 text-green-600 font-medium">
            Free
          </span>
        )}

        <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Preview
          <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </article>
  );
}
