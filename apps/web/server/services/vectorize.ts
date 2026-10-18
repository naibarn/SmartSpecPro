/**
 * Embedding generation service using Cloudflare Workers AI.
 *
 * Provides text embedding generation (768-dim via bge-base-en-v1.5),
 * document chunking, and image description via vision model.
 */

import { VECTORIZE_EMBEDDING_DIMENSIONS } from "./vectorizeContract";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const SPEC229_DENSE_EVAL_MODEL = "@cf/baai/bge-m3";
const VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const CHUNK_SIZE = 2000; // ~500 tokens
const CHUNK_OVERLAP = 200;

function getWorkersAiUrl(model: string, accountIdOverride?: string): string {
  const accountId = accountIdOverride || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID not set");
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

function getApiKey(apiKeyOverride?: string): string {
  const key = apiKeyOverride || process.env.CLOUDFLARE_AI_API_KEY;
  if (!key) throw new Error("CLOUDFLARE_AI_API_KEY not set");
  return key;
}

/**
 * Split text into overlapping chunks of ~2000 characters (~500 tokens).
 */
export function chunkDocument(text: string): string[] {
  if (text.length <= CHUNK_SIZE) {
    return [text];
  }

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Generate a 768-dimension embedding vector from text using Workers AI.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return generateEmbeddingForProfile(text, EMBEDDING_MODEL, VECTORIZE_EMBEDDING_DIMENSIONS);
}

/**
 * Generate the SPEC-229 comparison profile B vector. It is deliberately
 * separate from the production 768D helper and rejects any output that does
 * not match the SPEC's pinned 1024D contract.
 */
export async function generateSpec229DenseEvaluationEmbedding(
  text: string,
  credentials?: { accountId: string; apiKey: string },
): Promise<number[]> {
  const [vector] = await generateSpec229DenseEvaluationEmbeddings([text], credentials);
  return vector;
}

export async function generateSpec229DenseEvaluationEmbeddings(
  texts: string[],
  credentials?: { accountId: string; apiKey: string },
): Promise<number[][]> {
  if (texts.length === 0 || texts.some(text => !text.trim())) {
    throw new Error("SPEC-229 profile B embedding input must be non-empty");
  }
  return generateEmbeddingBatchForProfile(texts, SPEC229_DENSE_EVAL_MODEL, 1024, credentials);
}

async function generateEmbeddingForProfile(
  text: string,
  model: string,
  dimensions: number,
): Promise<number[]> {
  const [vector] = await generateEmbeddingBatchForProfile([text], model, dimensions);
  return vector;
}

async function generateEmbeddingBatchForProfile(
  texts: string[],
  model: string,
  dimensions: number,
  credentials?: { accountId: string; apiKey: string },
): Promise<number[][]> {
  const response = await fetch(getWorkersAiUrl(model, credentials?.accountId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey(credentials?.apiKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: texts }),
  });

  if (!response.ok) {
    throw new Error(
      `Workers AI embedding failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    result?: { data?: unknown };
    success: boolean;
  };
  const vectors = data.result?.data;
  if (
    data.success === false
    || !Array.isArray(vectors)
    || vectors.length !== texts.length
    || vectors.some(vector =>
      !Array.isArray(vector)
      || vector.length !== dimensions
      || vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
    )
  ) {
    throw new Error(`Workers AI embedding returned an invalid ${dimensions}-dimensional vector`);
  }
  return vectors as number[][];
}

/**
 * Generate a text description of an image using Workers AI vision model.
 */
export async function generateImageDescription(
  imageUrl: string,
): Promise<string> {
  // Fetch image bytes
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) {
    throw new Error(`Failed to fetch image: ${imgResponse.status}`);
  }
  const imageBuffer = await imgResponse.arrayBuffer();

  // Call vision model
  const response = await fetch(getWorkersAiUrl(VISION_MODEL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: Array.from(new Uint8Array(imageBuffer)),
      prompt: "Describe this image in 1-2 sentences.",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Workers AI vision failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    result?: { description?: unknown };
    success: boolean;
  };
  if (data.success === false || typeof data.result?.description !== "string") {
    throw new Error("Workers AI vision returned an invalid description");
  }
  return data.result.description;
}

export async function generateImageDescriptionFromBuffer(
  imageBuffer: Buffer | Uint8Array,
): Promise<string> {
  const bytes = imageBuffer instanceof Uint8Array
    ? imageBuffer
    : new Uint8Array(imageBuffer);

  const response = await fetch(getWorkersAiUrl(VISION_MODEL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: Array.from(bytes),
      prompt: "Describe this product image in 1-2 sentences for visual search.",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Workers AI vision failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    result?: { description?: unknown };
    success: boolean;
  };
  if (data.success === false || typeof data.result?.description !== "string") {
    throw new Error("Workers AI vision returned an invalid description");
  }
  return data.result.description;
}
