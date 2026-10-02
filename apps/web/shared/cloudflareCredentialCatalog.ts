export type CloudflareCredentialProfileId = "audit" | "deployment" | "vectorize";
export type CloudflareProbeStatus = "granted" | "partial" | "missing_permission" | "invalid_token" | "resource_not_found" | "rate_limited" | "unsupported_or_invalid_request" | "unavailable";

export const CLOUDFLARE_CREDENTIAL_PROFILES = [
  {
    id: "vectorize",
    title: "Vectorize (existing)",
    owner: "vectordb settings (shared source)",
    purpose: "Existing Vectorize integration. The center edits the same vectordb setting rather than storing a duplicate.",
    readPermissions: ["Vectorize Read", "Workers AI Run/Read (when generating embeddings; verify against the live permission catalog)"],
    writePermissions: ["Vectorize Write", "Workers AI Write (when changing AI configuration)"],
  },
  {
    id: "audit",
    title: "Infrastructure audit",
    owner: "Admin → Infrastructure → Cloudflare",
    purpose: "Read account and zone resources for migration inventory and permission checks.",
    readPermissions: [
      "Account Settings Read (account identity)",
      "Account API Tokens Read (to fetch Cloudflare's live permission-group catalog)",
      "API Tokens Read (user scope, to fetch user-scoped permission groups)",
      "Zone Read (each managed zone)",
      "Workers Scripts Read; Workflows accept Workers Scripts Read, Workers Scripts Write, or Workers Tail Read; dispatch namespaces accept the same set",
      "Workers KV Storage Read",
      "Workers Containers Read (Cloudflare's current account-scoped Containers permission group)",
      "Queues Read",
      "Hyperdrive Read",
      "Cloudflare Tunnel Read",
      "Load Balancing: Monitors and Pools Read",
      "Workers R2 Storage Read (bucket administration only; optional when R2 uses its separate S3 credential)",
      "DNS Read (each managed zone)",
      "Load Balancers Read (each managed zone)",
      "Workers Routes Read (each managed zone)",
    ],
    writePermissions: [],
  },
  {
    id: "deployment",
    title: "Deployment / provisioning",
    owner: "Cloudflare deployment secret store / CI",
    purpose: "Used by the approved deployment pipeline. Configure the secret at its real deployment destination; read probes cannot validate write access.",
    readPermissions: ["Workers Scripts Read", "Account Settings Read"],
    writePermissions: [
      "Workers Scripts Write (also required for Workflows, dispatch namespaces, and Cron; dispatch API also accepts Workers Tail Read)",
      "Workers KV Storage Write (when provisioning KV)",
      "Queues Write (when provisioning queues)",
      "Workers Containers Write (when provisioning Containers; account scope)",
      "Hyperdrive Write (when provisioning Hyperdrive)",
      "DNS Write (only when changing records)",
      "Workers Routes Write (only when changing routes)",
      "Load Balancing: Monitors and Pools Write (only when managing account pools)",
      "Load Balancers Write (only when managing zone load balancers)",
      "Workers R2 Storage Write (only when provisioning account buckets; S3 data credentials are separate)",
      "Vectorize Write (only when provisioning indexes)",
      "Cloudflare Tunnel Write (only when provisioning tunnels)",
    ],
  },
] as const;

export const CLOUDFLARE_PROBE_SERVICES = [
  { id: "workers", label: "Workers Scripts", scope: "Account", permission: "Workers Scripts Read", path: "workers/scripts" },
  { id: "dispatchNamespaces", label: "Workers for Platforms dispatch namespaces", scope: "Account", permission: "Workers Scripts Read, Workers Scripts Write, or Workers Tail Read", path: "workers/dispatch/namespaces" },
  { id: "kv", label: "Workers KV", scope: "Account", permission: "Workers KV Storage Read", path: "storage/kv/namespaces" },
  { id: "queues", label: "Queues", scope: "Account", permission: "Queues Read", path: "queues" },
  { id: "workflows", label: "Workflows", scope: "Account", permission: "Workers Scripts Read (Workers Scripts Write or Workers Tail Read are also accepted)", path: "workflows" },
  { id: "hyperdrive", label: "Hyperdrive", scope: "Account", permission: "Hyperdrive Read", path: "hyperdrive/configs" },
  { id: "tunnels", label: "Cloudflare Tunnels", scope: "Account", permission: "Cloudflare Tunnel Read", path: "cfd_tunnel?is_deleted=false" },
  { id: "loadBalancerPools", label: "Load Balancer pools", scope: "Account", permission: "Load Balancing: Monitors and Pools Read", path: "load_balancers/pools?per_page=1" },
  { id: "r2", label: "R2 bucket administration", scope: "Account", permission: "Workers R2 Storage Read", path: "r2/buckets" },
  { id: "vectorize", label: "Vectorize indexes", scope: "Account", permission: "Vectorize Read", path: "vectorize/v2/indexes" },
] as const;

export const CLOUDFLARE_ZONE_PROBE_SERVICES = [
  { id: "dns", label: "DNS records (smartaihub.app)", permission: "DNS Read", path: "dns_records?per_page=1" },
  { id: "zoneLoadBalancers", label: "Zone Load Balancers", permission: "Load Balancers Read", path: "load_balancers?per_page=1" },
  { id: "workerRoutes", label: "Worker Routes", permission: "Workers Routes Read", path: "workers/routes?per_page=1" },
] as const;
