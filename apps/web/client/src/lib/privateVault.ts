export const PRIVATE_VAULT_TOKEN_STORAGE_KEY = "smartspec.privateVault.accessToken";

export function getPrivateVaultAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(PRIVATE_VAULT_TOKEN_STORAGE_KEY);
  return token && token.trim() ? token.trim() : null;
}

export function setPrivateVaultAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  const normalized = token.trim();
  if (!normalized) {
    window.localStorage.removeItem(PRIVATE_VAULT_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(PRIVATE_VAULT_TOKEN_STORAGE_KEY, normalized);
}

export function clearPrivateVaultAccessToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PRIVATE_VAULT_TOKEN_STORAGE_KEY);
}

export function hasPrivateVaultAccessToken(): boolean {
  return Boolean(getPrivateVaultAccessToken());
}

