import { useState } from "react";
import type { GuardrailStrategy } from "./types";

interface Props {
  strategy: GuardrailStrategy;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function GuardrailStrategyFields({ strategy, config, onChange }: Props) {
  switch (strategy) {
    case "keyword_block":
      return <KeywordBlockFields config={config} onChange={onChange} />;
    case "regex_match":
      return <RegexMatchFields config={config} onChange={onChange} />;
    case "llm_classify":
      return <LlmClassifyFields config={config} onChange={onChange} />;
    case "json_schema":
      return <JsonSchemaFields config={config} onChange={onChange} />;
    case "max_length":
      return <MaxLengthFields config={config} onChange={onChange} />;
    case "pii_detection":
      return <PiiDetectionFields config={config} onChange={onChange} />;
    case "custom_endpoint":
      return <CustomEndpointFields config={config} onChange={onChange} />;
    default:
      return null;
  }
}

function KeywordBlockFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const keywords = (config.keywords as string[]) || [];
  const [text, setText] = useState(keywords.join(", "));

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Keywords (comma-separated)</label>
      <textarea
        className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const kws = e.target.value.split(",").map((k) => k.trim()).filter(Boolean);
          onChange({ ...config, keywords: kws });
        }}
        placeholder="password, credit card, SSN..."
        rows={3}
      />
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {keywords.map((kw, i) => (
            <span key={i} className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RegexMatchFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const pattern = (config.pattern as string) || "";
  const action = (config.action as string) || "block";
  const [error, setError] = useState("");

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Regex Pattern</label>
        <input
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
          value={pattern}
          onChange={(e) => {
            const p = e.target.value;
            onChange({ ...config, pattern: p });
            try {
              new RegExp(p);
              setError("");
            } catch {
              setError("Invalid regex pattern");
            }
          }}
          placeholder="\\b\\d{3}-\\d{2}-\\d{4}\\b"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Action</label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={action}
          onChange={(e) => onChange({ ...config, action: e.target.value })}
        >
          <option value="block">Block on match</option>
          <option value="require">Require match</option>
        </select>
      </div>
    </div>
  );
}

function LlmClassifyFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const prompt = (config.prompt as string) || "";
  const blockIf = (config.blockIf as string) || "";

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Classification Prompt</label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={prompt}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder="Classify the following message as 'safe' or 'harmful': {message}"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">Use {"{message}"} as placeholder for the input text.</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Block If (exact match)</label>
        <input
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={blockIf}
          onChange={(e) => onChange({ ...config, blockIf: e.target.value })}
          placeholder="harmful"
        />
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400">Note: LLM classification adds latency to each guardrail check.</p>
    </div>
  );
}

function JsonSchemaFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const schema = config.schema ? JSON.stringify(config.schema, null, 2) : "";
  const [text, setText] = useState(schema);
  const [error, setError] = useState("");

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">JSON Schema</label>
      <textarea
        className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            onChange({ ...config, schema: parsed });
            setError("");
          } catch {
            setError("Invalid JSON");
          }
        }}
        placeholder='{"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}}}'
        rows={6}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function MaxLengthFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const maxChars = (config.maxChars as number) || 1000;

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Maximum Characters</label>
      <input
        type="number"
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={maxChars}
        min={1}
        max={100000}
        onChange={(e) => onChange({ ...config, maxChars: parseInt(e.target.value) || 1 })}
      />
    </div>
  );
}

function PiiDetectionFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const patterns = (config.patterns as string[]) || [];
  const action = (config.action as string) || "block";

  const toggle = (pattern: string) => {
    const next = patterns.includes(pattern)
      ? patterns.filter((p) => p !== pattern)
      : [...patterns, pattern];
    onChange({ ...config, patterns: next });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">PII Patterns to Detect</label>
        {(["email", "phone", "ssn"] as const).map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={patterns.includes(p)}
              onChange={() => toggle(p)}
              className="rounded border-gray-300"
            />
            {p === "email" ? "Email addresses" : p === "phone" ? "Phone numbers" : "Social Security Numbers"}
          </label>
        ))}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Action</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" name="pii-action" value="block" checked={action === "block"} onChange={() => onChange({ ...config, action: "block" })} />
            Block
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" name="pii-action" value="redact" checked={action === "redact"} onChange={() => onChange({ ...config, action: "redact" })} />
            Redact
          </label>
        </div>
        {action === "redact" && (
          <p className="text-xs text-muted-foreground">PII will be replaced with [REDACTED] before processing.</p>
        )}
      </div>
    </div>
  );
}

function CustomEndpointFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const endpoint = (config.endpoint as string) || "";

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Endpoint URL</label>
        <input
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={endpoint}
          onChange={(e) => onChange({ ...config, endpoint: e.target.value })}
          placeholder="https://guardrails.example.com/check"
        />
        <p className="text-xs text-amber-600 dark:text-amber-400">Private IPs and localhost are blocked (SSRF protection).</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Timeout (ms)</label>
        <input
          type="number"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={(config.timeout as number) || 5000}
          min={1000}
          max={10000}
          onChange={(e) => onChange({ ...config, timeout: parseInt(e.target.value) || 5000 })}
        />
      </div>
    </div>
  );
}
