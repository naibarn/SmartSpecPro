import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search,
  Bot,
  Loader2,
  Check,
  Zap,
  ChevronDown,
  X,
} from "lucide-react";

export interface LLMModel {
  modelId: string;
  modelName: string;
  providers: Array<{
    providerId: string;
    providerName: string;
    pricingInput?: number;
    pricingOutput?: number;
    isFree?: boolean;
    contextLength?: number;
  }>;
}

interface LLMModelSelectorProps {
  models: LLMModel[];
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export default function LLMModelSelector({
  models,
  selectedModelId,
  onSelect,
  isLoading,
  placeholder = "Select default LLM model...",
}: LLMModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Extract unique providers
  const providers = useMemo(() => {
    const providerMap = new Map<string, string>();
    models.forEach((model) => {
      model.providers.forEach((p) => {
        if (!providerMap.has(p.providerId)) {
          providerMap.set(p.providerId, p.providerName);
        }
      });
    });
    return Array.from(providerMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));
  }, [models]);

  // Filter and sort models
  const filteredModels = useMemo(() => {
    let result = models;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (model) =>
          model.modelName.toLowerCase().includes(query) ||
          model.modelId.toLowerCase().includes(query) ||
          model.providers.some((p) =>
            p.providerName.toLowerCase().includes(query)
          )
      );
    }

    // Filter by provider
    if (selectedProvider) {
      result = result.filter((model) =>
        model.providers.some((p) => p.providerId === selectedProvider)
      );
    }

    return result;
  }, [models, searchQuery, selectedProvider]);

  // Find selected model
  const selectedModel = useMemo(() => {
    return models.find((m) => m.modelId === selectedModelId);
  }, [models, selectedModelId]);

  const handleSelect = (modelId: string) => {
    onSelect(modelId);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect("");
    setSearchQuery("");
  };

  return (
    <div className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isOpen && "ring-2 ring-ring ring-offset-2"
        )}
        disabled={isLoading}
      >
        <div className="flex items-center gap-2 flex-1 overflow-hidden">
          <Bot className="h-4 w-4 shrink-0 text-blue-500" />
          {selectedModel ? (
            <span className="truncate">{selectedModel.modelName}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selectedModel && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClear(e as any);
                }
              }}
              className="p-0.5 hover:bg-accent rounded cursor-pointer"
              aria-label="Clear selection"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full rounded-md border bg-popover p-4 shadow-md animate-in fade-in-0 zoom-in-95">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Provider Filters */}
          {providers.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={selectedProvider === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedProvider(null)}
              >
                All Providers
              </Button>
              {providers.map((provider) => (
                <Button
                  key={provider.id}
                  type="button"
                  variant={
                    selectedProvider === provider.id ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedProvider(provider.id)}
                >
                  {provider.name}
                </Button>
              ))}
            </div>
          )}

          {/* Model List */}
          <div className="max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No models found
              </div>
            ) : (
              <div className="space-y-1">
                {filteredModels.map((model) => {
                  const isSelected = model.modelId === selectedModelId;
                  const primaryProvider = model.providers[0];

                  return (
                    <button
                      key={model.modelId}
                      type="button"
                      onClick={() => handleSelect(model.modelId)}
                      className={cn(
                        "w-full rounded-md p-3 text-left transition-colors",
                        "hover:bg-accent",
                        isSelected && "bg-accent"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium truncate">
                              {model.modelName}
                            </h4>
                            {isSelected && (
                              <Check className="h-4 w-4 shrink-0 text-primary" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mb-2">
                            {model.modelId}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {model.providers.map((provider) => (
                              <Badge
                                key={`${model.modelId}-${provider.providerId}`}
                                variant="secondary"
                                className="text-xs"
                              >
                                {provider.providerName}
                                {provider.isFree && (
                                  <Zap className="ml-1 h-3 w-3 inline" />
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {primaryProvider && (
                          <div className="text-right shrink-0">
                            {primaryProvider.contextLength && (
                              <p className="text-xs text-muted-foreground">
                                {(
                                  primaryProvider.contextLength / 1000
                                ).toFixed(0)}
                                K ctx
                              </p>
                            )}
                            {!primaryProvider.isFree &&
                              primaryProvider.pricingInput &&
                              typeof primaryProvider.pricingInput === 'number' && (
                                <p className="text-xs text-muted-foreground">
                                  ${primaryProvider.pricingInput.toFixed(3)}/1K
                                </p>
                              )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
