import type { HyperdriveBinding } from "./contracts";

export type HyperdriveSqlClient = {
  unsafe<T = unknown>(query: string, parameters?: readonly unknown[]): Promise<T>;
  begin<T>(callback: (transaction: HyperdriveSqlClient) => Promise<T>): Promise<T>;
};

export type HyperdriveClientFactory = (
  connectionString: string,
  options: { prepare: false; max: 1; connect_timeout: number; idle_timeout: number },
) => HyperdriveSqlClient;

export type CanonicalReadOptions = {
  cache: "no-store";
  consistency: "strong";
};

export const CANONICAL_TRANSACTION_POLICY = {
  isolation: "read committed",
  maxRetries: 3,
  retryableSqlStates: ["40001", "40P01"],
  lockRule: "state-changing reads use SELECT ... FOR UPDATE or an equivalent guarded predicate",
  externalCallsAllowedInsideTransaction: false,
} as const;

const FRESH_READ_OPTIONS: CanonicalReadOptions = { cache: "no-store", consistency: "strong" };

/**
 * Hyperdrive is a connection boundary only. The caller supplies the supported
 * postgres driver so this package remains testable without credentials and
 * without coupling business code to a provider SDK.
 */
export function createHyperdriveClient(
  binding: HyperdriveBinding | undefined,
  factory: HyperdriveClientFactory,
): HyperdriveSqlClient {
  const connectionString = binding?.connectionString?.trim();
  if (!connectionString) throw new Error("HYPERDRIVE_CONNECTION_NOT_CONFIGURED");
  return factory(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
  });
}

/** Reads that influence lease/fencing/status/recovery must bypass caches. */
export function canonicalReadOptions(): CanonicalReadOptions {
  return { ...FRESH_READ_OPTIONS };
}

export async function readCanonical<T>(
  client: HyperdriveSqlClient,
  query: string,
  parameters: readonly unknown[] = [],
): Promise<T> {
  return client.unsafe<T>(query, parameters);
}

/** The transaction is intentionally bounded to database work only. */
export async function withCanonicalTransaction<T>(
  client: HyperdriveSqlClient,
  work: (transaction: HyperdriveSqlClient) => Promise<T>,
): Promise<T> {
  return client.begin(work);
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
  return (CANONICAL_TRANSACTION_POLICY.retryableSqlStates as readonly string[]).includes(code);
}

/**
 * Retries only a rolled-back database transaction. The caller must reuse the
 * same command/event idempotency key, and must not perform network/provider
 * work inside `work`.
 */
export async function withBoundedCanonicalTransaction<T>(
  client: HyperdriveSqlClient,
  work: (transaction: HyperdriveSqlClient) => Promise<T>,
  maxRetries = CANONICAL_TRANSACTION_POLICY.maxRetries,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await withCanonicalTransaction(client, work);
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt >= maxRetries) throw error;
      attempt += 1;
    }
  }
}

export async function runCanonicalWriteThenExternal<T>(
  client: HyperdriveSqlClient,
  write: (transaction: HyperdriveSqlClient) => Promise<T>,
  external: (committed: T) => Promise<void>,
): Promise<T> {
  const committed = await withBoundedCanonicalTransaction(client, write);
  await external(committed);
  return committed;
}
