import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";

/** Sentinel value indicating automatic model selection */
export const AUTO_MODEL = "__auto__";

interface ModelPickerProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    /** Compact mode for toolbar — smaller height & text */
    compact?: boolean;
    /** Hide the Auto option (e.g. for non-agent contexts) */
    hideAuto?: boolean;
}

export function ModelPicker({ value, onChange, className, compact, hideAuto }: ModelPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const { data: modelsData, isLoading } = trpc.llmProviders.availableModels.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });

    // Group models by provider
    const modelsByProvider = useMemo(() => {
        if (!modelsData?.models) return {};

        const grouped: Record<string, Array<{ id: string; name: string; provider: string }>> = {};
        for (const model of modelsData.models) {
            const provider = model.providerDisplayName || model.provider || "Other";
            if (!grouped[provider]) {
                grouped[provider] = [];
            }
            grouped[provider].push(model);
        }
        return grouped;
    }, [modelsData?.models]);

    // Find selected model name for display
    const selectedModelName = useMemo(() => {
        if (!value || value === AUTO_MODEL) return "Auto (system selects best model)";

        if (modelsData?.models) {
            const found = modelsData.models.find(m => m.id === value);
            if (found) return found.name || found.id;
        }
        // Fallback if model not in list
        return value;
    }, [value, modelsData?.models]);

    const isAuto = !value || value === AUTO_MODEL;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between font-normal",
                        compact && "h-7 text-xs px-2 border-0 bg-transparent hover:bg-accent/50",
                        isAuto && "text-primary",
                        className,
                    )}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <span className="text-muted-foreground truncate">Loading...</span>
                    ) : (
                        <span className="truncate flex items-center gap-1.5">
                            {isAuto && <Sparkles className="h-3.5 w-3.5 shrink-0" />}
                            {selectedModelName}
                        </span>
                    )}
                    <ChevronsUpDown className={cn("ml-1 shrink-0 opacity-50", compact ? "h-3 w-3" : "h-4 w-4")} />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
                <Command>
                    <CommandInput
                        placeholder="Search models..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        <CommandEmpty>No models found.</CommandEmpty>

                        {/* Auto option */}
                        {!hideAuto && (!search || "auto".includes(search.toLowerCase())) && (
                            <>
                                <CommandGroup heading="Recommended">
                                    <CommandItem
                                        value="Auto system selects best model"
                                        onSelect={() => {
                                            onChange(AUTO_MODEL);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                isAuto ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <div className="flex items-center gap-1.5">
                                            <Sparkles className="h-4 w-4 text-primary" />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">Auto</span>
                                                <span className="text-[10px] text-muted-foreground">System selects the best available model</span>
                                            </div>
                                        </div>
                                    </CommandItem>
                                </CommandGroup>
                                <CommandSeparator />
                            </>
                        )}

                        {Object.entries(modelsByProvider).map(([provider, models]) => {
                            // Filter by search term before rendering group
                            const filteredModels = models.filter(m =>
                                m.name?.toLowerCase().includes(search.toLowerCase()) ||
                                m.id.toLowerCase().includes(search.toLowerCase())
                            );

                            if (filteredModels.length === 0) return null;

                            return (
                                <CommandGroup key={provider} heading={provider}>
                                    {filteredModels.map((model) => (
                                        <CommandItem
                                            key={model.id}
                                            value={`${model.name} ${model.id}`}
                                            onSelect={() => {
                                                onChange(model.id);
                                                setOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    value === model.id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">{model.name}</span>
                                                <span className="text-[10px] text-muted-foreground">{model.id}</span>
                                            </div>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            );
                        })}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
