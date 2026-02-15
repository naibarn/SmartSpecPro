/**
 * Embedding generation service using Cloudflare Workers AI.
 *
 * Provides text embedding generation (768-dim via bge-base-en-v1.5),
 * document chunking, and image description via vision model.
 */

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5"; // 768 dimensions
const VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const CHUNK_SIZE = 2000; // ~500 tokens
const CHUNK_OVERLAP = 200;

function getWorkersAiUrl(model: string): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

function getApiKey(): string {
  const key = process.env.CLOUDFLARE_AI_API_KEY;
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
  const response = await fetch(getWorkersAiUrl(EMBEDDING_MODEL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: [text] }),
  });

  if (!response.ok) {
    throw new Error(
      `Workers AI embedding failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    result: { data: number[][] };
    success: boolean;
  };
  return data.result.data[0];
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
    result: { description: string };
    success: boolean;
  };
  return data.result.description;
}
