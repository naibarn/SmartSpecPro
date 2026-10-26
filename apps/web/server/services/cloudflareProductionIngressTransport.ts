import {
  productionIngressGrantSchema,
  type ProductionIngressGrant,
} from "./cloudflareProductionIngressContract";
import type { CloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import type { CloudflareProductionVersion } from "./cloudflareProductionCanary";

type Deployment = {
  id: string;
  versions: Array<{ version_id: string; percentage: number }>;
  annotations?: Record<string, string>;
};
type Route = { id: string; pattern: string; script: string | null };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function deny(code: string): never {
  const diagnosticCode = `CLOUDFLARE_PRODUCTION_INGRESS_${code}`;
  throw Object.assign(new Error(diagnosticCode), { diagnosticCode });
}

/** Exact apex-route canary with compensating detach. All writes retain the existing grant/lease fence. */
export function createCloudflareProductionIngressTransport(
  options: { fetchImpl?: typeof fetch; observationMs?: number; probeRetryDelayMs?: number } = {}
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async function execute(input: {
    token: string;
    target: CloudflareProductionDeploymentTarget;
    grant: ProductionIngressGrant;
    candidate?: CloudflareProductionVersion;
    probeToken?: string;
    acceptApplication?: (receipt: {
      routeId: string;
      deploymentId: string;
      versionId: string;
    }) => Promise<unknown>;
    assertMutationAuthorized: () => Promise<void>;
  }) {
    const { token, target, grant, candidate, assertMutationAuthorized } = input;
    if (
      !productionIngressGrantSchema.safeParse(grant).success ||
      target.targetId !== grant.operation.targetId ||
      target.workerRef !== target.targetId ||
      target.accountRef !== grant.accountRef ||
      target.environment !== "production" ||
      target.tenantId !== grant.tenantId ||
      target.projectId !== grant.operation.projectId
    )
      deny("TARGET_DENIED");
    const job = grant.operation;
    const workerPath = `/accounts/${target.accountRef}/workers/scripts/${target.workerRef}`;
    const routePath = `/zones/${job.zoneId}/workers/routes`;
    async function api<T>(
      path: string,
      method: "GET" | "POST" | "DELETE" = "GET",
      body?: unknown
    ): Promise<T> {
      if (method !== "GET") await assertMutationAuthorized();
      const response = await fetchImpl(
        `https://api.cloudflare.com/client/v4${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!response.ok) deny(`HTTP_${response.status}`);
      const envelope = (await response.json()) as {
        success?: boolean;
        result?: T;
      };
      if (envelope.success !== true || envelope.result === undefined)
        deny("RESPONSE_INVALID");
      return envelope.result;
    }
    async function route(): Promise<Route | null> {
      const routes = await api<Route[]>(routePath);
      if (
        !Array.isArray(routes) ||
        routes.some(
          r => typeof r.id !== "string" || typeof r.pattern !== "string"
        )
      )
        deny("ROUTES_INVALID");
      const matches = routes.filter(r => r.pattern === job.routePattern);
      if (matches.length > 1) deny("ROUTE_AMBIGUOUS");
      return matches[0] ?? null;
    }
    async function active(): Promise<Deployment> {
      const result = await api<{ deployments: Deployment[] }>(
        `${workerPath}/deployments`
      );
      const value = result.deployments?.[0];
      if (!value?.id || !uuid.test(value.id) || !Array.isArray(value.versions))
        deny("DEPLOYMENT_INVALID");
      return value;
    }
    async function deploy(versions: Deployment["versions"], phase: string) {
      const annotation = `SmartAIHub ingress ${phase} grant ${grant.grantRef}`;
      const receipt = await api<Deployment>(
        `${workerPath}/deployments`,
        "POST",
        {
          strategy: "percentage",
          versions,
          annotations: { "workers/message": annotation },
        }
      );
      if (!receipt.id || !uuid.test(receipt.id))
        deny("DEPLOYMENT_RECEIPT_INVALID");
      const check = await active();
      const normalize = (v: Deployment["versions"]) =>
        JSON.stringify(
          [...v].sort((a, b) => a.version_id.localeCompare(b.version_id))
        );
      if (
        check.id !== receipt.id ||
        check.annotations?.["workers/message"] !== annotation ||
        normalize(check.versions) !== normalize(versions)
      )
        deny("DEPLOYMENT_READBACK_MISMATCH");
      return check;
    }
    async function detach(expected: Route) {
      const actual = await route();
      if (
        !actual ||
        actual.id !== expected.id ||
        actual.script !== target.workerRef
      )
        deny("ROLLBACK_ROUTE_CHANGED");
      await api(`${routePath}/${encodeURIComponent(expected.id)}`, "DELETE");
      if (await route()) deny("ROLLBACK_READBACK_MISMATCH");
    }
    async function probeOnce(
      origin: "https://runtime.smartaihub.app" | "https://smartaihub.app",
      versionId: string
    ) {
      for (const path of ["/", "/trpc/auth.me"]) {
        const runtimeProbe = origin === "https://runtime.smartaihub.app";
        const probePath = runtimeProbe
          ? `/_ops/application-canary/ingress/${path === "/" ? "web" : "auth"}`
          : path;
        const response = await fetchImpl(`${origin}${probePath}`, {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
          headers: {
            "Cloudflare-Workers-Version-Overrides": `${target.workerRef}="${versionId}"`,
            ...(runtimeProbe
              ? { "x-smartaihub-application-canary-token": input.probeToken! }
              : {}),
          },
          signal: AbortSignal.timeout(15000),
        });
        if (
          response.status !== 200 ||
          response.headers.get("x-smartaihub-ingress") !==
            "cloudflare-worker" ||
          response.headers.get("x-smartaihub-application-runtime") !==
            "linux-origin"
        )
          throw Object.assign(new Error("CLOUDFLARE_PRODUCTION_INGRESS_APPLICATION_PROBE_FAILED"), {
            diagnosticCode: "CLOUDFLARE_PRODUCTION_INGRESS_APPLICATION_PROBE_FAILED",
            // Never retain response bodies, credentials or caller headers.
            probeEvidence: {
              phase: runtimeProbe ? "runtime" : "apex",
              resource: path === "/" ? "web" : "auth",
              httpStatus: response.status,
              ingressIdentityMatched: response.headers.get("x-smartaihub-ingress") === "cloudflare-worker",
              runtimeIdentityMatched: response.headers.get("x-smartaihub-application-runtime") === "linux-origin",
              edgeRay: response.headers.get("cf-ray"),
              cacheStatus: response.headers.get("cf-cache-status"),
            },
          });
        if (path === "/") {
          if (
            !response.headers.get("content-type")?.includes("text/html") ||
            !(await response.text()).includes("<html")
          )
            deny("HTML_PROBE_FAILED");
        } else {
          const value = (await response.json()) as any;
          if (value.error || value.result?.data?.json !== null)
            deny("AUTH_PROBE_FAILED");
        }
      }
    }
    async function probe(origin:"https://runtime.smartaihub.app"|"https://smartaihub.app",versionId:string){
      // Provider readback precedes both version and route propagation. A new
      // apex route can briefly reach the old origin without Worker identity.
      // Bound anonymous GET retries; never replay a provider mutation.
      const retryLimit = origin === "https://runtime.smartaihub.app" ? 5 : 15;
      for(let attempt=0;;attempt++){
        try{return await probeOnce(origin,versionId);}
        catch(error){
          if (error instanceof Error && "probeEvidence" in error) {
            console.warn("[Cloudflare ingress probe]", error.probeEvidence);
          }
          if (origin === "https://smartaihub.app") {
            const evidence = (error as { probeEvidence?: { httpStatus?: number; ingressIdentityMatched?: boolean; runtimeIdentityMatched?: boolean } })?.probeEvidence;
            // Actual Worker/application failures still compensate immediately.
            // Only an old-origin response may be route propagation lag.
            if (!evidence || evidence.httpStatus !== 200 ||
              evidence.ingressIdentityMatched || evidence.runtimeIdentityMatched) throw error;
          }
          if(attempt>=retryLimit)throw error;
          await assertMutationAuthorized();
          await new Promise(resolve=>setTimeout(resolve, options.probeRetryDelayMs ?? 2000));
        }
      }
    }
    const currentRoute = await route();
    const baseline = await active();
    if (job.action === "ingress-rollback") {
      const evidence = job.ingressReceipt!;
      if (
        !currentRoute ||
        currentRoute.id !== evidence.routeId ||
        currentRoute.script !== target.workerRef ||
        baseline.id !== evidence.deploymentId ||
        baseline.versions.length !== 1 ||
        baseline.versions[0]?.version_id !== evidence.versionId ||
        baseline.versions[0]?.percentage !== 100 ||
        baseline.annotations?.["workers/message"] !==
          `SmartAIHub ingress live grant ${evidence.grantRef}`
      )
        deny("ROLLBACK_EVIDENCE_MISMATCH");
      await detach(currentRoute);
      const restored = await deploy(
        [{ version_id: job.runtimeBaselineVersionId, percentage: 100 }],
        "rollback"
      );
      return {
        deploymentId: restored.id,
        routeId: null,
        previousRouteRestored: true,
        productionTrafficShifted: false,
      };
    }
    if (
      currentRoute ||
      (baseline.id !== job.runtimeBaselineDeploymentId && baseline.annotations?.["workers/message"]!==`SmartAIHub ingress compensate grant ${grant.grantRef}`) ||
      baseline.versions.length !== 1 ||
      baseline.versions[0]?.version_id !== job.runtimeBaselineVersionId ||
      baseline.versions[0]?.percentage !== 100
    )
      deny("BASELINE_CHANGED");
    if (
      !input.probeToken ||
      input.probeToken.length < 32 ||
      input.probeToken.length > 4096
    )
      deny("PROBE_CREDENTIAL_REQUIRED");
    if (
      !candidate ||
      !uuid.test(candidate.versionId) ||
      candidate.versionId === job.runtimeBaselineVersionId ||
      candidate.sourceSha !== job.sourceSha ||
      candidate.buildDigest !== job.buildDigest ||
      candidate.configurationDigest !== job.configurationDigest
    )
      deny("CANDIDATE_DENIED");
    if (!input.acceptApplication) deny("AUTHENTICATED_ACCEPTANCE_REQUIRED");
    if (Date.parse(grant.expiresAt) - Date.now() < 300000)
      deny("INSUFFICIENT_ROLLBACK_WINDOW");
    const version = await api<{
      id: string;
      annotations?: Record<string, string>;
    }>(`${workerPath}/versions/${candidate.versionId}`);
    if (
      version.id !== candidate.versionId ||
      version.annotations?.["workers/message"] !==
        `SmartAIHub production ${job.sourceSha} ${job.buildDigest} origin ${job.configurationDigest}`
    )
      deny("VERSION_IDENTITY_MISMATCH");
    let attached: Route | undefined;
    let latestDeployment: string | undefined;
    let routeSubmissionStarted = false;
    try {
      latestDeployment = (
        await deploy(
          [
            { version_id: job.runtimeBaselineVersionId, percentage: 100 },
            { version_id: candidate.versionId, percentage: 0 },
          ],
          "probe"
        )
      ).id;
      await probe("https://runtime.smartaihub.app", candidate.versionId);
      if (await route()) deny("BASELINE_CHANGED");
      const live = await active();
      if (live.id !== latestDeployment) deny("DEPLOYMENT_CHANGED");
      const deployed = await deploy(
        [{ version_id: candidate.versionId, percentage: 100 }],
        "live"
      );
      latestDeployment = deployed.id;
      routeSubmissionStarted = true;
      const created = await api<Route>(routePath, "POST", {
        pattern: job.routePattern,
        script: target.workerRef,
      });
      if (
        !/^[a-f0-9]{32}$/.test(created.id) ||
        created.pattern !== job.routePattern ||
        created.script !== target.workerRef
      )
        deny("ROUTE_RECEIPT_INVALID");
      attached = created;
      const persisted = await route();
      if (persisted?.id !== created.id || persisted.script !== target.workerRef)
        deny("ROUTE_READBACK_MISMATCH");
      await probe("https://smartaihub.app", candidate.versionId);
      const authenticatedAcceptance = await input.acceptApplication!({
        routeId: created.id,
        deploymentId: deployed.id,
        versionId: candidate.versionId,
      });
      if (
        !authenticatedAcceptance ||
        (authenticatedAcceptance as { verified?: unknown }).verified !== true
      )
        deny("AUTHENTICATED_ACCEPTANCE_INVALID");
      const observationEnd =
        Date.now() +
        Math.max(0, Math.min(options.observationMs ?? 30000, 30000));
      while (Date.now() < observationEnd) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.min(10000, observationEnd - Date.now()))
        );
        await assertMutationAuthorized();
        await probe("https://smartaihub.app", candidate.versionId);
      }
      // Recheck the real route and active deployment after browser acceptance.
      const finalRoute = await route(),
        finalDeployment = await active();
      if (
        finalRoute?.id !== created.id ||
        finalRoute.script !== target.workerRef ||
        finalDeployment.id !== deployed.id
      )
        deny("ACCEPTANCE_BASELINE_CHANGED");
      return {
        deploymentId: deployed.id,
        versionId: candidate.versionId,
        routeId: created.id,
        grantRef: grant.grantRef,
        verifiedAt: new Date().toISOString(),
        productionTrafficShifted: true,
        applicationRuntime: "linux-origin",
        exposure: grant.exposure,
        authenticatedAcceptance,
      };
    } catch (cause) {
      // Never adopt or delete an uncertain POST result. Only our exact received
      // route/deployment can be compensated, under the still-valid authority.
      if (routeSubmissionStarted && !attached) deny("ROUTE_SUBMISSION_UNKNOWN");
      try {
        if (attached) await detach(attached);
        if (latestDeployment && (await active()).id === latestDeployment) {
          await deploy(
            [{ version_id: job.runtimeBaselineVersionId, percentage: 100 }],
            "compensate"
          );
        }
      } catch {
        deny("COMPENSATION_REQUIRES_REVIEW");
      }
      throw cause;
    }
  };
}
