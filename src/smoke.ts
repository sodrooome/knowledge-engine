/**
 * Manual smoke test for Parts 3 & 4 (embedding provider + LanceDB store).
 *
 * NOT part of the library and not an automated test — this is a hands-on
 * harness for verifying the OpenRouter embedding path and vector storage
 * against real services before the indexer (Part 5) wires them together.
 *
 * Run with:
 *   npm run smoke
 *
 * What it does:
 * 1. Loads config from .env (fails fast if misconfigured).
 * 2. Probes the embedding dimensionality (validates the API key).
 * 3. Embeds three sample notes ("document" task).
 * 4. Creates/opens the LanceDB table, replacing rows from previous runs.
 * 5. Embeds one question ("query" task) and prints the top-3 hits.
 */

import { loadConfig } from "./config/config.js";
import {
  createOpenAICompatibleEmbedding,
  probeDimensions,
} from "./embedding/index.js";
import {
  chunkTableName,
  createLanceDBVectorStore,
  type EmbeddedChunk,
} from "./store/index.js";
import { hashString } from "./utils/hash.js";

/** Fixed document id so repeated runs REPLACE prior smoke rows, not append. */
const SMOKE_DOC_ID = hashString("knowledge-engine::smoke");

async function smoke(): Promise<void> {
  const config = loadConfig();
  const provider = createOpenAICompatibleEmbedding(config.embedding);
  console.log(`Provider model: ${provider.model}`);

  // Step 1: probe — cheapest possible call; also proves the API key works.
  const dimensions = await probeDimensions(provider);
  console.log(`Embedding dimensions: ${dimensions}`);

  // Step 2: embed sample chunks (asymmetric task: documents).
  const texts = [
    "Eventual consistency trades immediate accuracy for higher availability.",
    "Carbonara is pasta with eggs, pecorino, pancetta, and black pepper.",
    "LanceDB stores embeddings locally for semantic search over documents.",
  ];
  const vectors = await provider.embed(texts, "document");
  console.log(`Embedded ${vectors.length} document chunks`);

  // Step 3: store them — one table per model, so switching EMBEDDING_MODEL
  // never destroys the other model's index.
  const store = await createLanceDBVectorStore({
    dbPath: config.lanceDb.path,
    tableName: chunkTableName(provider.model, dimensions),
    dimensions,
  });
  await store.deleteByDocument(SMOKE_DOC_ID); // idempotent re-runs
  const chunks: EmbeddedChunk[] = texts.map((text, i) => ({
    chunk: {
      id: hashString(text),
      documentId: SMOKE_DOC_ID,
      sourcePath: "smoke/sample.md",
      headingPath: i === 0 ? ["Engineering", "Distributed systems"] : [],
      location: { startLine: i * 10, endLine: i * 10 + 1 },
      index: i,
      text,
    },
    vector: [...vectors[i]],
  }));
  await store.addChunks(chunks);
  console.log(`Rows in table: ${await store.countRows()}`);

  // Step 4: query (asymmetric task: query) and print hits.
  const [queryVector] = await provider.embed(
    ["How do distributed systems stay available?"],
    "query",
  );
  const hits = await store.search([...queryVector], 3);
  console.log("\nTop-3 hits:");
  for (const hit of hits) {
    const headings = hit.chunk.headingPath.join(" / ") || "(no heading)";
    console.log(
      `  distance=${hit.distance.toFixed(4)}  [${headings}] ${hit.chunk.text}`,
    );
  }
}

smoke().catch((error) => {
  console.error("Smoke test failed:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
