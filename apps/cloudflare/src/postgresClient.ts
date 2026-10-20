import postgres from "postgres";
import { createHyperdriveClient, type HyperdriveSqlClient } from "./hyperdrive";
import type { HyperdriveBinding } from "./contracts";

/** A client belongs to one delivery, never another request's execution context.
 * Hyperdrive owns the remote pool. Always close the local sockets in finally. */
export async function withHyperdrivePostgres<T>(binding: HyperdriveBinding | undefined,
  work: (client: HyperdriveSqlClient) => Promise<T>): Promise<T> {
  let driver: ReturnType<typeof postgres> | undefined;
  const client = createHyperdriveClient(binding, (connectionString, options) => {
    driver = postgres(connectionString, options);
    const unsafe = <R>(query: string, parameters: readonly unknown[] = []) =>
      driver!.unsafe(query, [...parameters] as never[], { prepare: true }) as unknown as Promise<R>;
    return {
      unsafe,
      begin: <R>(callback: (transaction: HyperdriveSqlClient) => Promise<R>) => driver!.begin(async transaction => callback({
        unsafe: <V>(query: string, parameters: readonly unknown[] = []) =>
          transaction.unsafe(query, [...parameters] as never[], { prepare: true }) as unknown as Promise<V>,
        begin: async () => { throw new Error("HYPERDRIVE_NESTED_TRANSACTION_DENIED"); },
      })) as unknown as Promise<R>,
    };
  });
  try { return await work(client); }
  finally { await driver?.end({ timeout: 1 }); }
}
