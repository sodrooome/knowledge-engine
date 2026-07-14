/**
 * Minimal configuration loader.
 *
 * Loads values from process.env and validates that required keys are present.
 * Returns a frozen config object so values cannot be mutated at runtime.
 */

export interface Config {
  readonly nodeEnv: "development" | "production" | "test";
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

export function loadConfig(options: ConfigLoaderOptions = {}): Config {
  const env = options.env ?? process.env;

  const nodeEnvRaw = requireEnv(env, "NODE_ENV");
  const nodeEnv = parseNodeEnv(nodeEnvRaw);

  return Object.freeze({
    nodeEnv,
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
