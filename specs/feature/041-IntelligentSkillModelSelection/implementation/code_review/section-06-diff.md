diff --git a/apps/web/client/src/components/admin/MultiProviderAdmin.tsx b/apps/web/client/src/components/admin/MultiProviderAdmin.tsx
index 6cb95428..b09611b4 100644
--- a/apps/web/client/src/components/admin/MultiProviderAdmin.tsx
+++ b/apps/web/client/src/components/admin/MultiProviderAdmin.tsx
@@ -10,16 +10,30 @@
 
 import { useEffect, useMemo, useState } from "react";
 import { toast } from "sonner";
+import { Lock, Info } from "lucide-react";
 import { trpc } from "../../lib/trpc";
 import { formatModelCost } from "../../lib/modelPricing";
+import {
+  Tooltip,
+  TooltipContent,
+  TooltipTrigger,
+} from "../ui/tooltip";
 import { Button } from "../ui/button";
 import { Input } from "../ui/input";
 import { Checkbox } from "../ui/checkbox";
 import { Badge } from "../ui/badge";
+import {
+  Dialog,
+  DialogContent,
+  DialogDescription,
+  DialogHeader,
+  DialogTitle,
+} from "../ui/dialog";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
 import {
-  filterFlatModelMappings,
+  filterAdminModelCatalogRows,
   filterModelMappingGroups,
+  getAdminModelSelectionKey,
 } from "./multiProviderAdminModelMappings";
 
 type Tab = "mappings" | "rules" | "health" | "usage";
@@ -105,14 +119,88 @@ const emptyMappingForm: MappingForm = {
   apiStyle: "chat-completions",
 };
 
