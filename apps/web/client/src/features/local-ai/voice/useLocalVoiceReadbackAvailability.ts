import { useQuery } from "@tanstack/react-query";

import {
  getLocalVoiceReadbackAvailability,
  getTauriLocalVoiceReadbackStatus,
  type LocalVoiceReadbackAvailability,
} from "./localVoiceReadback";

const DEFAULT_BROWSER_AVAILABILITY = getLocalVoiceReadbackAvailability();

export function useLocalVoiceReadbackAvailability(): LocalVoiceReadbackAvailability & {
  backend: string | null;
} {
  const isTauri =
    typeof window !== "undefined" && (window as any).__TAURI__ != null;

  const query = useQuery({
    queryKey: ["local-ai", "voice-readback-status"],
    queryFn: getTauriLocalVoiceReadbackStatus,
    enabled: isTauri,
    staleTime: 30_000,
  });

  if (!isTauri) {
    return {
      ...DEFAULT_BROWSER_AVAILABILITY,
      backend: DEFAULT_BROWSER_AVAILABILITY.supported ? "speechSynthesis" : null,
    };
  }

  if (query.data?.available) {
    return {
      supported: true,
      reason: null,
      backend: query.data.backend ?? "native",
    };
  }

  if (DEFAULT_BROWSER_AVAILABILITY.supported) {
    return {
      ...DEFAULT_BROWSER_AVAILABILITY,
      backend: "speechSynthesis",
    };
  }

  return {
    supported: false,
    reason: "native_tts_backend_unavailable",
    backend: null,
  };
}
