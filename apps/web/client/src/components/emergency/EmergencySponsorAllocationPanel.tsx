import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getSpec260ApiPath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type Pool = { id: string; title: string; currency: string; status: string; settledMinorUnits: string; earmarkedMinorUnits: string; restrictedBalanceMinorUnits: string };
type Allocation = { id: string; purposeCode: string; restriction: string; amountMinorUnits: string; currency: string; status: string; createdAt: string };

export default function EmergencySponsorAllocationPanel() {
  const { t } = useScopedTranslation("emergency");
  const [pools, setPools] = useState<Pool[]>([]);
  const [poolRef, setPoolRef] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [purposeCode, setPurposeCode] = useState("food_water");
  const [restriction, setRestriction] = useState("");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "failed">("loading");
  const selectedPool = pools.find(pool => pool.id === poolRef);

  const refresh = useCallback(async () => {
    const poolResponse = await fetch(getSpec260ApiPath("sponsor.pools.list"), { credentials: "include", cache: "no-store" });
    if (!poolResponse.ok) throw new Error("POOL_LIST_FAILED");
    const poolPayload = await poolResponse.json() as { items?: Pool[] };
    const listedPools = (poolPayload.items ?? []).filter(pool => pool.status === "active" && pool.currency === "THB");
    setPools(listedPools);
    const selected = listedPools.some(pool => pool.id === poolRef) ? poolRef : listedPools[0]?.id || "";
    setPoolRef(selected);
    if (!selected) { setAllocations([]); return; }
    const allocationResponse = await fetch(getSpec260ApiPath("sponsor.allocations.list", { poolId: selected }), { credentials: "include", cache: "no-store" });
    if (!allocationResponse.ok) throw new Error("ALLOCATION_LIST_FAILED");
    const allocationPayload = await allocationResponse.json() as { items?: Allocation[] };
    setAllocations(allocationPayload.items ?? []);
  }, [poolRef]);

  useEffect(() => { void refresh().then(() => setState("ready")).catch(() => setState("failed")); }, [refresh]);

  const createAllocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountThb = Number(amount);
    if (!poolRef || !Number.isFinite(amountThb) || amountThb < 1 || amountThb > 1_000_000 || restriction.trim().length < 8) return;
    setState("saving");
    try {
      const response = await fetch(getSpec260ApiPath("sponsor.allocation.create", { poolId: poolRef }), {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ purposeCode, restriction: restriction.trim(), amountMinorUnits: Math.round(amountThb * 100) }),
      });
      if (!response.ok) throw new Error("ALLOCATION_CREATE_FAILED");
      setRestriction(""); setAmount(""); await refresh(); setState("ready");
    } catch { setState("failed"); }
  };

  return <Card><VStack gap={3}>
    <Heading level={2}>{t("allocation.title")}</Heading>
    <Text>{t("allocation.notice")}</Text>
    {state === "failed" && <Text role="alert">{t("allocation.unavailable")}</Text>}
    <label>{t("allocation.pool")}<select value={poolRef} onChange={event => setPoolRef(event.target.value)}>
      {pools.map(pool => <option key={pool.id} value={pool.id}>{pool.title} · {pool.status} · {pool.currency}</option>)}
    </select></label>
    {selectedPool && <Text>{t("allocation.position", {
      settled: selectedPool.settledMinorUnits,
      earmarked: selectedPool.earmarkedMinorUnits,
      restricted: selectedPool.restrictedBalanceMinorUnits,
    })}</Text>}
    <form onSubmit={createAllocation}><VStack gap={2}>
      <label>{t("allocation.purpose")}<select value={purposeCode} onChange={event => setPurposeCode(event.target.value)}>
        {["shelter", "medical", "food_water", "transport", "rescue", "communications", "other"].map(code => <option key={code} value={code}>{t(`allocation.purposeCodes.${code}`)}</option>)}
      </select></label>
      <label>{t("allocation.amount")}<input type="number" min="1" max="1000000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required /></label>
      <label>{t("allocation.restriction")}<input maxLength={500} minLength={8} value={restriction} onChange={event => setRestriction(event.target.value)} required /></label>
      <Button type="submit" isDisabled={state === "saving" || !poolRef} label={t(state === "saving" ? "allocation.saving" : "allocation.create")} />
    </VStack></form>
    {allocations.map(item => <Text key={item.id}>{item.purposeCode} · {item.amountMinorUnits} {item.currency} · {item.status} · {item.restriction}</Text>)}
  </VStack></Card>;
}
