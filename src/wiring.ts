/**
 * Runtime wiring shared by CLI entry points.
 *
 * Assembles the pieces built in Parts 1-4 into a ready-to-use runtime:
 * config -> embedding provider -> dimension probe -> per-model vector store.
 * The probe doubles as an API-key validation and keeps callers from having
 * to know how dimensionality is resolved.
 */

import { loadConfig, type Config } from "./config/config.js";
import {
  createOpenAICompatibleEmbedding,
  probeDimensions,
} from "./embedding/index.js";
import {
  chunkTableName,
  createLanceDBVectorStore,
  type LanceDBVectorStore,
} from "./store/index.js";

/** The assembled runtime handed to CLI commands. */
export interface RagRuntime {
  readonly config: Config;
  readonly provider: ReturnType<typeof createOpenAICompatibleEmbedding>;
  readonly dimensions: number;
  readonly store: LanceDBVectorStore;
}

/**
 * Bootstrap the full pipeline from environment configuration.
 *
 * @param options - Optional env override (defaults to process.env).
 * @returns Provider, resolved dimensions, and an open vector store.
 */
export async function bootstrapRag(
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<RagRuntime> {
  const config = loadConfig(options);
  const provider = createOpenAICompatibleEmbedding(config.embedding);
  const dimensions = await probeDimensions(provider);
  const store = await createLanceDBVectorStore({
    dbPath: config.lanceDb.path,
    tableName: chunkTableName(provider.model, dimensions),
    dimensions,
  });
  return { config, provider, dimensions, store };
}
