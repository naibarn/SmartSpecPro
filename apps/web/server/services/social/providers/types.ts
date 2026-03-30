export type SocialProviderLifecycle = "available" | "planned";

export interface SocialProviderScaffold {
  providerId: string;
  label: string;
  summary: string;
  status: SocialProviderLifecycle;
  actions: string[];
  notes: string;
}
