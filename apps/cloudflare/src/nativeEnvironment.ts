import type { CloudflareEnvironment, VectorIndexBinding, VectorRecord } from "./contracts";
import { createNativeRunnerContainerBinding, isPinnedRunnerImage, type NativeRunnerContainerNamespace } from "./nativeRunnerContainer";

type NativeVectorIndex = {
  upsert(records: VectorRecord[]): Promise<unknown>;
  query(vector: number[], options: { topK: number; filter: { tenantId: string }; returnMetadata: "all" }): Promise<unknown>;
  getByIds(ids: string[]): Promise<unknown>;
  deleteByIds(ids: string[]): Promise<unknown>;
};
/** Vectorize's real query signature is (vector, options), not the normalized
 * application port's object. Keep the tenant filter and ownership metadata. */
export function createNativeVectorIndexBinding(index: NativeVectorIndex): VectorIndexBinding {
  return {
    upsert: records => index.upsert([...records]),
    query: ({ vector, topK, filter }) => index.query([...vector], { topK, filter: { tenantId: filter.tenantId }, returnMetadata: "all" }),
    getByIds: ids => index.getByIds([...ids]),
    deleteByIds: ids => index.deleteByIds([...ids]),
  };
}

/** Used only at the provider entrypoint. Unit/application ports stay
 * normalized; resource creation and capability activation stay external. */
export function normalizeNativeEnvironment(env: CloudflareEnvironment): CloudflareEnvironment {
  const nativeContainer = env.JOB_CONTAINERS as unknown as NativeRunnerContainerNamespace | undefined;
  return {
    ...env,
    ...(env.VECTOR_INDEX ? { VECTOR_INDEX: createNativeVectorIndexBinding(env.VECTOR_INDEX as unknown as NativeVectorIndex) } : {}),
    ...(nativeContainer && typeof nativeContainer.get === "function" && typeof nativeContainer.idFromName === "function" &&
      isPinnedRunnerImage(env.CLOUDFLARE_RUNNER_IMAGE_REF) ? { JOB_CONTAINERS: createNativeRunnerContainerBinding(nativeContainer) } : {}),
  };
}
