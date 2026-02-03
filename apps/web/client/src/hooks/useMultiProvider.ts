/**
 * Hook for multi-provider model data
 * Wraps the tRPC query with loading/error states and default provider selection
 */

import { trpc } from "../lib/trpc";
import { getCheapestProvider, type AvailableModel, type ModelProvider } from "../lib/modelPricing";
import { useState, useCallback, useMemo } from "react";

export function useMultiProvider() {
  const modelsQuery = trpc.multiProvider.getAvailableModelsWithProviders.useQuery(
    undefined,
    { retry: 1, staleTime: 60_000 },
  );

  const models = useMemo(() => {
    return (modelsQuery.data ?? []) as AvailableModel[];
  }, [modelsQuery.data]);

  return {
    models,
    isLoading: modelsQuery.isLoading,
    error: modelsQuery.error,
  };
}

export function useModelSelection() {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);

  const selectModel = useCallback((model: AvailableModel, provider?: ModelProvider) => {
    setSelectedModelId(model.modelId);
    const chosen = provider ?? getCheapestProvider(model.providers);
    setSelectedProviderId(chosen?.providerId ?? null);
  }, []);

  const selectProvider = useCallback((providerId: number) => {
    setSelectedProviderId(providerId);
  }, []);

  return {
    selectedModelId,
    selectedProviderId,
    selectModel,
    selectProvider,
  };
}
