export interface DesktopBootstrapStep {
  id: string;
  title: string;
  status: "pending" | "done";
}

export function DesktopHostBootstrapCard({ steps }: { steps: DesktopBootstrapStep[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Desktop Bootstrap</h3>
        <p className="text-xs text-slate-500">
          Sign-in, device registration, policy validation, root selection, and package sync.
        </p>
      </header>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          >
            <span>{step.title}</span>
            <span className={step.status === "done" ? "text-emerald-600" : "text-amber-600"}>
              {step.status === "done" ? "Done" : "Pending"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
