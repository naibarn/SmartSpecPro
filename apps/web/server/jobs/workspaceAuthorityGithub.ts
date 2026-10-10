import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ListedPullRequest = {
  number: number;
  state: string;
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  headRepository: string | null;
  mergeable: boolean;
  mergeStateStatus: string;
};

export async function canonicalGithubRepository(repository: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: repository, timeout: 10_000 });
  const remoteUrl = stdout.trim();
  const sshRemote = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(remoteUrl);
  let repositorySlug = sshRemote?.[1]?.replace(/\.git$/, "");
  if (!repositorySlug) {
    try {
      const parsedRemote = new URL(remoteUrl);
      if (parsedRemote.hostname.toLowerCase() === "github.com" && !parsedRemote.username && !parsedRemote.password)
        repositorySlug = parsedRemote.pathname.replace(/^\//, "").replace(/\.git$/, "");
    } catch { /* malformed or non-GitHub remote */ }
  }
  if (!repositorySlug || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositorySlug))
    throw new Error("WORKSPACE_ACTION_CANONICAL_REPOSITORY_UNAVAILABLE");
  return repositorySlug;
}

/** Read open same-repository PR facts; the safe action rechecks every fact before merging. */
export async function listOpenPullRequests(repository: string, repositorySlug: string, baseBranch: string): Promise<ListedPullRequest[]> {
  const endpoint = `repos/${repositorySlug}/pulls?state=open&per_page=100&base=${encodeURIComponent(baseBranch)}`;
  const { stdout } = await execFileAsync("gh", ["api", endpoint], { cwd: repository, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error("WORKSPACE_ACTION_PULL_REQUEST_LIST_INVALID");
  const candidates = parsed.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const pr = value as Record<string, unknown>;
    const base = pr.base && typeof pr.base === "object" ? pr.base as Record<string, unknown> : {};
    const head = pr.head && typeof pr.head === "object" ? pr.head as Record<string, unknown> : {};
    const headRepo = head.repo && typeof head.repo === "object" ? head.repo as Record<string, unknown> : null;
    const headOwner = headRepo?.full_name;
    if (!Number.isSafeInteger(pr.number) || typeof pr.state !== "string" || typeof pr.draft !== "boolean" ||
        typeof base.ref !== "string" || typeof head.ref !== "string" || typeof head.sha !== "string") return [];
    return [{ number: pr.number as number, state: pr.state.toUpperCase(), isDraft: pr.draft,
      baseRefName: base.ref, headRefName: head.ref, headRefOid: head.sha,
      headRepository: typeof headOwner === "string" ? headOwner : null,
      mergeable: false, mergeStateStatus: "UNKNOWN" }];
  });
  // GitHub often omits mergeability from list responses. Enrich a small bounded
  // set of same-repository candidates from their detail endpoint; unknown stays
  // non-mergeable and the safe action re-reads the facts before any merge.
  const sameRepository = candidates.filter(pr => pr.headRepository?.toLowerCase() === repositorySlug.toLowerCase());
  const enriched: ListedPullRequest[] = [];
  for (let offset = 0; offset < sameRepository.length && offset < 100; offset += 4) {
    const batch = sameRepository.slice(offset, offset + 4);
    const results = await Promise.all(batch.map(async candidate => {
      try {
        const { stdout: detailText } = await execFileAsync("gh", ["api", `repos/${repositorySlug}/pulls/${candidate.number}`], {
          cwd: repository, timeout: 15_000, maxBuffer: 256 * 1024,
        });
        const detail = JSON.parse(detailText) as Record<string, unknown>;
        const detailBase = detail.base && typeof detail.base === "object" ? detail.base as Record<string, unknown> : {};
        const detailHead = detail.head && typeof detail.head === "object" ? detail.head as Record<string, unknown> : {};
        const detailRepo = detailHead.repo && typeof detailHead.repo === "object" ? detailHead.repo as Record<string, unknown> : {};
        if (detail.number !== candidate.number || detail.state !== "open" || detail.draft !== false ||
            detailBase.ref !== baseBranch || typeof detailHead.sha !== "string" ||
            detailHead.sha !== candidate.headRefOid || typeof detail.mergeable !== "boolean" ||
            typeof detail.mergeable_state !== "string" || detailRepo.full_name?.toString().toLowerCase() !== repositorySlug.toLowerCase()) return null;
        return { ...candidate, mergeable: detail.mergeable, mergeStateStatus: detail.mergeable_state.toUpperCase() };
      } catch { return null; }
    }));
    enriched.push(...results.filter((item): item is ListedPullRequest => item !== null));
  }
  return enriched;
}
