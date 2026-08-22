/**
 * Embedding module — barrel exports.
 *
 * Re-exports the public API of the embedding package so callers can import from
 * a single entry point:
 *
 * ```ts
 * import { createOpenAICompatibleEmbedding, probeDimensions } from "./embedding/index.js";
 * ```
 */

export type { EmbeddingProvider, EmbeddingTask } from "./EmbeddingProvider.js";
export { probeDimensions } from "./EmbeddingProvider.js";

export {
  createOpenAICompatibleEmbedding,
  type OpenAICompatibleEmbeddingOptions,
} from "./OpenAICompatibleEmbedding.js";