+function PriorityInlineEditor({
+  mappingId,
+  priority,
+  priorityLocked,
+  onMutationSuccess,
+}: {
+  mappingId: number;
+  priority: number;
+  priorityLocked: boolean;
+  onMutationSuccess: () => void;
+}) {
+  const [localValue, setLocalValue] = useState(String(priority));
+  const [lastSaved, setLastSaved] = useState(priority);
+
+  useEffect(() => {
+    setLocalValue(String(priority));
+    setLastSaved(priority);
+  }, [priority]);
+
+  const mutation = trpc.multiProvider.updateModelPriority.useMutation({
+    onSuccess: () => {
+      onMutationSuccess();
+      setLastSaved(Number(localValue));
+    },
+    onError: () => {
+      setLocalValue(String(lastSaved));
+      toast.error("Failed to update priority");
+    },
+  });
+
+  const handleBlur = () => {
+    const numValue = Number(localValue);
+    if (isNaN(numValue) || numValue < 0 || numValue > 999) {
+      setLocalValue(String(lastSaved));
+      return;
+    }
+    if (numValue === lastSaved) {
+      return;
+    }
+    mutation.mutate({ mappingId, priority: numValue });
+  };
+
+  return (
+    <span className="inline-flex items-center gap-1">
+      <span className="text-xs text-muted-foreground">Priority:</span>
+      <input
+        type="number"
+        min={0}
+        max={999}
+        value={localValue}
+        onChange={(e) => setLocalValue(e.target.value)}
+        onBlur={handleBlur}
+        className="w-14 rounded border border-input bg-transparent px-1 py-0.5 text-xs text-center"
+        aria-label="Priority"
+      />
+      <Tooltip>
+        <TooltipTrigger asChild>
+          {priorityLocked ? (
+            <Lock size={14} className="text-muted-foreground" data-testid="priority-locked-icon" />
+          ) : (
+            <Info size={14} className="text-muted-foreground" data-testid="priority-auto-icon" />
+          )}
+        </TooltipTrigger>
+        <TooltipContent>
+          {priorityLocked
+            ? "Manually set. Re-import won't change this."
+            : "Auto-assigned."}
+        </TooltipContent>
+      </Tooltip>
+    </span>
+  );
+}
+
 function ModelMappingsTab() {
   type MappingView = "all" | "groups";
 
   const { data: mappings, isLoading } = trpc.multiProvider.listModelMappings.useQuery();
+  const { data: catalogRows, isLoading: isCatalogLoading } = trpc.multiProvider.listAdminModelCatalog.useQuery();
   const { data: providers } = trpc.llmProviders.adminList.useQuery();
   const upsertMutation = trpc.multiProvider.upsertModelMapping.useMutation();
   const deleteMutation = trpc.multiProvider.deleteModelMapping.useMutation();
-  const bulkSetEnabledMutation = trpc.multiProvider.bulkSetModelMappingsEnabled.useMutation();
+  const bulkSetCatalogEnabledMutation = trpc.multiProvider.bulkSetAdminModelCatalogEnabled.useMutation();
   const utils = trpc.useUtils();
 
   const [showForm, setShowForm] = useState(false);
@@ -120,29 +208,25 @@ function ModelMappingsTab() {
   const [form, setForm] = useState<MappingForm>(emptyMappingForm);
   const [searchQuery, setSearchQuery] = useState("");
   const [providerFilter, setProviderFilter] = useState("all");
-  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
+  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
   const [mappingView, setMappingView] = useState<MappingView>("all");
 
-  const allMappingIds = useMemo(
-    () => Object.values(mappings ?? {}).flatMap((rows) => rows.map((row) => row.id)),
-    [mappings],
+  const allSelectableKeys = useMemo(
+    () => (catalogRows ?? []).map((row) => getAdminModelSelectionKey(row)),
+    [catalogRows],
   );
 
   useEffect(() => {
-    const validIds = new Set(allMappingIds);
-    setSelectedIds((previous) => {
-      const next = new Set(Array.from(previous).filter((id) => validIds.has(id)));
+    const validKeys = new Set(allSelectableKeys);
+    setSelectedKeys((previous) => {
+      const next = new Set(Array.from(previous).filter((key) => validKeys.has(key)));
       return next.size === previous.size ? previous : next;
     });
-  }, [allMappingIds]);
+  }, [allSelectableKeys]);
 
-  const filteredMappings = useMemo(
-    () => filterFlatModelMappings({
-      groupedMappings: mappings,
-      searchQuery,
-      providerFilter,
-    }),
-    [mappings, providerFilter, searchQuery],
+  const filteredCatalogRows = useMemo(
+    () => filterAdminModelCatalogRows(catalogRows, searchQuery, providerFilter),
+    [catalogRows, providerFilter, searchQuery],
   );
 
   const filteredGroups = useMemo(
@@ -154,16 +238,15 @@ function ModelMappingsTab() {
     [mappings, providerFilter, searchQuery],
   );
 
-  const visibleMappingIds = useMemo(() => filteredMappings.map((mapping) => mapping.id), [filteredMappings]);
   const visibleSelectedCount = useMemo(
-    () => visibleMappingIds.filter((id) => selectedIds.has(id)).length,
-    [selectedIds, visibleMappingIds],
+    () => filteredCatalogRows.filter((row) => selectedKeys.has(getAdminModelSelectionKey(row))).length,
+    [filteredCatalogRows, selectedKeys],
   );
   const totalVisibleEnabled = useMemo(
-    () => filteredMappings.filter((mapping) => mapping.isEnabled).length,
-    [filteredMappings],
+    () => filteredCatalogRows.filter((mapping) => mapping.isEnabled).length,
+    [filteredCatalogRows],
   );
-  const allFilteredSelected = visibleMappingIds.length > 0 && visibleSelectedCount === visibleMappingIds.length;
+  const allFilteredSelected = filteredCatalogRows.length > 0 && visibleSelectedCount === filteredCatalogRows.length;
   const someFilteredSelected = visibleSelectedCount > 0 && !allFilteredSelected;
 
   const resetForm = () => {
@@ -175,19 +258,21 @@ function ModelMappingsTab() {
   const invalidateMappingQueries = async () => {
     await Promise.all([
       utils.multiProvider.listModelMappings.invalidate(),
+      utils.multiProvider.listAdminModelCatalog.invalidate(),
       utils.multiProvider.getAvailableModelsWithProviders.invalidate(),
       utils.llmProviders.adminList.invalidate(),
     ]);
   };
 
-  const setSelectionForIds = (ids: number[], checked: boolean) => {
-    setSelectedIds((previous) => {
+  const setSelectionForRows = (rows: Array<{ mappingId: number | null; providerId: number; providerModelId: string }>, checked: boolean) => {
+    setSelectedKeys((previous) => {
       const next = new Set(previous);
-      ids.forEach((id) => {
+      rows.forEach((row) => {
+        const key = getAdminModelSelectionKey(row);
         if (checked) {
-          next.add(id);
+          next.add(key);
         } else {
-          next.delete(id);
+          next.delete(key);
         }
       });
       return next;
@@ -208,7 +293,7 @@ function ModelMappingsTab() {
       priority: String(mapping.priority ?? 0),
       apiStyle: mapping.apiStyle ?? "chat-completions",
     });
-    setEditId(mapping.id);
+    setEditId(mapping.mappingId ?? mapping.id ?? null);
     setShowForm(true);
   };
 
@@ -231,22 +316,54 @@ function ModelMappingsTab() {
     resetForm();
   };
 
-  const handleSetEnabled = async (ids: number[], isEnabled: boolean) => {
-    if (ids.length === 0) {
-      toast.error("Select at least one model mapping first");
+  const handleSetEnabled = async (
+    rows: Array<{
+      mappingId: number | null;
+      modelId: string;
+      providerId: number;
+      modelName: string;
+      providerModelId: string;
+      pricingInput: string;
+      pricingOutput: string;
+      isFree: boolean;
+      contextLength: number | null;
+      priority: number;
+      apiStyle: MappingForm["apiStyle"];
+    }>,
+    isEnabled: boolean,
+  ) => {
+    if (rows.length === 0) {
+      toast.error("Select at least one model first");
       return;
     }
 
-    const uniqueIds = Array.from(new Set(ids));
-    await bulkSetEnabledMutation.mutateAsync({ ids: uniqueIds, isEnabled });
-    await invalidateMappingQueries();
-    toast.success(
-      `${isEnabled ? "Enabled" : "Disabled"} ${uniqueIds.length} model mapping${uniqueIds.length > 1 ? "s" : ""}`,
+    const uniqueRows = Array.from(
+      new Map(rows.map((row) => [getAdminModelSelectionKey(row), row])).values(),
     );
-    setSelectedIds((previous) => new Set(Array.from(previous).filter((id) => !uniqueIds.includes(id))));
+    const result = await bulkSetCatalogEnabledMutation.mutateAsync({
+      items: uniqueRows.map((row) => ({
+        mappingId: row.mappingId,
+        modelId: row.modelId,
+        providerId: row.providerId,
+        modelName: row.modelName,
+        providerModelId: row.providerModelId,
+        pricingInput: Number(row.pricingInput),
+        pricingOutput: Number(row.pricingOutput),
+        isFree: row.isFree,
+        contextLength: row.contextLength,
+        priority: row.priority,
+        apiStyle: row.apiStyle,
+      })),
+      isEnabled,
+    });
+    await invalidateMappingQueries();
+    const changedCount = result.updatedCount + result.insertedCount;
+    toast.success(`${isEnabled ? "Enabled" : "Disabled"} ${changedCount} model${changedCount > 1 ? "s" : ""}`);
+    const affectedKeys = new Set(uniqueRows.map((row) => getAdminModelSelectionKey(row)));
+    setSelectedKeys((previous) => new Set(Array.from(previous).filter((key) => !affectedKeys.has(key))));
   };
 
-  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
+  if (isLoading || isCatalogLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
 
   return (
     <div className="space-y-4">
@@ -276,7 +393,7 @@ function ModelMappingsTab() {
             <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
               <Checkbox
                 checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
-                onCheckedChange={(checked) => setSelectionForIds(visibleMappingIds, checked === true)}
+                onCheckedChange={(checked) => setSelectionForRows(filteredCatalogRows, checked === true)}
                 aria-label="Select all filtered model mappings"
               />
               <span>Select Filtered</span>
@@ -284,15 +401,15 @@ function ModelMappingsTab() {
             <Button
               variant="outline"
               size="sm"
-              onClick={() => setSelectionForIds(visibleMappingIds, true)}
-              disabled={visibleMappingIds.length === 0}
+              onClick={() => setSelectionForRows(filteredCatalogRows, true)}
+              disabled={filteredCatalogRows.length === 0}
             >
               Select All
             </Button>
             <Button
               variant="outline"
               size="sm"
-              onClick={() => setSelectionForIds(visibleMappingIds, false)}
+              onClick={() => setSelectionForRows(filteredCatalogRows, false)}
               disabled={visibleSelectedCount === 0}
             >
               Clear Filtered
@@ -300,50 +417,75 @@ function ModelMappingsTab() {
             <Button
               variant="outline"
               size="sm"
-              onClick={() => handleSetEnabled(visibleMappingIds, true)}
-              disabled={visibleMappingIds.length === 0 || bulkSetEnabledMutation.isPending}
+              onClick={() => handleSetEnabled(filteredCatalogRows, true)}
+              disabled={filteredCatalogRows.length === 0 || bulkSetCatalogEnabledMutation.isPending}
             >
-              {bulkSetEnabledMutation.isPending ? "Working..." : "Enable Visible"}
+              {bulkSetCatalogEnabledMutation.isPending ? "Working..." : "Enable Visible"}
             </Button>
             <Button
               variant="outline"
               size="sm"
-              onClick={() => handleSetEnabled(visibleMappingIds, false)}
-              disabled={visibleMappingIds.length === 0 || bulkSetEnabledMutation.isPending}
+              onClick={() => handleSetEnabled(filteredCatalogRows, false)}
+              disabled={filteredCatalogRows.length === 0 || bulkSetCatalogEnabledMutation.isPending}
             >
-              {bulkSetEnabledMutation.isPending ? "Working..." : "Disable Visible"}
+              {bulkSetCatalogEnabledMutation.isPending ? "Working..." : "Disable Visible"}
             </Button>
             <Button
               size="sm"
-              onClick={() => handleSetEnabled(Array.from(selectedIds), true)}
-              disabled={selectedIds.size === 0 || bulkSetEnabledMutation.isPending}
+              onClick={() => handleSetEnabled(
+                filteredCatalogRows.filter((row) => selectedKeys.has(getAdminModelSelectionKey(row))),
+                true,
+              )}
+              disabled={selectedKeys.size === 0 || bulkSetCatalogEnabledMutation.isPending}
             >
-              {bulkSetEnabledMutation.isPending ? "Working..." : "Enable Selected"}
+              {bulkSetCatalogEnabledMutation.isPending ? "Working..." : "Enable Selected"}
             </Button>
             <Button
               variant="secondary"
               size="sm"
-              onClick={() => handleSetEnabled(Array.from(selectedIds), false)}
-              disabled={selectedIds.size === 0 || bulkSetEnabledMutation.isPending}
+              onClick={() => handleSetEnabled(
+                filteredCatalogRows.filter((row) => selectedKeys.has(getAdminModelSelectionKey(row))),
+                false,
+              )}
+              disabled={selectedKeys.size === 0 || bulkSetCatalogEnabledMutation.isPending}
             >
-              {bulkSetEnabledMutation.isPending ? "Working..." : "Disable Selected"}
+              {bulkSetCatalogEnabledMutation.isPending ? "Working..." : "Disable Selected"}
             </Button>
           </div>
         </div>
         <div className="mt-3 flex flex-wrap gap-2">
-          <Badge variant="secondary">{visibleMappingIds.length} visible models</Badge>
+          <Badge variant="secondary">{filteredCatalogRows.length} visible models</Badge>
           <Badge variant="secondary">{totalVisibleEnabled} enabled in view</Badge>
           <Badge variant="secondary">{filteredGroups.length} groups</Badge>
-          <Badge variant={selectedIds.size > 0 ? "default" : "secondary"}>
-            {selectedIds.size} selected
+          <Badge variant={selectedKeys.size > 0 ? "default" : "secondary"}>
+            {selectedKeys.size} selected
           </Badge>
         </div>
       </div>
 
-      {showForm ? (
-        <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
-          <h4 className="text-sm font-medium">{editId ? "Edit Mapping" : "Add Model Mapping"}</h4>
-          <div className="grid grid-cols-2 gap-3">
+      <Button onClick={() => setShowForm(true)} className="w-fit" size="sm">
+        + Add Model Mapping
+      </Button>
+
+      <Dialog
+        open={showForm}
+        onOpenChange={(open) => {
+          if (!open) {
+            resetForm();
+            return;
+          }
+          setShowForm(true);
+        }}
+      >
+        <DialogContent className="w-[95vw] max-w-4xl max-h-[88vh] overflow-y-auto">
+          <DialogHeader>
+            <DialogTitle>{editId ? "Edit Model Mapping" : "Add Model Mapping"}</DialogTitle>
+            <DialogDescription>
+              Update the model ID, provider model ID, pricing, and endpoint style in this dialog.
+            </DialogDescription>
+          </DialogHeader>
+
+          <div className="grid gap-4 md:grid-cols-2">
             <label className="space-y-1">
               <span className="text-xs text-muted-foreground">Model ID *</span>
               <input
@@ -422,7 +564,7 @@ function ModelMappingsTab() {
                 onChange={(e) => setForm({ ...form, priority: e.target.value })}
               />
             </label>
-            <label className="space-y-1">
+            <label className="space-y-1 md:col-span-2">
               <span className="text-xs text-muted-foreground">API Style</span>
               <select
                 className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
@@ -436,7 +578,8 @@ function ModelMappingsTab() {
               </select>
             </label>
           </div>
-          <div className="flex items-center gap-4">
+
+          <div className="flex flex-wrap items-center gap-6">
             <label className="flex items-center gap-2 text-sm">
               <input
                 type="checkbox"
@@ -454,27 +597,20 @@ function ModelMappingsTab() {
               Enabled
             </label>
           </div>
-          <div className="flex gap-2">
-            <button
+
+          <div className="flex justify-end gap-2">
+            <Button variant="outline" onClick={resetForm}>
+              Cancel
+            </Button>
+            <Button
               onClick={handleSubmit}
               disabled={!form.modelId || !form.providerId || upsertMutation.isPending}
-              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
-            >
-              {upsertMutation.isPending ? "Saving..." : editId ? "Update" : "Add Mapping"}
-            </button>
-            <button
-              onClick={resetForm}
-              className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
             >
-              Cancel
-            </button>
+              {upsertMutation.isPending ? "Saving..." : editId ? "Update Mapping" : "Add Mapping"}
+            </Button>
           </div>
-        </div>
-      ) : (
-        <Button onClick={() => setShowForm(true)} className="w-fit" size="sm">
-          + Add Model Mapping
-        </Button>
-      )}
+        </DialogContent>
+      </Dialog>
 
       <Tabs value={mappingView} onValueChange={(value) => setMappingView(value as MappingView)} className="space-y-4">
         <TabsList className="grid w-full max-w-md grid-cols-2">
@@ -483,29 +619,29 @@ function ModelMappingsTab() {
         </TabsList>
 
         <TabsContent value="all" className="space-y-3">
-          {filteredMappings.length === 0 ? (
-            <p className="p-4 text-sm text-muted-foreground">No model mappings match the current filters.</p>
+          {filteredCatalogRows.length === 0 ? (
+            <p className="p-4 text-sm text-muted-foreground">No models match the current filters.</p>
           ) : (
-            filteredMappings.map((mapping) => (
+            filteredCatalogRows.map((mapping) => (
               <div
-                key={mapping.id}
+                key={getAdminModelSelectionKey(mapping)}
                 className="flex flex-col gap-3 rounded-lg border border-border p-4 lg:flex-row lg:items-center lg:justify-between"
               >
                 <div className="flex items-start gap-3">
                   <Checkbox
-                    checked={selectedIds.has(mapping.id)}
-                    onCheckedChange={(checked) => setSelectionForIds([mapping.id], checked === true)}
+                    checked={selectedKeys.has(getAdminModelSelectionKey(mapping))}
+                    onCheckedChange={(checked) => setSelectionForRows([mapping], checked === true)}
                     aria-label={`Select mapping ${mapping.modelId} on ${mapping.providerDisplayName ?? mapping.providerName}`}
                   />
                   <div className="space-y-1">
                     <div className="flex flex-wrap items-center gap-2">
-                      <span className="text-sm font-semibold">{mapping.modelId}</span>
+                      <span className="text-sm font-semibold">{mapping.modelName}</span>
                       <Badge variant="secondary">{mapping.providerDisplayName ?? mapping.providerName}</Badge>
-                      {mapping.modelName && mapping.modelName !== mapping.modelId && (
-                        <Badge variant="outline">{mapping.modelName}</Badge>
+                      {mapping.modelId && mapping.modelId !== mapping.providerModelId && (
+                        <Badge variant="outline">{mapping.modelId}</Badge>
                       )}
-                      <Badge variant={mapping.isEnabled ? "default" : "outline"}>
-                        {mapping.isEnabled ? "Enabled" : "Disabled"}
+                      <Badge variant={mapping.isEnabled ? "default" : mapping.isMapped ? "outline" : "secondary"}>
+                        {mapping.isEnabled ? "Enabled" : mapping.isMapped ? "Disabled" : "Not Configured"}
                       </Badge>
                       {mapping.isFree && (
                         <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10">Free</Badge>
@@ -517,10 +653,19 @@ function ModelMappingsTab() {
                     <div className="text-xs text-muted-foreground">
                       Provider model: <code>{mapping.providerModelId}</code>
                     </div>
-                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
+                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground items-center">
                       <span>{formatModelCost(mapping.pricingInput, mapping.pricingOutput, mapping.isFree)}</span>
                       <span>Context: {(mapping.contextLength ?? 0).toLocaleString()}</span>
-                      <span>Priority: {mapping.priority}</span>
+                      {mapping.mappingId != null ? (
+                        <PriorityInlineEditor
+                          mappingId={mapping.mappingId}
+                          priority={mapping.priority}
+                          priorityLocked={mapping.priorityLocked ?? false}
+                          onMutationSuccess={invalidateMappingQueries}
+                        />
+                      ) : (
+                        <span>Priority: {mapping.priority}</span>
+                      )}
                     </div>
                   </div>
                 </div>
@@ -528,8 +673,8 @@ function ModelMappingsTab() {
                   <Button
                     variant={mapping.isEnabled ? "outline" : "default"}
                     size="sm"
-                    onClick={() => handleSetEnabled([mapping.id], !mapping.isEnabled)}
-                    disabled={bulkSetEnabledMutation.isPending}
+                    onClick={() => handleSetEnabled([mapping], !mapping.isEnabled)}
+                    disabled={bulkSetCatalogEnabledMutation.isPending}
                   >
                     {mapping.isEnabled ? "Disable" : "Enable"}
                   </Button>
@@ -538,20 +683,22 @@ function ModelMappingsTab() {
                     size="sm"
                     onClick={() => handleEdit(mapping)}
                   >
-                    Edit
-                  </Button>
-                  <Button
-                    variant="destructive"
-                    size="sm"
-                    onClick={async () => {
-                      await deleteMutation.mutateAsync({ id: mapping.id });
-                      await invalidateMappingQueries();
-                      toast.success("Model mapping deleted");
-                    }}
-                    disabled={deleteMutation.isPending}
-                  >
-                    Delete
+                    {mapping.isMapped ? "Edit" : "Configure"}
                   </Button>
+                  {mapping.mappingId != null && (
+                    <Button
+                      variant="destructive"
+                      size="sm"
+                      onClick={async () => {
+                        await deleteMutation.mutateAsync({ id: mapping.mappingId! });
+                        await invalidateMappingQueries();
+                        toast.success("Model mapping deleted");
+                      }}
+                      disabled={deleteMutation.isPending}
+                    >
+                      Delete
+                    </Button>
+                  )}
                 </div>
               </div>
             ))
@@ -563,9 +710,21 @@ function ModelMappingsTab() {
             <p className="p-4 text-sm text-muted-foreground">No model groups match the current filters.</p>
           ) : (
             filteredGroups.map((group) => {
-              const groupIds = group.models.map((mapping) => mapping.id);
-              const selectedInGroup = groupIds.filter((id) => selectedIds.has(id)).length;
-              const allGroupSelected = groupIds.length > 0 && selectedInGroup === groupIds.length;
+              const groupRows = group.models.map((mapping) => ({
+                mappingId: mapping.id,
+                modelId: mapping.modelId,
+                providerId: mapping.providerId,
+                modelName: mapping.modelName,
+                providerModelId: mapping.providerModelId,
+                pricingInput: mapping.pricingInput,
+                pricingOutput: mapping.pricingOutput,
+                isFree: mapping.isFree,
+                contextLength: mapping.contextLength,
+                priority: mapping.priority,
+                apiStyle: mapping.apiStyle,
+              }));
+              const selectedInGroup = groupRows.filter((row) => selectedKeys.has(getAdminModelSelectionKey(row))).length;
+              const allGroupSelected = groupRows.length > 0 && selectedInGroup === groupRows.length;
               const someGroupSelected = selectedInGroup > 0 && !allGroupSelected;
 
               return (
@@ -574,7 +733,7 @@ function ModelMappingsTab() {
                     <div className="flex items-start gap-3">
                       <Checkbox
                         checked={allGroupSelected ? true : someGroupSelected ? "indeterminate" : false}
-                        onCheckedChange={(checked) => setSelectionForIds(groupIds, checked === true)}
+                        onCheckedChange={(checked) => setSelectionForRows(groupRows, checked === true)}
                         aria-label={`Select all mappings for ${group.modelId}`}
                       />
                       <div>
@@ -591,16 +750,16 @@ function ModelMappingsTab() {
                       <Button
                         variant="outline"
                         size="sm"
-                        onClick={() => handleSetEnabled(groupIds, true)}
-                        disabled={bulkSetEnabledMutation.isPending}
+                        onClick={() => handleSetEnabled(groupRows, true)}
+                        disabled={bulkSetCatalogEnabledMutation.isPending}
                       >
                         Enable Group
                       </Button>
                       <Button
                         variant="outline"
                         size="sm"
-                        onClick={() => handleSetEnabled(groupIds, false)}
-                        disabled={bulkSetEnabledMutation.isPending}
+                        onClick={() => handleSetEnabled(groupRows, false)}
+                        disabled={bulkSetCatalogEnabledMutation.isPending}
                       >
                         Disable Group
                       </Button>
@@ -611,8 +770,16 @@ function ModelMappingsTab() {
                       <div key={mapping.id} className="flex flex-col gap-3 rounded-md border border-border/60 p-3 lg:flex-row lg:items-center lg:justify-between">
                         <div className="flex items-start gap-3">
                           <Checkbox
-                            checked={selectedIds.has(mapping.id)}
-                            onCheckedChange={(checked) => setSelectionForIds([mapping.id], checked === true)}
+                            checked={selectedKeys.has(getAdminModelSelectionKey({
+                              mappingId: mapping.id,
+                              providerId: mapping.providerId,
+                              providerModelId: mapping.providerModelId,
+                            }))}
+                            onCheckedChange={(checked) => setSelectionForRows([{
+                              mappingId: mapping.id,
+                              providerId: mapping.providerId,
+                              providerModelId: mapping.providerModelId,
+                            }], checked === true)}
                             aria-label={`Select mapping ${mapping.modelId} on ${mapping.providerDisplayName ?? mapping.providerName}`}
                           />
                           <div className="space-y-1">
@@ -633,10 +800,15 @@ function ModelMappingsTab() {
                             <div className="text-xs text-muted-foreground">
                               Provider model: <code>{mapping.providerModelId}</code>
                             </div>
-                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
+                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground items-center">
                               <span>{formatModelCost(mapping.pricingInput, mapping.pricingOutput, mapping.isFree)}</span>
                               <span>Context: {(mapping.contextLength ?? 0).toLocaleString()}</span>
-                              <span>Priority: {mapping.priority}</span>
+                              <PriorityInlineEditor
+                                mappingId={mapping.id}
+                                priority={mapping.priority}
+                                priorityLocked={mapping.priorityLocked ?? false}
+                                onMutationSuccess={invalidateMappingQueries}
+                              />
                             </div>
                           </div>
                         </div>
@@ -644,8 +816,20 @@ function ModelMappingsTab() {
                           <Button
                             variant="outline"
                             size="sm"
-                            onClick={() => handleSetEnabled([mapping.id], !mapping.isEnabled)}
-                            disabled={bulkSetEnabledMutation.isPending}
+                            onClick={() => handleSetEnabled([{
+                              mappingId: mapping.id,
+                              modelId: mapping.modelId,
+                              providerId: mapping.providerId,
+                              modelName: mapping.modelName,
+                              providerModelId: mapping.providerModelId,
+                              pricingInput: mapping.pricingInput,
+                              pricingOutput: mapping.pricingOutput,
+                              isFree: mapping.isFree,
+                              contextLength: mapping.contextLength,
+                              priority: mapping.priority,
+                              apiStyle: mapping.apiStyle,
+                            }], !mapping.isEnabled)}
+                            disabled={bulkSetCatalogEnabledMutation.isPending}
                           >
                             {mapping.isEnabled ? "Disable" : "Enable"}
                           </Button>
diff --git a/apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts b/apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts
index 8b2e2ee2..dc2c9844 100644
--- a/apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts
+++ b/apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts
@@ -1,9 +1,11 @@
 import { describe, expect, it } from "vitest";
 
 import {
+  filterAdminModelCatalogRows,
   collectVisibleMappingIds,
   filterFlatModelMappings,
   filterModelMappingGroups,
+  getAdminModelSelectionKey,
   type AdminModelMappingsGrouped,
 } from "./multiProviderAdminModelMappings";
 
@@ -23,6 +25,7 @@ const groupedMappings: AdminModelMappingsGrouped = {
       contextLength: 128000,
       isEnabled: true,
       priority: 0,
+      priorityLocked: false,
       apiStyle: "responses",
     },
     {
@@ -39,6 +42,7 @@ const groupedMappings: AdminModelMappingsGrouped = {
       contextLength: 128000,
       isEnabled: false,
       priority: 1,
+      priorityLocked: false,
       apiStyle: "chat-completions",
     },
   ],
@@ -57,6 +61,7 @@ const groupedMappings: AdminModelMappingsGrouped = {
       contextLength: 200000,
       isEnabled: true,
       priority: 0,
+      priorityLocked: false,
       apiStyle: "messages",
     },
   ],
@@ -121,3 +126,119 @@ describe("collectVisibleMappingIds", () => {
     expect(collectVisibleMappingIds(groups)).toEqual([1, 2]);
   });
 });
+
+describe("filterAdminModelCatalogRows", () => {
+  it("keeps unmapped catalog rows visible and searchable", () => {
+    const rows = filterAdminModelCatalogRows([
+      {
+        mappingId: null,
+        isMapped: false,
+        modelId: "openai/gpt-5.4",
+        providerId: 20,
+        providerName: "openrouter",
+        providerDisplayName: "OpenRouter",
+        modelName: "GPT 5.4",
+        providerModelId: "openai/gpt-5.4",
+        pricingInput: "2.5",
+        pricingOutput: "10",
+        isFree: false,
+        contextLength: 400000,
+        isEnabled: false,
+        priority: 0,
+        priorityLocked: false,
+        apiStyle: "chat-completions",
+      },
+    ], "gpt 5.4", "20");
+
+    expect(rows).toHaveLength(1);
+    expect(getAdminModelSelectionKey(rows[0]!)).toBe("catalog:20:openai/gpt-5.4");
+  });
+});
+
+describe("filterAdminModelCatalogRows — priority secondary sort", () => {
+  it("sorts by modelName first, then by priority ASC as tiebreaker", () => {
+    const rows = filterAdminModelCatalogRows([
+      {
+        mappingId: 1,
+        isMapped: true,
+        modelId: "gpt-4o",
+        providerId: 10,
+        providerName: "openai",
+        providerDisplayName: "OpenAI",
+        modelName: "GPT-4o",
+        providerModelId: "gpt-4o",
+        pricingInput: "2.5",
+        pricingOutput: "10",
+        isFree: false,
+        contextLength: 128000,
+        isEnabled: true,
+        priority: 50,
+        priorityLocked: false,
+        apiStyle: "chat-completions",
+      },
+      {
+        mappingId: 2,
+        isMapped: true,
+        modelId: "gpt-4o",
+        providerId: 20,
+        providerName: "openrouter",
+        providerDisplayName: "OpenRouter",
+        modelName: "GPT-4o",
+        providerModelId: "openai/gpt-4o",
+        pricingInput: "2.5",
+        pricingOutput: "10",
+        isFree: false,
+        contextLength: 128000,
+        isEnabled: true,
+        priority: 10,
+        priorityLocked: true,
+        apiStyle: "chat-completions",
+      },
+    ], "", "all");
+    expect(rows[0]!.mappingId).toBe(2); // priority 10
+    expect(rows[1]!.mappingId).toBe(1); // priority 50
+  });
+
+  it("does not change order when modelNames differ (primary sort wins)", () => {
+    const result = filterAdminModelCatalogRows([
+      {
+        mappingId: 1,
+        isMapped: true,
+        modelId: "zeta-model",
+        providerId: 10,
+        providerName: "provider-a",
+        providerDisplayName: "Provider A",
+        modelName: "Zeta",
+        providerModelId: "zeta",
+        pricingInput: "0",
+        pricingOutput: "0",
+        isFree: true,
+        contextLength: 4096,
+        isEnabled: true,
+        priority: 1,
+        priorityLocked: false,
+        apiStyle: "chat-completions",
+      },
+      {
+        mappingId: 2,
+        isMapped: true,
+        modelId: "alpha-model",
+        providerId: 10,
+        providerName: "provider-a",
+        providerDisplayName: "Provider A",
+        modelName: "Alpha",
+        providerModelId: "alpha",
+        pricingInput: "0",
+        pricingOutput: "0",
+        isFree: true,
+        contextLength: 4096,
+        isEnabled: true,
+        priority: 99,
+        priorityLocked: true,
+        apiStyle: "chat-completions",
+      },
+    ], "", "all");
+    expect(result[0]!.modelName).toBe("Alpha");
+    expect(result[1]!.modelName).toBe("Zeta");
+  });
+});
diff --git a/apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts b/apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts
index 58053be7..8f09fe1c 100644
--- a/apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts
+++ b/apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts
@@ -12,6 +12,26 @@ export interface AdminModelMappingRow {
   contextLength: number | null;
   isEnabled: boolean;
   priority: number;
+  priorityLocked: boolean;
+  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
+}
+
+export interface AdminModelCatalogRow {
+  mappingId: number | null;
+  isMapped: boolean;
+  modelId: string;
+  providerId: number;
+  providerName: string;
+  providerDisplayName?: string | null;
+  modelName: string;
+  providerModelId: string;
+  pricingInput: string;
+  pricingOutput: string;
+  isFree: boolean;
+  contextLength: number | null;
+  isEnabled: boolean;
+  priority: number;
+  priorityLocked: boolean;
   apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
 }
 
@@ -29,8 +49,13 @@ export interface FilteredModelMappingGroup {
   enabledCount: number;
 }
 
+type FilterableModelRow = Pick<
+  AdminModelCatalogRow,
+  "modelId" | "modelName" | "providerId" | "providerName" | "providerDisplayName" | "providerModelId"
+>;
+
 function matchesModelMappingFilters(
-  row: AdminModelMappingRow,
+  row: FilterableModelRow,
   searchQuery: string,
   providerFilter: string,
 ) {
@@ -54,6 +79,42 @@ function matchesModelMappingFilters(
   ].some((value) => value.toLowerCase().includes(search));
 }
 
+export function getAdminModelSelectionKey(row: Pick<AdminModelCatalogRow, "mappingId" | "providerId" | "providerModelId">) {
+  if (row.mappingId != null) {
+    return `mapped:${row.mappingId}`;
+  }
+  return `catalog:${row.providerId}:${row.providerModelId}`;
+}
+
+export function filterAdminModelCatalogRows(
+  rows: AdminModelCatalogRow[] | undefined,
+  searchQuery: string,
+  providerFilter: string,
+): AdminModelCatalogRow[] {
+  return (rows ?? [])
+    .filter((row) => matchesModelMappingFilters(row, searchQuery, providerFilter))
+    .sort((left, right) => {
+      const nameCompare = left.modelName.localeCompare(right.modelName);
+      if (nameCompare !== 0) {
+        return nameCompare;
+      }
+
+      const priorityCompare = left.priority - right.priority;
+      if (priorityCompare !== 0) {
+        return priorityCompare;
+      }
+
+      const providerCompare = (left.providerDisplayName ?? left.providerName).localeCompare(
+        right.providerDisplayName ?? right.providerName,
+      );
+      if (providerCompare !== 0) {
+        return providerCompare;
+      }
+
+      return left.providerModelId.localeCompare(right.providerModelId);
+    });
+}
+
 export function filterFlatModelMappings(input: FilterModelMappingGroupsInput): AdminModelMappingRow[] {
   return Object.values(input.groupedMappings ?? {})
     .flat()
