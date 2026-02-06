import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search,
  Bot,
  Image,
  Video,
  Music,
  Loader2,
  Check,
  Zap,
  Star,
} from "lucide-react";

export interface MediaModel {
  id?: number;
  modelId: string;
  name: string;
  description?: string;
  providerId?: string;
  providerName?: string;
  creditCost?: number;
  isDefault?: boolean;
  isEnabled?: boolean;
  capabilities?: string[];
}

export interface MediaProvider {
  id: string;
  name: string;
  displayName?: string;
  isEnabled?: boolean;
}

interface ModelSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: MediaModel[];
  providers?: MediaProvider[];
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  mediaType: "image" | "video" | "audio";
  isLoading?: boolean;
}

export default function ModelSelectorDialog({
  open,
  onOpenChange,
  models,
  providers = [],
  selectedModelId,
  onSelect,
  mediaType,
  isLoading,
}: ModelSelectorDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Get icon for media type
  const getMediaIcon = () => {
    switch (mediaType) {
      case "image":
        return <Image className="h-5 w-5 text-purple-500" />;
      case "video":
        return <Video className="h-5 w-5 text-blue-500" />;
      case "audio":
        return <Music className="h-5 w-5 text-orange-500" />;
      default:
        return <Bot className="h-5 w-5" />;
    }
  };

  // Filter and sort models
  const filteredModels = useMemo(() => {
    let result = models;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (model) =>
          model.name.toLowerCase().includes(query) ||
          model.modelId.toLowerCase().includes(query) ||
          model.description?.toLowerCase().includes(query) ||
          model.providerName?.toLowerCase().includes(query)
      );
    }

    // Filter by provider
    if (selectedProvider) {
      result = result.filter((model) => model.providerId === selectedProvider);
    }

    // Sort: default first, then by name
    return result.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [models, searchQuery, selectedProvider]);

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, MediaModel[]> = {};
    filteredModels.forEach((model) => {
      const providerName = model.providerName || "Other";
      if (!groups[providerName]) {
        groups[providerName] = [];
      }
      groups[providerName].push(model);
    });
    return groups;
  }, [filteredModels]);

  const handleSelect = (modelId: string) => {
    onSelect(modelId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getMediaIcon()}
            Select {mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} Model
          </DialogTitle>
          <DialogDescription>
            Choose a model from the available {mediaType} generation models
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Provider Filter Pills */}
        {providers.length > 0 && (
          <div className="flex flex-wrap gap-2 max-h-16 overflow-y-auto">
            <Badge
              variant={selectedProvider === null ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-colors",
                selectedProvider === null
                  ? "bg-purple-500 hover:bg-purple-600"
                  : "hover:bg-purple-100"
              )}
              onClick={() => setSelectedProvider(null)}
            >
              All Providers
            </Badge>
            {providers
              .filter((p) => p.isEnabled !== false)
              .map((provider) => (
                <Badge
                  key={provider.id}
                  variant={selectedProvider === provider.id ? "default" : "outline"}
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedProvider === provider.id
                      ? "bg-purple-500 hover:bg-purple-600"
                      : "hover:bg-purple-100"
                  )}
                  onClick={() => setSelectedProvider(provider.id)}
                >
                  {provider.displayName || provider.name}
                </Badge>
              ))}
          </div>
        )}

        {/* Content - scrollable model list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : (
          <div className="pr-2">
            <div className="space-y-4">
              {Object.entries(groupedModels).map(([providerName, providerModels]) => (
                <div key={providerName} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground sticky top-0 bg-background py-1 z-10">
                    {providerName}
                  </h4>
                  <div className="grid gap-2">
                    {providerModels.map((model, index) => (
                      <ModelCard
                        key={model.id ?? `${model.modelId}-${index}`}
                        model={model}
                        isSelected={model.modelId === selectedModelId}
                        onSelect={() => handleSelect(model.modelId)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* No results */}
              {filteredModels.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No models found</p>
                  {searchQuery && (
                    <p className="text-sm mt-1">
                      Try adjusting your search query
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Model Card Component
interface ModelCardProps {
  model: MediaModel;
  isSelected: boolean;
  onSelect: () => void;
}

function ModelCard({ model, isSelected, onSelect }: ModelCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left p-4 rounded-xl border-2 transition-all duration-200",
        isSelected
          ? "border-purple-500 bg-purple-50/50 ring-2 ring-purple-200"
          : "border-gray-200 hover:border-purple-300 hover:bg-purple-50/30"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{model.name}</span>
            {model.isDefault && (
              <Badge className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0">
                <Star className="h-3 w-3 mr-0.5 inline" />
                Default
              </Badge>
            )}
            {isSelected && (
              <Badge className="bg-purple-500 text-white text-[10px] px-1.5 py-0">
                Selected
              </Badge>
            )}
          </div>

          {model.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {model.description}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {model.modelId}
            </Badge>
            {model.creditCost !== undefined && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700"
              >
                <Zap className="h-3 w-3 mr-0.5 inline" />
                {model.creditCost} credits
              </Badge>
            )}
            {model.capabilities?.slice(0, 2).map((cap, idx) => (
              <Badge
                key={`${cap}-${idx}`}
                variant="outline"
                className="text-[10px] px-1.5 py-0"
              >
                {cap}
              </Badge>
            ))}
          </div>
        </div>

        {/* Check indicator */}
        {isSelected && (
          <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}
