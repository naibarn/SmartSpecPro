import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { getPrivateVaultAccessToken } from "@/lib/privateVault";

export interface FinanceVaultAccessState {
  isLoading: boolean;
  privateVaultEnabled: boolean;
  locked: boolean;
  hasAccess: boolean;
  privateVaultToken: string | null;
  setPrivateVaultTokenState: Dispatch<SetStateAction<string | null>>;
}

export function useFinanceVaultAccess(): FinanceVaultAccessState {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [privateVaultToken, setPrivateVaultTokenState] = useState<string | null>(() => getPrivateVaultAccessToken());

  const preferencesQuery = trpc.users.getPreferences.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncToken = () => setPrivateVaultTokenState(getPrivateVaultAccessToken());
    syncToken();
    window.addEventListener("storage", syncToken);
    return () => window.removeEventListener("storage", syncToken);
  }, []);

  const privateVaultEnabled = Boolean(preferencesQuery.data?.privateVault?.enabled);
  const locked = privateVaultEnabled && !privateVaultToken;
  const isLoading = authLoading || preferencesQuery.isLoading;
  const hasAccess = !isLoading && !locked;

  return {
    isLoading,
    privateVaultEnabled,
    locked,
    hasAccess,
    privateVaultToken,
    setPrivateVaultTokenState,
  };
}
