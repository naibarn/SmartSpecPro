import { useQuery } from "@tanstack/react-query";

import {
  getTauriLocalSkillRuntimeStatus,
  type TauriLocalSkillRuntimeStatus,
} from "./tauriSkillRuntime";

const DEFAULT_STATUS: TauriLocalSkillRuntimeStatus = {
  available: false,
  supportsScriptBundle: false,
  supportsGemma4Text: false,
  supportsGemma4Image: false,
  supportsGemma4Voice: false,
  nodePath: null,
  litertLmPath: null,
  runtimeRoot: null,
  managedModelRoot: null,
  bundleMode: null,
  gemmaProfileIds: [],
  bundledGemmaProfileIds: [],
  installedGemmaProfileIds: [],
  reason: "not_tauri",
};

export function useTauriLocalSkillRuntimeStatus(): TauriLocalSkillRuntimeStatus {
  const isTauri =
    typeof window !== "undefined" && (window as any).__TAURI__ != null;

  const query = useQuery({
    queryKey: ["local-ai", "tauri-skill-runtime"],
    queryFn: getTauriLocalSkillRuntimeStatus,
    enabled: isTauri,
    staleTime: 30_000,
  });

  if (!isTauri) {
    return DEFAULT_STATUS;
  }

  return query.data ?? DEFAULT_STATUS;
}
