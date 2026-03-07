import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface ImageModelComboboxProps {
  value: string;
  onValueChange: (modelId: string) => void;
  disabled?: boolean;
  mediaType?: "image" | "video" | "audio";
}

interface ImageModelOption {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  creditCost?: number;
  configJson?: unknown;
}

function inferUvoiceTierLabel(modelId: string | undefined): string | null {
  const normalized = String(modelId || "").trim().toLowerCase();
  if (normalized.endsWith("/tts-premium")) return "Premium";
  if (normalized.endsWith("/tts-natural")) return "Natural";
  if (normalized.endsWith("/tts-standard")) return "Standard";
  return null;
}

function formatModelLabel(model: ImageModelOption | undefined, mediaType: "image" | "video" | "audio"): string | null {
  if (!model) {
    return null;
  }
  if (mediaType === "audio" && model.provider?.trim().toLowerCase() === "uvoice") {
    const tier = inferUvoiceTierLabel(model.id);
    if (tier) {
      return `UVoice ${tier}`;
    }
  }
  return model.name;
}

function normalizeGenerateType(configJson: unknown): string | null {
  if (!configJson || typeof configJson !== "object") {
    return null;
  }
  const raw = (configJson as { generateType?: unknown }).generateType;
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isTextToImageModel(model: ImageModelOption): boolean {
  const generateType = normalizeGenerateType(model.configJson);
  if (!generateType) {
    return true;
  }
  return ["text-to-image", "text2image", "txt2img", "t2i"].includes(generateType);
}

export function ImageModelCombobox({
  value,
  onValueChange,
  disabled,
  mediaType = "image",
}: ImageModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number>(0);

  const modelsQuery = trpc.media.getModels.useQuery(
    { type: mediaType },
    { staleTime: 300_000 },
  );

  const models = (modelsQuery.data?.models ?? []) as ImageModelOption[];
  const compatibleModels =
    mediaType === "image" ? models.filter(isTextToImageModel) : models;
  const defaultModelId =
    compatibleModels[0]?.id ||
    (mediaType === "video"
      ? modelsQuery.data?.defaults?.video
      : mediaType === "audio"
        ? modelsQuery.data?.defaults?.audio
        : modelsQuery.data?.defaults?.image) ||
    (mediaType === "video"
      ? "veo-3-1"
      : mediaType === "audio"
        ? "elevenlabs-tts"
        : "flux-2.0");

  useEffect(() => {
    if (open && triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, [open]);

  const selectedModel = models.find(
    (m: { id: string }) => m.id === value,
  );
  const defaultModel = compatibleModels.find((model) => model.id === defaultModelId)
    ?? models.find((model) => model.id === defaultModelId);
  const displayLabel = value
    ? formatModelLabel(selectedModel, mediaType) ?? value
    : `Default (${formatModelLabel(defaultModel, mediaType) ?? defaultModelId})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: triggerWidth > 0 ? triggerWidth : undefined }}
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup>
              {/* Default option */}
              <CommandItem
                value={`Default (${defaultModelId}) ${defaultModelId}`}
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span>Default ({formatModelLabel(defaultModel, mediaType) ?? defaultModelId})</span>
              </CommandItem>

              {modelsQuery.isLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}

              {compatibleModels.map((model) => (
                <CommandItem
                  key={model.id}
                  value={`${model.name} ${model.id} ${model.provider ?? ""}`}
                  onSelect={() => {
                    onValueChange(model.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === model.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-1 items-center gap-2 overflow-hidden">
                    <span className="truncate font-medium">
                      {formatModelLabel(model, mediaType) ?? model.name}
                    </span>
                    {mediaType === "audio" && model.provider?.trim().toLowerCase() === "uvoice" && inferUvoiceTierLabel(model.id) ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 px-1.5 py-0 text-[10px]"
                      >
                        {inferUvoiceTierLabel(model.id)}
                      </Badge>
                    ) : null}
                    {model.provider && (
                      <Badge
                        variant="outline"
                        className="shrink-0 px-1.5 py-0 text-[10px]"
                      >
                        {model.provider}
                      </Badge>
                    )}
                    {model.creditCost != null && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 px-1.5 py-0 text-[10px]"
                      >
                        <Zap className="mr-0.5 inline h-3 w-3" />
                        {model.creditCost}
                      </Badge>
                    )}
                  </div>
                </CommandItem>
              ))}
              {mediaType === "image" && compatibleModels.length < models.length && (
                <div className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">
                  Hidden incompatible models (image-to-image / edit only)
                </div>
              )}
              {models.length === 0 && !modelsQuery.isLoading && (
                <div className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">
                  No {mediaType} models available.
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
