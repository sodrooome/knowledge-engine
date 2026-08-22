/**
 * Minimal configuration loader.
 *
 * Loads values from process.env and validates that required keys are present.
 * Returns a frozen config object so values cannot be mutated at runtime.
 */

export interface Config {
  readonly nodeEnv: "development" | "production" | "test";

  /** Embedding provider settings. */
  readonly embedding: Readonly<{
    /** OpenAI-compatible API base URL. */
    readonly baseUrl: string;
    /** API key for the embedding provider (required). */
    readonly apiKey: string;
    /** Model identifier, e.g. "google/gemini-embedding-001". */
    readonly model: string;
  }>;

  /** LanceDB vector store settings. */
  readonly lanceDb: Readonly<{
    /** Local directory path for the LanceDB database. */
    readonly path: string;
  }>;
}

export interface ConfigLoaderOptions {
  readonly env?: NodeJS.ProcessEnv;
}

function getEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key];
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = getEnv(env, key);
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvWithDefault(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: string,
): string {
  const value = getEnv(env, key);
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value;
}

export function loadConfig(options: ConfigLoaderOptions = {}): Config {
  const env = options.env ?? process.env;

  const nodeEnvRaw = requireEnv(env, "NODE_ENV");
  const nodeEnv = parseNodeEnv(nodeEnvRaw);

  const embeddingBaseUrl = getEnvWithDefault(
    env,
    "EMBEDDING_BASE_URL",
    "https://openrouter.ai/api/v1",
  );
  const embeddingApiKey = requireEnv(env, "EMBEDDING_API_KEY");
  const embeddingModel = getEnvWithDefault(
    env,
    "EMBEDDING_MODEL",
    "google/gemini-embedding-001",
  );

  const lanceDbPath = requireEnv(env, "LANCEDB_PATH");

  return Object.freeze({
    nodeEnv,
    embedding: Object.freeze({
      baseUrl: embeddingBaseUrl,
      apiKey: embeddingApiKey,
      model: embeddingModel,
    }),
    lanceDb: Object.freeze({
      path: lanceDbPath,
    }),
  });
}

function parseNodeEnv(raw: string): "development" | "production" | "test" {
  if (raw === "development" || raw === "production" || raw === "test") {
    return raw;
  }
  throw new Error(
    `Invalid NODE_ENV: "${raw}". Expected "development", "production", or "test".`,
  );
}
