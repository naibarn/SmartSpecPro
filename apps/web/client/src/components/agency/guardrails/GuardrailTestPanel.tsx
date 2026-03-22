import { useState } from "react";
import { CheckCircle, Loader2, XCircle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type { Guardrail, GuardrailTestResult } from "./types";

interface Props {
  guardrail: Guardrail;
}

export function GuardrailTestPanel({ guardrail }: Props) {
  const [sampleText, setSampleText] = useState("");
  const [result, setResult] = useState<GuardrailTestResult | null>(null);
  const [error, setError] = useState("");

  const testMutation = (trpc as any).agency?.testGuardrail?.useMutation?.({
    onSuccess: (data: GuardrailTestResult) => {
      setResult(data);
      setError("");
    },
    onError: (err: { message?: string }) => {
      setError(err?.message ?? "Test failed");
      setResult(null);
    },
  }) ?? { mutate: () => {}, isPending: false };

  const handleTest = () => {
    if (!sampleText.trim()) {
      setError("Enter sample text");
      return;
    }
    setError("");
    setResult(null);
    testMutation.mutate({
      guardrailId: guardrail.id,
      sampleMessage: sampleText,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <h4 className="text-sm font-medium">Test Guardrail</h4>
      <textarea
        className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={sampleText}
        onChange={(e) => setSampleText(e.target.value)}
        placeholder="Enter sample text to test against this guardrail..."
        rows={3}
        disabled={testMutation.isPending}
      />
      <button
        onClick={handleTest}
        disabled={testMutation.isPending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {testMutation.isPending ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...</>
        ) : (
          "Test"
        )}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {result && (
        <div className={cn(
          "flex items-start gap-2 rounded-md p-2 text-sm",
          result.passed
            ? result.action === "redact"
              ? "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
              : "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
            : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300",
        )}>
          {result.passed ? (
            result.action === "redact" ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            ) : (
              <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            )
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          )}
          <div>
            <span className="font-medium">
              {result.passed
                ? result.action === "redact" ? "Redacted" : "Passed"
                : "Blocked"}
            </span>
            {result.message && <p className="mt-1 text-xs opacity-80">{result.message}</p>}
            {result.redactedMessage && (
              <div className="mt-2">
                <p className="text-xs font-medium">Redacted output:</p>
                <p className="mt-0.5 rounded bg-white/50 p-1.5 font-mono text-xs dark:bg-black/20">
                  {result.redactedMessage}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
