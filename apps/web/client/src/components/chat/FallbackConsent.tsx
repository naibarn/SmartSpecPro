/**
 * FallbackConsent — Inline banner shown when a free model fails and a paid fallback is available
 *
 * Displays the failed provider, the fallback provider with estimated cost,
 * and accept/reject buttons. On accept, triggers a re-send with preferredProvider.
 */

import { formatModelCost } from "../../lib/modelPricing";

interface FallbackConsentProps {
  fromProvider: string;
  toProvider: string;
  toProviderId: number;
  estimatedCredits: number;
  onAccept: (providerId: number) => void;
  onReject: () => void;
}

export function FallbackConsent({
  fromProvider,
  toProvider,
  toProviderId,
  estimatedCredits,
  onAccept,
  onReject,
}: FallbackConsentProps) {
  return (
    <div className="mx-4 my-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-yellow-500">⚡</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Free provider unavailable
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium">{fromProvider}</span> is currently unavailable.
            Would you like to use <span className="font-medium">{toProvider}</span> instead?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Estimated cost: ~{estimatedCredits} credits
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onAccept(toProviderId)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Use {toProvider}
            </button>
            <button
              onClick={onReject}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
