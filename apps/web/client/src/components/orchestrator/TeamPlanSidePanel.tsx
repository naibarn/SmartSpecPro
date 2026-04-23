import React from "react";

import { AutoTeamLedgerPanel } from "./AutoTeamLedgerPanel";

export function TeamPlanSidePanel(
  props: React.ComponentProps<typeof AutoTeamLedgerPanel>,
) {
  return <AutoTeamLedgerPanel {...props} />;
}
