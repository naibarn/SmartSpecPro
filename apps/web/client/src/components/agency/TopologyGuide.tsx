import { Info } from "lucide-react";

const TOPOLOGIES = [
  {
    value: "handoff_chain" as const,
    label: "Handoff Chain",
    description: "Agents pass work sequentially. Best for linear pipelines.",
  },
  {
    value: "orchestrator_worker" as const,
    label: "Orchestrator-Worker",
    description:
      "One supervisor delegates to specialized workers. Best for complex task decomposition.",
  },
  {
    value: "hybrid" as const,
    label: "Hybrid",
    description:
      "Mix of handoff and orchestrator patterns. For agencies with both sequential and delegated work.",
  },
  {
    value: "custom" as const,
    label: "Custom",
    description: "Fully custom routing. No structural constraints.",
  },
];

export type TopologyType = (typeof TOPOLOGIES)[number]["value"];

interface TopologyGuideProps {
  value?: TopologyType;
  onChange?: (topology: TopologyType) => void;
}

export function TopologyGuide({ value = "custom", onChange }: TopologyGuideProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        <span>Agency Topology</span>
      </div>
      <div className="space-y-1">
        {TOPOLOGIES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange?.(t.value)}
            className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
              value === t.value
                ? "bg-primary/10 text-primary border border-primary/20"
                : "hover:bg-muted/50 text-muted-foreground"
            }`}
          >
            <div className="font-medium">{t.label}</div>
            <div className="text-[10px] opacity-70 mt-0.5">{t.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
