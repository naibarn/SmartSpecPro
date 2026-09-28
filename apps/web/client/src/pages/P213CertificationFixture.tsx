import { useState } from "react";

/**
 * P213-only browser fixture. It is intentionally deterministic: one visible
 * candidate mutates the page into a stable success state for the independent
 * post-action verifier. It has no production data or browser-control hooks.
 */
export default function P213CertificationFixture() {
  const [completed, setCompleted] = useState(false);

  return (
    <main
      aria-label="P213 certification fixture"
      className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900"
      data-testid="p213-certification-fixture"
    >
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          SmartAIHub certification fixture
        </p>
        <h1 className="mt-3 text-2xl font-semibold">P213 approval-required browser action</h1>
        {completed ? (
          <p className="mt-6 rounded-lg bg-emerald-50 p-4 font-medium text-emerald-700" role="status">
            Certification complete
          </p>
        ) : (
          <>
            <p className="mt-4 text-slate-600">This page changes only after the approved Runner action.</p>
            <button
              className="mt-6 rounded-lg bg-slate-900 px-5 py-3 font-medium text-white"
              data-testid="p213-continue"
              type="button"
              onClick={() => setCompleted(true)}
            >
              Continue
            </button>
          </>
        )}
      </section>
    </main>
  );
}
