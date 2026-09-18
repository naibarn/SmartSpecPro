import { useEffect, useState } from "react";
import { useRoute, useSearch } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EvidenceReviewResponse = {
  publicCaseId: string | null;
  packageId: string;
  packageVersion: string;
  packageSha256: string;
  status: string;
  sealedAt: string | null;
  scope: string[];
  expiresAt: string;
  downloadPath: string | null;
  disclaimer: string;
};

export default function EvidenceReviewPage() {
  const [, params] = useRoute("/evidence-review/:publicCaseId");
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const [state, setState] = useState<{ loading: boolean; data?: EvidenceReviewResponse; error?: string }>({ loading: true });

  useEffect(() => {
    const publicCaseId = params?.publicCaseId ?? "";
    if (!publicCaseId || !token) {
      setState({ loading: false, error: "This evidence review link is incomplete." });
      return;
    }
    const controller = new AbortController();
    void fetch(`/v1/content-protection/evidence-review/${encodeURIComponent(publicCaseId)}?token=${encodeURIComponent(token)}`, {
      credentials: "omit",
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "This evidence review link is unavailable.");
        return payload as EvidenceReviewResponse;
      })
      .then(data => setState({ loading: false, data }))
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ loading: false, error: error instanceof Error ? error.message : "This evidence review link is unavailable." });
      });
    return () => controller.abort();
  }, [params?.publicCaseId, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-2xl" data-testid="evidence-review-page">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Content Protection Evidence Review</CardTitle>
            {state.data ? <Badge variant="outline">{state.data.status}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {state.loading ? <p>Loading scoped evidence…</p> : null}
          {state.error ? <p className="text-red-700">{state.error}</p> : null}
          {state.data ? (
            <>
              <p>This is a read-only, case-scoped technical evidence package. It does not make a legal ownership determination.</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div><dt className="text-slate-500">Case</dt><dd className="break-all font-medium">{state.data.publicCaseId ?? "—"}</dd></div>
                <div><dt className="text-slate-500">Package</dt><dd className="break-all font-medium">{state.data.packageId}</dd></div>
                <div><dt className="text-slate-500">Package hash</dt><dd className="break-all font-mono text-xs">{state.data.packageSha256}</dd></div>
                <div><dt className="text-slate-500">Expires</dt><dd>{new Date(state.data.expiresAt).toLocaleString()}</dd></div>
              </dl>
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">{state.data.disclaimer}</p>
              {state.data.downloadPath ? (
                <a
                  className="inline-flex rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-800 underline"
                  href={`${state.data.downloadPath}?token=${encodeURIComponent(token)}`}
                >
                  Download evidence ZIP
                </a>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
