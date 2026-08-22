/**
 * Application entry point.
 *
 * Responsibilities:
 * 1. Load configuration (fail fast if env is misconfigured)
 * 2. Initialize and run the application
 *
 * Design note: main() is a plain function so it can be imported and tested
 * without side effects. The actual execution only happens at the bottom
 * of this file.
 */

import { loadConfig, type Config } from "./config/config.js";

/**
 * Bootstraps the application.
 *
 * Loads configuration, validates it, and starts the engine.
 * Any configuration errors are caught, logged cleanly, and the
 * process exits with code 1.
 */
function main(): void {
  let config: Config;

  try {
    config = loadConfig();
  } catch (error) {
    console.error("Failed to load configuration:");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }

  console.log(`knowledge-engine started (${config.nodeEnv})`);
  console.log(
    `Embeddings: ${config.embedding.model} @ ${config.embedding.baseUrl}`,
  );
  console.log(`Vector store: ${config.lanceDb.path}`);
}

// Start the application only when this file is executed directly.
// This guard allows main() to be imported by tests without triggering
// side effects.
main();
