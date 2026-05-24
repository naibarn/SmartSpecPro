import { useEffect, useMemo, useState } from "react";
import { Image, Play, Save, Settings2, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionFlowNode, ProductionNodeConfigSnapshot } from "@shared/mediaProduction";
import { nodeConfigToDraft, type ProductionLocale, type ProductionNodeConfigDraft } from "./types";

export interface NodeConfigPanelProps {
  node?: ProductionFlowNode | null;
  locale?: ProductionLocale;
  onSaveNodeConfig?: (draft: ProductionNodeConfigDraft) => void;
}

const adapters: ProductionNodeConfigSnapshot["adapter"][] = ["image", "video", "tts", "preview_only", "disabled"];

function adapterLabel(adapter: ProductionNodeConfigSnapshot["adapter"], isThai: boolean): string {
  const labels: Record<ProductionNodeConfigSnapshot["adapter"], { en: string; th: string }> = {
    image: { en: "Image generator", th: "ตัวสร้างภาพ" },
    video: { en: "Video generator", th: "ตัวสร้างวิดีโอ" },
    tts: { en: "Audio / TTS generator", th: "ตัวสร้างเสียง / อ่านข้อความ" },
    preview_only: { en: "Planning only", th: "วางแผน / ส่งต่อเท่านั้น" },
    disabled: { en: "Disabled", th: "ปิดใช้งาน" },
  };
  return isThai ? labels[adapter].th : labels[adapter].en;
}

function parseConfig(value: string): { ok: true; config: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = value.trim() ? JSON.parse(value) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Config must be a JSON object." };
    }
    return { ok: true, config: parsed as Record<string, unknown> };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON." };
  }
}

function configString(config: Record<string, unknown> | undefined, key: string): string {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
}

