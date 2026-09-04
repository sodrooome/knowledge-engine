#!/usr/bin/env node
/**
 * Query CLI — search the indexed vault from the command line.
 *
 * Embeds the question with the asymmetric "query" task hint, runs cosine
 * top-K against the per-model table, and prints ranked citations (path,
 * heading breadcrumb, line range, snippet, distance) so retrieval quality
 * can be judged by eye.
 *
 * Usage:
 *   npm run query -- "<question>" [k]
 */

import { bootstrapRag } from "./wiring.js";

/** Collapse whitespace and cap a snippet at a readable width. */
function snippet(text: string, maxChars = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > maxChars ? `${flat.slice(0, maxChars)}…` : flat;
}

async function main(): Promise<void> {
  const question = process.argv[2];
  if (question === undefined || question.trim() === "") {
    console.error('Usage: npm run query -- "<question>" [k]');
    process.exit(1);
  }

  const kArg = process.argv[3] !== undefined ? Number(process.argv[3]) : 5;
  const k = Number.isInteger(kArg) && kArg > 0 ? kArg : 5;

  const runtime = await bootstrapRag();
  console.log(
    `Querying ${runtime.provider.model} (${runtime.dimensions} dims), top-${k}\n`,
  );

  const [queryVector] = await runtime.provider.embed([question], "query");
  const hits = await runtime.store.search([...queryVector], k);

  if (hits.length === 0) {
    console.log("No matches. Did you run `npm run index` on your vault first?");
    return;
  }

  for (const [rank, hit] of hits.entries()) {
    const headings =
      hit.chunk.headingPath.length > 0
        ? hit.chunk.headingPath.join(" / ")
        : "(no heading)";
    const { startLine, endLine } = hit.chunk.location;
    console.log(
      `#${rank + 1} [${hit.distance.toFixed(4)}] ${hit.chunk.sourcePath} · ${headings} · L${startLine}-${endLine}`,
    );
    console.log(`   ${snippet(hit.chunk.text)}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
