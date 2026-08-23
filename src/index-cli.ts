/**
 * Bulk-index CLI — the E2E glue between the parser and the vector store.
 *
 * Walks a vault directory, parses every markdown note, chunks it, embeds the
 * chunks, and replaces that document's rows in the per-model table. Re-running
 * is idempotent: edited notes replace cleanly, so this is also the skeleton
 * the incremental indexer (Part 5) will build on.
 *
 * Usage:
 *   npm run index -- <vaultPath>
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { bootstrapRag } from "./wiring.js";
import { parseMarkdown, chunkSections } from "./parser/index.js";
import { extractFrontmatter } from "./utils/index.js";
import { hashString } from "./utils/hash.js";
import type { EmbeddedChunk } from "./store/index.js";

/** Result counters reported at the end of a run. */
interface IndexStats {
  indexed: number;
  empty: number;
  failed: number;
  chunksStored: number;
}

/**
 * Recursively collect markdown files under `root`, sorted for determinism.
 *
 * Any path segment starting with "." is skipped entirely (.obsidian, .trash,
 * .git), matching Obsidian's convention of hiding system folders.
 */
function collectMarkdownFiles(root: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(full);
      }
    }
  }

  walk(root);
  return files.sort();
}

/**
 * Index a single note: parse -> chunk -> embed -> replace its rows.
 *
 * Deleting by documentId before inserting makes re-runs idempotent even when
 * a note shrank to fewer chunks than its previous version had.
 *
 * @returns The number of chunks stored.
 */
async function indexNote(
  absolutePath: string,
  relativePath: string,
  provider: Awaited<ReturnType<typeof bootstrapRag>>["provider"],
  store: Awaited<ReturnType<typeof bootstrapRag>>["store"],
): Promise<number> {
  const raw = readFileSync(absolutePath, "utf8");
  const documentId = hashString(raw);
  const { body } = extractFrontmatter(raw);
  const sections = parseMarkdown(body);
  const chunks = chunkSections(documentId, relativePath, sections);

  // Purge stale rows first so an emptied or shrunk note cannot leave orphans.
  await store.deleteByDocument(documentId);

  if (chunks.length === 0) {
    return 0;
  }

  const vectors = await provider.embed(
    chunks.map((c) => c.text),
    "document",
  );
  const embedded: EmbeddedChunk[] = chunks.map((chunk, i) => ({
    chunk,
    vector: [...vectors[i]],
  }));
  await store.addChunks(embedded);
  return embedded.length;
}

async function main(): Promise<void> {
  const vaultArg = process.argv[2];
  if (vaultArg === undefined || vaultArg === "") {
    console.error("Usage: npm run index -- <vaultPath>");
    process.exit(1);
  }

  const vaultRoot = resolve(vaultArg);
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(vaultRoot);
  } catch {
    console.error(`Vault path does not exist: ${vaultRoot}`);
    process.exit(1);
  }
  if (!stats.isDirectory()) {
    console.error(`Vault path is not a directory: ${vaultRoot}`);
    process.exit(1);
  }

  const runtime = await bootstrapRag();
  console.log(
    `Indexing ${vaultRoot}\nModel: ${runtime.provider.model} (${runtime.dimensions} dims)`,
  );

  const files = collectMarkdownFiles(vaultRoot);
  if (files.length === 0) {
    console.log("No markdown files found.");
    return;
  }

  const totals: IndexStats = {
    indexed: 0,
    empty: 0,
    failed: 0,
    chunksStored: 0,
  };

  for (const [i, file] of files.entries()) {
    const rel = relative(vaultRoot, file);
    try {
      const stored = await indexNote(
        file,
        rel,
        runtime.provider,
        runtime.store,
      );
      if (stored === 0) {
        totals.empty += 1;
        console.log(`[${i + 1}/${files.length}] ${rel} — no chunks (empty?)`);
      } else {
        totals.indexed += 1;
        totals.chunksStored += stored;
        console.log(`[${i + 1}/${files.length}] ${rel} — ${stored} chunks`);
      }
    } catch (error) {
      totals.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${i + 1}/${files.length}] ${rel} — FAILED: ${message}`);
    }
  }

  console.log(
    `\nDone. Indexed ${totals.indexed} notes (${totals.chunksStored} chunks), ` +
      `${totals.empty} empty, ${totals.failed} failed.`,
  );
  if (totals.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
