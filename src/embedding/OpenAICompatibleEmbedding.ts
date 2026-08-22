/**
 * OpenAI-compatible embedding adapter.
 *
 * Targets OpenRouter's `/api/v1/embeddings` endpoint (and any other
 * OpenAI-compatible surface).  Returns a plain object satisfying
 * {@link EmbeddingProvider} — no classes, no hidden state.
 */

import type { EmbeddingProvider, EmbeddingTask } from "./EmbeddingProvider.js";

/** Options required to wire up an OpenAI-compatible embedding client. */
export interface OpenAICompatibleEmbeddingOptions {
  readonly apiKey: string;
  /** e.g. "https://openrouter.ai/api/v1" — no trailing slash requirement enforced either way */
  readonly baseUrl: string;
  readonly model: string;
  /** Texts per HTTP request. Default 64. */
  readonly batchSize?: number;
}

/** Single item in the `data` array returned by the OpenAI embeddings endpoint. */
interface EmbeddingResponseItem {
  readonly embedding: readonly number[];
  readonly index: number;
}

/** Top-level shape of a successful OpenAI-compatible embeddings response. */
interface EmbeddingResponse {
  readonly data: readonly EmbeddingResponseItem[];
}

/**
 * Create an OpenAI-compatible embedding provider.
 *
 * Batches texts sequentially (no concurrency) and concatenates results
 * preserving input order.  Non-2xx responses throw with status and a
 * truncated body snippet.
 *
 * @param options - API key, base URL, model, and optional batch size.
 * @returns A plain {@link EmbeddingProvider} object.
 */
export function createOpenAICompatibleEmbedding(
  options: OpenAICompatibleEmbeddingOptions,
): EmbeddingProvider {
  const { apiKey, baseUrl, model, batchSize = 64 } = options;
  const trimmedBase = baseUrl.replace(/\/$/, "");

  return {
    model,

    async embed(
      texts: readonly string[],
      task: EmbeddingTask,
    ): Promise<readonly number[][]> {
      // The `task` argument is intentionally unused today: OpenRouter's
      // embeddings surface is OpenAI-shaped and cannot carry Gemini's
      // `taskType` (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY).  Keeping it in
      // the interface allows a future native Gemini adapter to honor it
      // without breaking callers.
      void task;

      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batchTexts = texts.slice(i, i + batchSize);
        const batchEmbeddings = await embedBatch(batchTexts);
        results.push(...batchEmbeddings);
      }

      return results;
    },
  };

  async function embedBatch(
    batchTexts: readonly string[],
  ): Promise<number[][]> {
    const url = `${trimmedBase}/embeddings`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [...batchTexts],
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const snippet = body.length > 300 ? `${body.slice(0, 300)}…` : body;
      throw new Error(
        `Embedding request failed: HTTP ${response.status} — ${snippet}`,
      );
    }

    const payload = (await response.json()) as EmbeddingResponse;

    if (!Array.isArray(payload.data)) {
      throw new Error("Embedding response missing 'data' array");
    }

    if (payload.data.length !== batchTexts.length) {
      throw new Error(
        `Embedding response length mismatch: expected ${batchTexts.length}, got ${payload.data.length}`,
      );
    }

    // Sort by index to guarantee order, then validate shape.
    const sorted = [...payload.data].sort((a, b) => a.index - b.index);

    const expectedDim = sorted[0]?.embedding.length ?? 0;
    if (expectedDim === 0) {
      throw new Error("Embedding response contained an empty embedding vector");
    }

    const embeddings: number[][] = [];
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      if (item.index !== i) {
        throw new Error(
          `Embedding response index gap: missing index ${i} in response`,
        );
      }
      if (item.embedding.length !== expectedDim) {
        throw new Error(
          `Embedding dimension mismatch within batch: first=${expectedDim}, index ${i}=${item.embedding.length}`,
        );
      }
      embeddings.push([...item.embedding]);
    }

    return embeddings;
  }
}
