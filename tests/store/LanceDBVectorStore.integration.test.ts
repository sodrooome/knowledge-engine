import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLanceDBVectorStore,
  type EmbeddedChunk,
} from "../../src/store/LanceDBVectorStore.js";
import type { Chunk } from "../../src/types/Chunk.js";

/**
 * Regression coverage for postmortem-vault-search-indexing.md: the MCP
 * server opens one LanceDBVectorStore and caches it for the process
 * lifetime, while `npm run index` re-indexes through a separate connection.
 * These tests assert that a long-lived handle observes writes/deletes made
 * by another handle afterwards, without being reopened or restarted.
 */

const DIMENSIONS = 4;
const VECTOR = [0.1, 0.2, 0.3, 0.4];

function makeEmbeddedChunk(overrides: Partial<Chunk> = {}): EmbeddedChunk {
  const chunk: Chunk = {
    id: "chunk-0",
    documentId: "doc-0",
    sourcePath: "notes/example.md",
    headingPath: ["Example"],
    location: { startLine: 0, endLine: 3 },
    index: 0,
    text: "example chunk text",
    ...overrides,
  };
  return { chunk, vector: VECTOR };
}

describe("LanceDBVectorStore freshness contract", () => {
  let dbPath: string;

  beforeEach(async () => {
    dbPath = await mkdtemp(join(tmpdir(), "knowledge-engine-lancedb-"));
  });

  afterEach(async () => {
    await rm(dbPath, { recursive: true, force: true });
  });

  it("a long-lived reader sees a write committed later by a separate connection", async () => {
    // Table already exists before the "MCP server" starts (vault was indexed once already).
    const bootstrap = await createLanceDBVectorStore({
      dbPath,
      dimensions: DIMENSIONS,
    });
    await bootstrap.addChunks([makeEmbeddedChunk()]);

    // Simulates the MCP server: opened once, cached for the process lifetime.
    const reader = await createLanceDBVectorStore({
      dbPath,
      dimensions: DIMENSIONS,
    });
    expect(await reader.countRows()).toBe(1);

    // Simulates `npm run index` re-indexing through a separate connection.
    const writer = await createLanceDBVectorStore({
      dbPath,
      dimensions: DIMENSIONS,
    });
    await writer.addChunks([
      makeEmbeddedChunk({ id: "chunk-1", documentId: "doc-1" }),
    ]);

    // The reader's handle predates this write — it must still observe it.
    expect(await reader.countRows()).toBe(2);
    const hits = await reader.search(VECTOR, 5);
    expect(hits.map((hit) => hit.chunk.id).sort()).toEqual([
      "chunk-0",
      "chunk-1",
    ]);
  });

  it("a long-lived reader observes a re-index (delete + add) committed by a separate connection", async () => {
    const bootstrap = await createLanceDBVectorStore({
      dbPath,
      dimensions: DIMENSIONS,
    });
    await bootstrap.addChunks([makeEmbeddedChunk({ text: "old content" })]);

    const reader = await createLanceDBVectorStore({
      dbPath,
      dimensions: DIMENSIONS,
    });
    expect(await reader.countRows()).toBe(1);

    // Mirrors the bulk indexer's re-index step (planning.md, Decision log):
    // replace a note's chunks via delete-by-document + add.
    const writer = await createLanceDBVectorStore({
      dbPath,
      dimensions: DIMENSIONS,
    });
    await writer.deleteByDocument("doc-0");
    await writer.addChunks([makeEmbeddedChunk({ text: "new content" })]);

    expect(await reader.countRows()).toBe(1);
    const hits = await reader.search(VECTOR, 5);
    expect(hits[0]?.chunk.text).toBe("new content");
  });
});
