import type { DesktopRolloutGateState } from "@shared/desktopHost";

import { summarizeRolloutGates } from "./labels";

export function DesktopHostRolloutGatePanel({ gates }: { gates: DesktopRolloutGateState[] }) {
  const summary = summarizeRolloutGates(gates);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Rollout Gates</h3>
          <p className="text-xs text-slate-500">
            Managed rollout stays blocked until foundational gates pass.
          </p>
        </div>
        <div className="text-xs font-medium text-slate-600">
          {summary.satisfied} passed / {summary.blocked} blocked
        </div>
      </header>
      <div className="space-y-2">
        {gates.map((gate) => (
          <div
            key={gate.gate}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
          >
            <span>{gate.gate}</span>
            <span className={gate.satisfied ? "text-emerald-600" : "text-rose-600"}>
              {gate.reason}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
