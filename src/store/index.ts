/**
 * Store module — barrel exports.
 *
 * Re-exports the public API of the store package so callers can import from
 * a single entry point:
 *
 * ```ts
 * import { createLanceDBVectorStore } from "./store/index.js";
 * ```
 */

export {
  chunkTableName,
  createLanceDBVectorStore,
  type LanceDBVectorStore,
  type LanceDBVectorStoreOptions,
  type EmbeddedChunk,
  type VectorSearchHit,
} from "./LanceDBVectorStore.js";
