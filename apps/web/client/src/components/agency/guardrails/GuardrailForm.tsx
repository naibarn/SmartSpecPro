import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GuardrailStrategyFields } from "./GuardrailStrategyFields";
import type { Guardrail, GuardrailStrategy, GuardrailType, GuardrailMode } from "./types";
import { STRATEGY_META } from "./types";

interface Props {
  agencyId: string;
  guardrail?: Guardrail; // if editing
  onClose: () => void;
  onSaved: () => void;
}

const STRATEGIES = Object.keys(STRATEGY_META) as GuardrailStrategy[];

export function GuardrailForm({ agencyId, guardrail, onClose, onSaved }: Props) {
  const isEdit = !!guardrail;

  const [name, setName] = useState(guardrail?.name ?? "");
  const [type, setType] = useState<GuardrailType>(guardrail?.type ?? "input");
  const [mode, setMode] = useState<GuardrailMode>(guardrail?.mode ?? "strict");
  const [strategy, setStrategy] = useState<GuardrailStrategy>(guardrail?.strategy ?? "keyword_block");
  const [config, setConfig] = useState<Record<string, unknown>>(
    guardrail?.config ? { ...guardrail.config } : { keywords: [] },
  );
  const [validationAttempts, setValidationAttempts] = useState(guardrail?.validationAttempts ?? 1);
  const [enforceOnHandoff, setEnforceOnHandoff] = useState(
    (guardrail?.config as any)?.enforceOnHandoff ?? false,
  );
  const [isEnabled, setIsEnabled] = useState(guardrail?.isEnabled ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = (trpc as any).agency?.createGuardrail?.useMutation?.({
    onSuccess: () => { toast.success("Guardrail created"); onSaved(); onClose(); },
    onError: (err: { message?: string }) => toast.error(err?.message ?? "Failed to create guardrail"),
  }) ?? { mutate: () => {}, isPending: false };

  const updateMutation = (trpc as any).agency?.updateGuardrail?.useMutation?.({
    onSuccess: () => { toast.success("Guardrail updated"); onSaved(); onClose(); },
    onError: (err: { message?: string }) => toast.error(err?.message ?? "Failed to update guardrail"),
  }) ?? { mutate: () => {}, isPending: false };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    if (name.length > 100) e.name = "Max 100 characters";

    switch (strategy) {
      case "keyword_block": {
        const kw = config.keywords as string[] | undefined;
        if (!kw || kw.length === 0) e.config = "At least one keyword required";
        break;
      }
      case "regex_match": {
        const pat = config.pattern as string | undefined;
        if (!pat) { e.config = "Pattern required"; break; }
        try { new RegExp(pat); } catch { e.config = "Invalid regex pattern"; }
        break;
      }
      case "llm_classify":
        if (!config.prompt) e.config = "Prompt required";
        if (!config.blockIf) e.config = "blockIf required";
        break;
      case "json_schema":
        if (!config.schema || typeof config.schema !== "object") e.config = "Valid JSON schema required";
        break;
      case "max_length":
        if (!config.maxChars || (config.maxChars as number) < 1) e.config = "maxChars must be >= 1";
        break;
      case "pii_detection": {
        const pats = config.patterns as string[] | undefined;
        if (!pats || pats.length === 0) e.config = "Select at least one PII pattern";
        break;
      }
      case "custom_endpoint":
        if (!config.endpoint) e.config = "Endpoint URL required";
        else {
          try { new URL(config.endpoint as string); } catch { e.config = "Invalid URL format"; }
        }
        break;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    if (isEdit && guardrail) {
      updateMutation.mutate({
        guardrailId: guardrail.id,
        name,
        type,
        mode,
        config,
        validationAttempts: type === "output" ? validationAttempts : 1,
        enforceOnHandoff: type === "input" ? enforceOnHandoff : false,
        isEnabled,
      });
    } else {
      createMutation.mutate({
        agencyId,
        name,
        type,
        mode,
        strategy,
        config,
        validationAttempts: type === "output" ? validationAttempts : 1,
        enforceOnHandoff: type === "input" ? enforceOnHandoff : false,
        isEnabled,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{isEdit ? "Edit Guardrail" : "New Guardrail"}</h3>
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Name</label>
        <input
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Guardrail name"
          maxLength={100}
        />
        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
      </div>

      {/* Type & Mode */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Type</label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as GuardrailType)}
          >
            <option value="input">Input</option>
            <option value="output">Output</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Mode</label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as GuardrailMode)}
          >
            <option value="strict">Strict (block)</option>
            <option value="guidance">Guidance (warn)</option>
          </select>
        </div>
      </div>

      {/* Strategy */}
      {!isEdit && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Strategy</label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={strategy}
            onChange={(e) => {
              const s = e.target.value as GuardrailStrategy;
              setStrategy(s);
              setConfig(getDefaultConfig(s));
            }}
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>{STRATEGY_META[s].label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Strategy-specific fields */}
      <GuardrailStrategyFields strategy={strategy} config={config} onChange={setConfig} />
      {errors.config && <p className="text-xs text-red-500">{errors.config}</p>}

      {/* Conditional fields */}
      {type === "output" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Validation Attempts</label>
          <input
            type="number"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={validationAttempts}
            min={1}
            max={5}
            onChange={(e) => setValidationAttempts(parseInt(e.target.value) || 1)}
          />
          <p className="text-xs text-muted-foreground">Agent will retry up to this many times on validation failure.</p>
        </div>
      )}

      {type === "input" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enforceOnHandoff}
            onChange={(e) => setEnforceOnHandoff(e.target.checked)}
            className="rounded border-gray-300"
          />
          Enforce on handoff (agent-to-agent transfers)
        </label>
      )}

      {/* Enabled toggle */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="rounded border-gray-300"
        />
        Enabled
      </label>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Saving..." : isEdit ? "Update Guardrail" : "Create Guardrail"}
      </button>
    </div>
  );
}

function getDefaultConfig(strategy: GuardrailStrategy): Record<string, unknown> {
  switch (strategy) {
    case "keyword_block": return { keywords: [] };
    case "regex_match": return { pattern: "", action: "block" };
    case "llm_classify": return { prompt: "", blockIf: "" };
    case "json_schema": return { schema: {} };
    case "max_length": return { maxChars: 1000 };
    case "pii_detection": return { patterns: [], action: "block" };
    case "custom_endpoint": return { endpoint: "", timeout: 5000 };
  }
}
