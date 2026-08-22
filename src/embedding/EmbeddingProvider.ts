/**
 * Core embedding provider interface.
 *
 * All embedding adapters (OpenAI-compatible, native Gemini, Ollama, etc.)
 * implement this interface so the rest of the system can swap providers
 * without knowing implementation details.
 */

/** Task hint passed to providers that support asymmetric retrieval embeddings. */
export type EmbeddingTask = "document" | "query";

export interface EmbeddingProvider {
  /** Model identifier, e.g. "google/gemini-embedding-001". */
  readonly model: string;

  /**
   * Embed texts in order; result[i] corresponds to texts[i].
   * May be called repeatedly with different batches.
   */
  embed(
    texts: readonly string[],
    task: EmbeddingTask,
  ): Promise<readonly number[][]>;
}

/**
 * Resolve the output dimensionality by embedding one probe string.
 *
 * Used once at wiring time when no env override or existing LanceDB schema exists.
 *
 * @param provider - The embedding provider to probe.
 * @returns The length of the embedding vector produced by the provider.
 */
export async function probeDimensions(
  provider: EmbeddingProvider,
): Promise<number> {
  const embeddings = await provider.embed(["probe"], "document");
  if (embeddings.length === 0 || embeddings[0].length === 0) {
    throw new Error(
      "probeDimensions: provider returned an empty embedding vector",
    );
  }
  return embeddings[0].length;
}
