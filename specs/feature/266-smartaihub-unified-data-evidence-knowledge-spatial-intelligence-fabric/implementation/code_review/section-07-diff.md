diff --git a/apps/web/client/src/pages/Admin/__tests__/AdminIntelligenceRegistry.test.tsx b/apps/web/client/src/pages/Admin/__tests__/AdminIntelligenceRegistry.test.tsx
index 24f758d94..dda3c8839 100644
--- a/apps/web/client/src/pages/Admin/__tests__/AdminIntelligenceRegistry.test.tsx
+++ b/apps/web/client/src/pages/Admin/__tests__/AdminIntelligenceRegistry.test.tsx
@@ -138,6 +138,41 @@ describe("AdminIntelligenceRegistry", () => {
     ).toBeNull();
   });

+  it("delegates operational source approval to the Spec 260 review route with checklist evidence", async () => {
+    const operationalSource = {
+      id: "legacy-src-1", sourceRef: "th-rid-levels", displayName: "RID levels", sourceType: "official",
+      dataClassification: "general", canonicalOrigin: "https://example.gov.th", independenceGroup: "rid", jurisdictionRef: "TH",
+      status: "pending_review", createdAt: "2026-10-01T00:00:00.000Z",
+    };
+    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
+      ok: true,
+      json: async () => options?.method === "PATCH" ? {} : { items: [operationalSource] },
+    }));
+    vi.stubGlobal("fetch", fetchMock);
+    render(<AdminIntelligenceRegistry />);
+    fireEvent.click(await screen.findByRole("button", { name: "Review and approve" }));
+    for (const label of [
+      "Verify the HTTPS origin and data owner",
+      "Verify the schema and meaning of the data",
+      "Verify the update cadence and timestamps",
+      "Verify usage rights and redistribution terms",
+      "Verify attribution requirements",
+      "Verify permitted purpose and geographic scope",
+    ]) fireEvent.click(screen.getByRole("checkbox", { name: label }));
+    fireEvent.change(screen.getByLabelText("Approval rationale"), { target: { value: "Verified source documents" } });
+    fireEvent.click(screen.getByRole("button", { name: "Approve source" }));
+    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(true));
+    const [reviewUrl, reviewOptions] = fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH")!;
+    expect(reviewUrl).toBe("/api/operations/emergency/intelligence/sources/legacy-src-1");
+    expect(reviewOptions).toMatchObject({ method: "PATCH", credentials: "include" });
+    expect(JSON.parse(String(reviewOptions?.body))).toEqual({
+      status: "active",
+      reason: "Verified source documents [endpoint=verified, schema=verified, cadence=verified, rights=verified, attribution=verified, purpose=verified]",
+    });
+    expect(await screen.findByText("Source approved")).toBeTruthy();
+    vi.unstubAllGlobals();
+  });
+
   it("keeps refresh available and retries load failures", () => {
     mocks.query = {
       data: [],
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-07-governance-admin-observability.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-07-governance-admin-observability.md
index 3aeb75389..506abd204 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-07-governance-admin-observability.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-07-governance-admin-observability.md
@@ -10,15 +10,88 @@ Spec 266 §§32–33, 38–43, 48–49, 46 and 47.

 ## Implementation

-- UI uses established platform admin and Astryx components; every control calls a real authorized service and exposes loading/empty/error/success state.
-- Source/pack/index kill switches are scoped and audited.
-- Telemetry excludes secrets and raw restricted payloads.
-- Production evidence is recorded separately from local code evidence.
+- Reuse the existing `intelligenceRegistry` router and Admin Intelligence Registry surface where they satisfy the contract. Bind admin actions to server authorization, source/dataset scope, current policy, reason, and immutable audit evidence; the client must not fabricate state.
+- Source, pack, and index kill switches are scoped, authenticated, idempotent, audited, and effective at the next authorization/resolution boundary.
+- Pack install/export requires signer+digest integrity, dependency/permission review, rights and redistribution approval, revocation, and rollback semantics. Provider traces are observability only.
+- Redact credentials, restricted payloads, and unsafe provider text. Bound metric dimensions and retention.
+- Keep canonical KnowledgeSpace/Document/Page/Chunk/Source/Claim/Citation identities and stable source anchors distinct from indexes. Import/export re-evaluates rights and scope. Provider/runtime mechanics remain Spec 278; managed retrieval remains Spec 229. Schema-backed object persistence is deferred while the schema-owner marker is active.
+- Any UI change uses repository Astryx components and token rules; implement loading/empty/error/success/disabled states, keyboard/focus/labels, responsive layout, and browser evidence. If no UI change is needed for a local gate, record N/A.
+- Separate local evidence from environment/provider/deployment/rollback evidence.

 ## Tests

-- Authorization and audit tests for administrative mutations; observability redaction and scoped kill switch.
+- Extend protected router/admin tests for role/scope enforcement, audit records, kill-switch idempotency/effect, redaction, pack tampering/rights, and UI states/browser-visible route behavior when changed.

 ## Acceptance

 Spec 266 §§46–47 and 48 non-goals.
+
+## UI/UX Contract
+
+### Target User / JTBD
+- Role: authorized platform administrator or source reviewer.
+- Goal: review source evidence/rights and understand whether a provider is still disabled, pending, approved, revoked, or unhealthy.
+- Entry point: existing Admin Intelligence Registry route.
+- Success outcome: perform only authorized review actions with a durable audit result and clear status feedback.
+
+### Existing Pattern Reference
+- Searched: `rg -n "AdminIntelligenceRegistry|intelligenceRegistry" apps/web/client/src` and `rg -n "EmptyState|Table|loading" apps/web/client/src/pages/Admin`.
+- Found: `apps/web/client/src/pages/Admin/AdminIntelligenceRegistry.tsx` and its tests; it already uses Astryx `Table`, `EmptyState`, `Banner`, `StatusDot`, `Dialog`, `Button`, `TextInput`, `VStack`, and `HStack`. `AdminOpsDashboard.tsx` is a neighboring admin status-surface reference.
+- Decision: reuse the existing registry page and its component/state patterns; avoid a parallel admin surface.
+- Design token extraction: existing Astryx components/theme provide semantic colors, typography, spacing, radius, borders, and focus treatment. Prefer those component props/tokens; no raw color/spacing overrides.
+
+### Surface Inventory
+| Surface | File/route | Change |
+|---|---|---|
+| Admin Intelligence Registry | `client/src/pages/Admin/AdminIntelligenceRegistry.tsx` | Extend only for real authorized governance state/action contracts |
+| tRPC registry API | `server/routers/intelligenceRegistry.ts` | Authorize and audit server-side; no client-only status mutation |
+
+### Component Map
+| Component | File | Owns | Consumes |
+|---|---|---|---|
+| AdminIntelligenceRegistry | Existing page | Candidate/pending lists, review dialog, status feedback | Protected tRPC registry queries/mutations |
+| Astryx Table/EmptyState/Banner/StatusDot/Dialog | Existing imports | Dense row layout and accessible states | Existing theme tokens |
+
+### State Matrix
+| State | Expected UI | Verification |
+|---|---|---|
+| loading | Existing loading indication; prevent duplicate review submit | Component test |
+| empty | Explain that no source candidates or pending items exist | Component test |
+| error | Safe, actionable error without provider payload or secret | Component/router test |
+| success | Confirm pending/review result and whether source remains disabled | Component test |
+| partial success | Show independent result per selected source; no implied batch activation | Component test if batch flow exists |
+| disabled/selected/hover/focus | Explain unavailable action, retain visible focus and row selection | Keyboard/component test |
+
+### Responsive Matrix
+| Viewport | Expected behavior | Evidence |
+|---|---|---|
+| mobile 390x844 | Dense tables become readable without page-level horizontal overflow; actions remain reachable | Browser evidence |
+| tablet 768x1024 | Preserve row identity and review action grouping | Browser evidence |
+| desktop 1440x900 | Use available admin width with clear section hierarchy | Browser evidence |
+| small-mobile 360x800 | Check long source names and dialogs | Extended if table/dialog changes |
+| laptop 1024x768 | Check dialog and table fit | Extended if changed |
+| wide-desktop 1280x800 | Check dense catalog columns | Extended if changed |
+
+### Accessibility Acceptance
+- Keyboard path: tab to each row action, enter review dialog, traverse fields, submit/cancel, return focus to invoking row.
+- Focus visibility: use existing Astryx focus styles and preserve visible focus.
+- Labels/semantics: table headers and form controls have accessible names; status is text plus visual indicator.
+- Contrast: retain existing theme semantic status tokens.
+- Reduced motion: do not add nonessential motion; respect existing theme behavior.
+
+### Copy Contract
+- Tone: concise, operational, explicit about whether a source can fetch data.
+- Primary languages: Thai and English via existing `i18n`/locale selection.
+- Labels: use existing translations and terminology for candidate, pending review, active, revoked, rights, attribution, and evidence.
+- Validation/error: do not reveal restricted source payloads; explain policy/status failure safely.
+- Empty/loading/success: state whether no candidate exists, data is loading, or submission was accepted for review; never imply activation without server proof.
+- Localization fallback: follow existing `i18n` locale behavior.
+
+### Browser Evidence Required
+- Follow Orchestra UI browser verification. For a UI change, record mobile 390x844, tablet 768x1024, and desktop 1440x900; extended sizes apply to dense table/dialog changes. Skipped automation is not a pass.
+
+## Implementation evidence (2026-10-05)
+
+- Existing Admin Intelligence Registry separates the researched catalog/Fabric pending-review queue from the operational Spec 260 source queue. Its operational approval dialog delegates the durable status transition and audit to the Spec 260-owned review route. Pending candidates are explicitly not connected or fetchable; client checklist state does not activate Fabric records.
+- Existing protected registry routes derive tenant scope from the authenticated account, reserve candidate catalog visibility for admins, and map persistence errors to safe messages. Focused proof: `pnpm --filter @smartspec/web exec vitest run server/routers/intelligenceRegistry.test.ts client/src/pages/Admin/__tests__/AdminIntelligenceRegistry.test.tsx` — 2 files, 10 tests passed after adding a pending operational source approval/PATCH contract test.
+- No new Fabric approval/kill-switch writer was introduced because rights receipt, audit and activation persistence are absent and schema ownership is gated. Pack signing/export, scoped kill switches, health metrics, runtime revocation and browser viewport evidence remain open gates; existing UI is not claimed to implement them.
