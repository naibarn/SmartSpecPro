/** Read only the capabilities this operation needs. DNS is deliberately not
 * probed: workers.dev metadata preparation does not mutate or require a zone
 * record. The M2 route is read solely as the preservation baseline. */
export async function probeHttpCandidateProvider(input: { accountRef: string; workerName: string;
  applications: Array<{ name: string; class_name: string; images: Record<string, { image: string }> }>;
  token: string; expectedWorkerBaseline?: { deploymentId: string; versionId: string } | null;
  fetchImpl?: typeof fetch }) {
  const request = async (path: string, absent = false) => {
    const requestPage = async (page?: number) => {
      const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
      if (page !== undefined) {
        url.searchParams.set("page", String(page));
        url.searchParams.set("per_page", "100");
      }
      const response = await (input.fetchImpl ?? fetch)(url, {
      method: "GET", headers: { authorization: `Bearer ${input.token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
      });
      const body = await response.json();
      if (absent && page === 1 && response.status === 404 && body.success === false) return null;
      if (!response.ok || body.success !== true)
        throw Error(`HTTP_CANDIDATE_PROVIDER_HTTP_${response.status}`);
      return { result: body.result, page: body.result_info?.page, totalPages: body.result_info?.total_pages ?? 1 };
    };

    // Worker deployment history is paginated; read every bounded page before
    // capturing an existing Worker as the reviewed update baseline.
    const first = await requestPage(path.includes("/deployments") ? 1 : undefined);
    if (first === null) return null;
    if (!path.includes("/deployments")) {
      if (first.totalPages > 1) throw Error(`HTTP_CANDIDATE_PROVIDER_HTTP_200`);
      return first.result;
    }
    if (!Number.isInteger(first.totalPages) || first.totalPages < 1 || first.totalPages > 20 ||
        (first.page !== undefined && first.page !== 1)) throw Error("HTTP_CANDIDATE_PROVIDER_INVENTORY_INCOMPLETE");
    const pages = [first.result];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const next = await requestPage(page);
      if (next === null || (next.page !== undefined && next.page !== page) || next.totalPages !== first.totalPages)
        throw Error("HTTP_CANDIDATE_PROVIDER_INVENTORY_INCOMPLETE");
      pages.push(next.result);
    }
    return pages.some(result => result !== null && result !== undefined) ? { pages } : null;
  };
  const root = `/accounts/${input.accountRef}`;
  const [account, candidate, applications, subdomain, routes] = await Promise.all([
    request(`${root}`),
    request(`${root}/workers/scripts/${input.workerName}/deployments`, true),
    request(`${root}/containers/applications?per_page=100`), request(`${root}/workers/subdomain`),
    request("/zones/9acd8fe46851607de0919f2b6a462911/workers/routes"),
  ]);
  if (account?.id !== input.accountRef) throw Error("HTTP_CANDIDATE_ACCOUNT_IDENTITY_MISMATCH");
  const deployments = candidate === null ? [] : candidate.pages.flatMap((page: any) =>
    Array.isArray(page?.deployments) ? page.deployments : []);
  let workerBaseline: { deploymentId: string; versionId: string } | null = null;
  if (deployments.length) {
    const active = deployments[0];
    if (typeof active?.id !== "string" || !Array.isArray(active.versions) || active.versions.length !== 1 ||
        active.versions[0]?.percentage !== 100 || typeof active.versions[0]?.version_id !== "string")
      throw Error("HTTP_CANDIDATE_WORKER_ACTIVE_BASELINE_UNVERIFIED");
    workerBaseline = { deploymentId: active.id, versionId: active.versions[0].version_id };
  }
  if (input.expectedWorkerBaseline !== undefined && JSON.stringify(workerBaseline) !== JSON.stringify(input.expectedWorkerBaseline))
    throw Error("HTTP_CANDIDATE_WORKER_BASELINE_CHANGED");
  if (!Array.isArray(applications)) throw Error("HTTP_CANDIDATE_APPLICATION_COLLISION_OR_UNKNOWN");
  const existingExpected = applications.filter(item => input.applications.some(expected => expected.name === item?.name));
  if (existingExpected.length && !workerBaseline) throw Error("HTTP_CANDIDATE_APPLICATION_COLLISION_OR_UNKNOWN");
  if (workerBaseline && existingExpected.length) {
    const worker = await request(`${root}/workers/scripts/${input.workerName}/versions/${workerBaseline.versionId}`);
    const bindings = worker?.resources?.bindings, containers = worker?.resources?.script_runtime?.containers;
    if (!Array.isArray(bindings) || !Array.isArray(containers)) throw Error("HTTP_CANDIDATE_WORKER_RESOURCE_READBACK_UNVERIFIED");
    for (const expected of input.applications) {
      const nameMatch = applications.filter(item => item?.name === expected.name);
      if (!nameMatch.length) continue;
      const bindingName = expected.class_name === "ProductionNodeHttpContainer" ? "NODE_HTTP" :
        expected.class_name === "ProductionPythonHttpContainer" ? "PYTHON_HTTP" : null;
      const binding = bindings.filter((item: any) => item.type === "durable_object_namespace" &&
        item.class_name === expected.class_name && (!bindingName || item.name === bindingName));
      const container = containers.filter((item: any) => item.class_name === expected.class_name);
      const images = Object.fromEntries(Object.entries(expected.images).map(([name, item]) => [name, item.image]));
      if (nameMatch.length !== 1 || nameMatch[0].scheduling_policy !== "durable_object" ||
          binding.length !== 1 || !binding[0].namespace_id ||
          nameMatch[0].durable_objects?.namespace_id !== binding[0].namespace_id ||
          container.length !== 1 || JSON.stringify(container[0].images) !== JSON.stringify(images))
        throw Error("HTTP_CANDIDATE_APPLICATION_BASELINE_MISMATCH");
    }
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain?.subdomain ?? "")) throw Error("HTTP_CANDIDATE_WORKERS_SUBDOMAIN_REQUIRED");
  const baseline = Array.isArray(routes) ? routes.filter(item => item.pattern === "smartaihub.app/*") : [];
  if (baseline.length !== 1 || baseline[0].script !== "smartspec-cloudflare-runtime") throw Error("HTTP_CANDIDATE_M2_BASELINE_DENIED");
  return { readAccessVerified: true as const, writeAccessVerified: false as const,
    candidateUrl: `https://${input.workerName}.${subdomain.subdomain}.workers.dev`, m2RouteId: baseline[0].id, workerBaseline };
}
