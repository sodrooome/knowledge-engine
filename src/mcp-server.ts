#!/usr/bin/env node
/**
 * Opencode integration — MCP server exposing the vault retriever as a tool.
 *
 * This is the search-only half of Part 8 (see planning.md, Decision log). It
 * wraps the existing RAG pipeline (`bootstrapRag`) behind the Model Context
 * Protocol so any agent in Opencode can call `search_vault` as a first-class
 * tool and have citations injected straight into its context — no CLI, no
 * manual step, no per-query recompilation.
 *
 * The runtime is bootstrapped lazily on the first tool call and cached, so the
 * expensive setup (embedding dimension probe + opening the LanceDB table)
 * happens exactly once per server process; every subsequent query is just
 * embed + top-K search.
 *
 * Run standalone (for local testing):
 *   node --env-file=.env dist/mcp-server.js
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bootstrapRag, type RagRuntime } from "./wiring.js";

/** Resolved RAG runtime, populated on first use. */
let runtime: RagRuntime | null = null;

/**
 * Lazily build and cache the RAG runtime.
 *
 * Deliberately not awaited at startup: MCP stdio servers should begin
 * answering protocol requests immediately, and the dimension probe hits the
 * network. Caching means the one-time cost is paid only if the tool is
 * actually invoked.
 */
async function getRuntime(): Promise<RagRuntime> {
  if (runtime === null) {
    runtime = await bootstrapRag();
  }
  return runtime;
}

/** Collapse whitespace in a heading path for readable labels. */
function headingLabel(headingPath: readonly string[]): string {
  if (headingPath.length === 0) {
    return "(no heading)";
  }
  return headingPath.join(" / ");
}

const server = new McpServer({
  name: "knowledge-engine",
  version: "0.1.0",
});

server.registerTool(
  "search_vault",
  {
    title: "Search the user's Obsidian vault",
    description:
      "Semantic search over the user's personal knowledge base (an Obsidian " +
      "vault indexed by knowledge-engine). Use this when answering needs " +
      "information the user may have written in their notes, such as insights, " +
      "gotchas, recipes, or past writing. Returns ranked citations with the " +
      "source path, section headings, line range, and the full text of each " +
      "matching note so you can ground your answer in the user's own writing.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Natural-language question or topic to search for."),
      k: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of results to return. Defaults to 5 (max 20)."),
    },
  },
  async ({ query, k }) => {
    const runtime = await getRuntime();
    const limit = k ?? 5;

    const [queryVector] = await runtime.provider.embed([query], "query");
    const hits = await runtime.store.search([...queryVector], limit);

    if (hits.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "No matches found. The vault may need indexing first " +
              "(`npm run index -- <vaultPath>`).",
          },
        ],
      };
    }

    const lines = hits.map((hit, rank) => {
      const { chunk, distance } = hit;
      const { startLine, endLine } = chunk.location;
      return (
        `#${rank + 1} [distance ${distance.toFixed(4)}] ` +
        `${chunk.sourcePath} · ${headingLabel(chunk.headingPath)} · ` +
        `L${startLine}-${endLine}\n${chunk.text}`
      );
    });

    return {
      content: [{ type: "text" as const, text: lines.join("\n\n---\n\n") }],
    };
  },
);

// Start the server. The transport is created here (not at import time) so
// the module can be imported by tests without spawning stdio.
const transport = new StdioServerTransport();
await server.connect(transport);
