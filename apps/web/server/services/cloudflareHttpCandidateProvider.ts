/** Read only the capabilities this operation needs. DNS is deliberately not
 * probed: workers.dev metadata preparation does not mutate or require a zone
 * record. The M2 route is read solely as the preservation baseline. */
export async function probeHttpCandidateProvider(input: { accountRef: string; workerName: string;
  applicationNames: string[]; token: string; fetchImpl?: typeof fetch }) {
  const request = async (path: string, absent = false) => {
    const response = await (input.fetchImpl ?? fetch)(`https://api.cloudflare.com/client/v4${path}`, {
      method: "GET", headers: { authorization: `Bearer ${input.token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    const body = await response.json();
    if (absent && response.status === 404 && body.success === false) return null;
    if (!response.ok || body.success !== true || (body.result_info?.total_pages ?? 1) > 1)
      throw Error(`HTTP_CANDIDATE_PROVIDER_HTTP_${response.status}`);
    return body.result;
  };
  const root = `/accounts/${input.accountRef}`;
  const [candidate, applications, subdomain, routes] = await Promise.all([
    request(`${root}/workers/scripts/${input.workerName}/deployments`, true),
    request(`${root}/containers/applications?per_page=100`), request(`${root}/workers/subdomain`),
    request("/zones/9acd8fe46851607de0919f2b6a462911/workers/routes"),
  ]);
  if (candidate !== null) throw Error("HTTP_CANDIDATE_WORKER_ALREADY_EXISTS_RECONCILE_REQUIRED");
  if (!Array.isArray(applications) || applications.some(item => input.applicationNames.includes(item?.name)))
    throw Error("HTTP_CANDIDATE_APPLICATION_COLLISION_OR_UNKNOWN");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain?.subdomain ?? "")) throw Error("HTTP_CANDIDATE_WORKERS_SUBDOMAIN_REQUIRED");
  const baseline = Array.isArray(routes) ? routes.filter(item => item.pattern === "smartaihub.app/*") : [];
  if (baseline.length !== 1 || baseline[0].script !== "smartspec-cloudflare-runtime") throw Error("HTTP_CANDIDATE_M2_BASELINE_DENIED");
  return { readAccessVerified: true as const, writeAccessVerified: false as const,
    candidateUrl: `https://${input.workerName}.${subdomain.subdomain}.workers.dev`, m2RouteId: baseline[0].id };
}