function AdapterPreview({ adapter, title }: { adapter: ProductionNodeConfigSnapshot["adapter"]; title: string }) {
  if (adapter === "image") {
    return (
      <div className="flex aspect-video items-center justify-center rounded border bg-slate-50 text-sm text-muted-foreground">
        <Image className="mr-2 h-5 w-5 text-sky-600" />
        Image preview adapter · {title}
      </div>
    );
  }

  if (adapter === "video") {
    return (
      <div className="flex aspect-video items-center justify-center rounded border bg-slate-900 text-sm text-white">
        <Play className="mr-2 h-5 w-5" />
        Video preview adapter · {title}
      </div>
    );
  }

  if (adapter === "tts") {
    return (
      <div className="rounded border bg-slate-50 p-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-sky-600" />
          TTS preview adapter
        </div>
        <div className="mt-2 h-2 rounded bg-sky-100">
          <div className="h-2 w-1/3 rounded bg-sky-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
      {adapter === "preview_only" ? "Preview-only node. Save metadata without generation." : "Adapter disabled."}
    </div>
  );
}

export function NodeConfigPanel({ node, locale, onSaveNodeConfig }: NodeConfigPanelProps) {
  const isThai = locale === "th";
  const initialDraft = useMemo(() => (node ? nodeConfigToDraft(node) : null), [node]);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [adapter, setAdapter] = useState<ProductionNodeConfigSnapshot["adapter"]>(initialDraft?.adapter ?? "preview_only");
  const [configText, setConfigText] = useState(() => JSON.stringify(initialDraft?.config ?? {}, null, 2));
  const [prompt, setPrompt] = useState(() => configString(initialDraft?.config, "prompt"));
  const [model, setModel] = useState(() => configString(initialDraft?.config, "model"));
  const [references, setReferences] = useState(() => configString(initialDraft?.config, "references"));
  const [outputTarget, setOutputTarget] = useState(() => configString(initialDraft?.config, "outputTarget"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(initialDraft?.title ?? "");
    setAdapter(initialDraft?.adapter ?? "preview_only");
    setConfigText(JSON.stringify(initialDraft?.config ?? {}, null, 2));
    setPrompt(configString(initialDraft?.config, "prompt"));
    setModel(configString(initialDraft?.config, "model"));
    setReferences(configString(initialDraft?.config, "references"));
    setOutputTarget(configString(initialDraft?.config, "outputTarget"));
    setError(null);
  }, [initialDraft]);

  if (!node || !initialDraft) {
    return (
      <div className="rounded-lg border bg-white p-4" data-testid="node-config-panel">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Settings2 className="h-4 w-4 text-sky-600" />
          {isThai ? "Node Config" : "Node Config"}
        </div>
        <div className="mt-3 rounded border border-dashed p-4 text-sm text-muted-foreground">
          {isThai ? "เลือก node เพื่อแก้ config" : "Select a node to edit config."}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4" data-testid="node-config-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Settings2 className="h-4 w-4 text-sky-600" />
          {isThai ? "Node Config" : "Node Config"}
        </div>
        <Badge variant="outline">{node.kind}</Badge>
      </div>

      <div className="mt-3 space-y-3">
        <div className="grid gap-1.5">
          <Label htmlFor="production-node-title">{isThai ? "ชื่อ node" : "Node title"}</Label>
          <Input id="production-node-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="production-node-adapter">{isThai ? "วิธีรัน / ตัวเชื่อม" : "Run mode / adapter"}</Label>
          <select
            id="production-node-adapter"
            value={adapter}
            aria-label="Adapter"
            onChange={(event) => setAdapter(event.target.value as ProductionNodeConfigSnapshot["adapter"])}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            {adapters.map((item) => (
              <option key={item} value={item}>
                {adapterLabel(item, isThai)}
              </option>
            ))}
          </select>
        </div>
        <AdapterPreview adapter={adapter} title={title || node.title} />
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium text-slate-800">{isThai ? "ตั้งค่าหลัก" : "Operator settings"}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {isThai
              ? "ตั้ง prompt, โมเดล, reference และ output target ได้โดยไม่ต้องแก้ JSON"
              : "Configure prompt, model, references, and output target without editing JSON."}
          </div>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="production-node-prompt">{isThai ? "Prompt" : "Prompt"}</Label>
              <Textarea
                id="production-node-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={isThai ? "บอกสิ่งที่ node นี้ต้องสร้างหรือเตรียม" : "Describe what this node should create or prepare."}
                className="min-h-[84px] bg-white"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="production-node-model">{isThai ? "Model / preset" : "Model / preset"}</Label>
                <Input
                  id="production-node-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={adapter === "preview_only" ? (isThai ? "ไม่ต้องใช้โมเดล" : "No model required") : "auto"}
                  disabled={adapter === "disabled"}
                  className="bg-white"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="production-node-output-target">{isThai ? "ส่งผลลัพธ์ไปที่" : "Output destination"}</Label>
                <Input
                  id="production-node-output-target"
                  value={outputTarget}
                  onChange={(event) => setOutputTarget(event.target.value)}
                  placeholder={isThai ? "เช่น storyboard, video edit" : "e.g. storyboard, video edit"}
                  disabled={adapter === "disabled"}
                  className="bg-white"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="production-node-references">{isThai ? "References" : "References"}</Label>
              <Textarea
                id="production-node-references"
                value={references}
                onChange={(event) => setReferences(event.target.value)}
                placeholder={isThai ? "asset id, claim id หรือ note ที่เกี่ยวข้อง" : "Asset ids, claim ids, or relevant notes."}
                className="min-h-[68px] bg-white"
              />
            </div>
          </div>
        </div>
        <details className="rounded-md border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">
            {isThai ? "ขั้นสูง: Config JSON" : "Advanced: Config JSON"}
          </summary>
          <div className="mt-3 grid gap-1.5">
            <Label htmlFor="production-node-config-json">{isThai ? "Config JSON" : "Config JSON"}</Label>
            <Textarea
              id="production-node-config-json"
              value={configText}
              onChange={(event) => setConfigText(event.target.value)}
              className="min-h-[140px] font-mono text-xs"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "production-node-config-json-error" : undefined}
            />
          </div>
        </details>
        {error ? (
          <div id="production-node-config-json-error" role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-full border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white"
          onClick={() => {
            const parsed = parseConfig(configText);
            if (!parsed.ok) {
              setError(parsed.error);
              return;
            }
            setError(null);
            const operatorConfig = {
              prompt: prompt.trim(),
              model: model.trim(),
              references: references.trim(),
              outputTarget: outputTarget.trim(),
            };
            onSaveNodeConfig?.({
              ...initialDraft,
              title,
              adapter,
              config: {
                ...parsed.config,
                ...Object.fromEntries(Object.entries(operatorConfig).filter(([, value]) => value.length > 0)),
              },
              manuallyEdited: true,
            });
          }}
        >
          <Save className="mr-2 h-4 w-4" />
          {isThai ? "Save to Node" : "Save to Node"}
        </Button>
      </div>
    </div>
  );
}
