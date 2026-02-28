import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";

interface ModelPickerProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export function ModelPicker({ value, onChange, className }: ModelPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const { data: modelsData, isLoading } = trpc.llmProviders.availableModels.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });

    // Group models by provider
    const modelsByProvider = useMemo(() => {
        if (!modelsData?.models) return {};

        // Default fallback models if none exist yet
        if (modelsData.models.length === 0) {
            return {
                "Built-in": [
                    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
                    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
                    { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", provider: "anthropic" },
                    { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", provider: "anthropic" },
                ]
            };
        }

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
        if (!value) return "Select model...";

        if (modelsData?.models) {
            const found = modelsData.models.find(m => m.id === value);
            if (found) return found.name || found.id;
        }
        // Fallback if model not in list
        return value;
    }, [value, modelsData?.models]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between font-normal", className)}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <span className="text-muted-foreground truncate">Loading models...</span>
                    ) : (
                        <span className="truncate">{selectedModelName}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
