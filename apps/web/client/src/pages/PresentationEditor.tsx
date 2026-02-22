import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { buildWrongEditorOpenGuard } from "@/lib/presentationRouting";
import {
  PRESENTATION_EDITOR_ROUTE_BASE,
  PRESENTATION_ITEM_TYPE,
} from "@shared/presentation/constants";

function parseDocId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function PresentationEditor() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [, routeParams] = useRoute(`${PRESENTATION_EDITOR_ROUTE_BASE}/:docId`);
  const docId = parseDocId(routeParams?.docId);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const itemQuery = trpc.library.getItem.useQuery(
    { id: docId || 0 },
    { enabled: Boolean(docId && isAuthenticated) },
  );

  const itemType = String((itemQuery.data as any)?.itemType ?? "");

  const guardQuery = trpc.presentation.guardEditorOpen.useQuery(
    { itemId: docId || 0, itemType: itemType || PRESENTATION_ITEM_TYPE },
    { enabled: Boolean(docId && itemType) },
  );

  if (!docId) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-sm text-red-600">Invalid presentation route.</p>
      </div>
    );
  }

  if (itemQuery.isLoading || guardQuery.isLoading) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-sm text-muted-foreground">Loading presentation editor...</p>
      </div>
    );
  }

  if (itemQuery.error || !itemQuery.data) {
    const fallback = buildWrongEditorOpenGuard(docId, "unknown");
    return (
      <div className="min-h-screen p-8 space-y-4">
        <h1 className="text-xl font-semibold">Presentation unavailable</h1>
        <p className="text-sm text-muted-foreground">{itemQuery.error?.message || "Library item not found."}</p>
        <Button onClick={() => setLocation(fallback.recoveryCta.href)}>{fallback.recoveryCta.label}</Button>
      </div>
    );
  }

  if (guardQuery.data && !guardQuery.data.allowed) {
    return (
      <div className="min-h-screen p-8 space-y-4">
        <h1 className="text-xl font-semibold">Wrong editor route</h1>
        <p className="text-sm text-muted-foreground">{guardQuery.data.message}</p>
        <Button onClick={() => setLocation(guardQuery.data.recoveryCta.href)}>
          {guardQuery.data.recoveryCta.label}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 space-y-2">
      <h1 className="text-2xl font-semibold">Presentation Editor</h1>
      <p className="text-sm text-muted-foreground">
        Presentation #{docId} loaded. Item type: <code>{itemType || PRESENTATION_ITEM_TYPE}</code>
      </p>
      <p className="text-sm text-muted-foreground">
        Section 01 foundation is active; slide/canvas editing modules are added in later sections.
      </p>
    </div>
  );
}
