import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";
import type { CanonicalWorkerRouteId, WorkerLocale } from "./workerRoutes";

type WorkerAppContextValue = {
  activeRoute: CanonicalWorkerRouteId;
  locale: WorkerLocale;
  selectedSeriesId: string | null;
  selectedRootId: string | null;
  setSelectedSeriesId: (seriesId: string | null) => void;
  setSelectedRootId: (rootId: string | null) => void;
};

const WorkerAppContext = createContext<WorkerAppContextValue | null>(null);

export function WorkerAppProvider({ activeRoute, locale = "en", children }: PropsWithChildren<{ activeRoute: CanonicalWorkerRouteId; locale?: WorkerLocale }>) {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const value = useMemo(() => ({ activeRoute, locale, selectedSeriesId, selectedRootId, setSelectedSeriesId, setSelectedRootId }), [activeRoute, locale, selectedSeriesId, selectedRootId]);
  return <WorkerAppContext.Provider value={value}>{children}</WorkerAppContext.Provider>;
}

export function useWorkerAppContext(): WorkerAppContextValue {
  const value = useContext(WorkerAppContext);
  if (!value) throw new Error("useWorkerAppContext must be used inside WorkerAppProvider");
  return value;
}
