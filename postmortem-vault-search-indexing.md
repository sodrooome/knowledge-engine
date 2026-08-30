# Post-mortem: vault search and indexing smoke test

Date: 2026-08-28  
Status: Findings from an ad-hoc smoke test; not a controlled experiment

## TL;DR

- **[EVIDENCE]** Natural-language wording can change the results because the agent reconstructs the query sent to `search_vault`.
- **[EVIDENCE]** `search_vault` searches indexed content rather than the live vault. Re-indexing is required after notes are added or edited ([README.md:213-216](README.md#L213-L216)).
- **[OPEN QUESTION]** The smoke test did not isolate whether restarting OpenCode changes visibility of a newly re-indexed table. It is not established that a restart is either required or unnecessary for this case.
- **[EVIDENCE]** A result count from `search_vault` is a ranked top-K sample, not an exhaustive count of matching notes ([README.md:153-156](README.md#L153-L156)).

## Context

This test used conversational questions about the user's Obsidian vault through the knowledge-engine MCP server. The questions included books, ADB tooling, and retrospectives. The purpose was to check whether the retriever could surface notes written by the user after the vault had been re-indexed.

The project exposes `search_vault(query: string, k?: number)` through MCP. The tool embeds the query, searches the indexed vault, and returns ranked citations with paths, headings, line ranges, and full matching text ([README.md:151-156](README.md#L151-L156)). The MCP server is registered in project configuration ([opencode.json:15-23](opencode.json#L15-L23)).

## Observations

### Different questions produced different search inputs

The first book question was interpreted as:

```text
book read reading novel literature
```

That search surfaced one explicit book reference: *Designing Data-Intensive Applications*.

The later book-count question was interpreted as two broader searches:

```text
book read reading list bookshelf novel author
buku bacaan penulis novel
```

Those searches surfaced four book-related references, including *Poor Economics*, *Distributed Systems: Principles and Paradigms*, and *Surplus Pekerja di Kapitalisme Pinggiran*.

**[EVIDENCE]** The wording and the agent's query reconstruction changed between the two observations. Therefore, the difference cannot be attributed to a session restart alone.

### Re-indexing and restarting happened close together

The user re-indexed the vault, returned to the existing session, and initially observed the earlier result. After restarting OpenCode and asking again, the broader search surfaced more notes.

**[EVIDENCE]** Re-indexing is a separate manual CLI operation: `npm run index -- <vaultPath>` ([README.md:145-149](README.md#L145-L149)). The bulk indexer replaces a note's stored chunks on re-runs ([planning.md:157-159](planning.md#L157-L159)).

**[HYPOTHESIS]** The MCP server may retain a runtime and LanceDB table handle for the process lifetime. The documented design says that the RAG runtime is initialized lazily and cached for that lifetime ([README.md:207-210](README.md#L207-L210); [planning.md:161-165](planning.md#L161-L165)). It is not yet verified whether a separate indexing process updates what an already-open server process sees.

### Embedding configuration is relevant, but not the only variable

**[EVIDENCE]** The default embedding model is `openai/text-embedding-3-small`, accessed through OpenRouter ([README.md:234-239](README.md#L234-L239)). Each model has its own vector table, and a table contains only content indexed while that model was active ([planning.md:146-154](planning.md#L146-L154)).

**[EVIDENCE]** The tool performs cosine top-K retrieval, with a default of five results and a maximum of 20 ([planning.md:167-170](planning.md#L167-L170)). The OpenRouter-compatible embedding path also cannot pass Gemini's `taskType`, which the project documents as a possible retrieval-quality limitation ([README.md:241-244](README.md#L241-L244)).

**[CONCLUSION]** Query construction, index freshness, the active embedding model/table, chunking, and retrieval settings can all affect what is returned. The smoke test only demonstrated that query wording materially affected the observed output; it did not measure the contribution of each variable.

## Limitations

- **[EVIDENCE]** The test was conversational and ad hoc, not a controlled experiment.
- The agent, rather than the user, selected the exact search strings sent to `search_vault`.
- The query strings, result limit, session state, and index state were not held constant across all observations.
- A top-K result list cannot establish the total number of books or retrospectives in the vault.
- Only one vault and one active embedding configuration were observed.
- No MCP or LanceDB telemetry was collected to show whether the server reopened its table after re-indexing.

## Controlled follow-up tests

These tests are proposed and have not yet been executed.

### Test A: Does restarting OpenCode change retrieval?

- **Independent variable:** OpenCode process restart.
- **Controls:** Re-index once; use one fixed query string, fixed model, fixed `k`, and unchanged vault contents.
- **Procedure:** Run the exact query in session 1, restart OpenCode, then run the exact same query in session 2.
- **Dependent variable:** Ranked paths, distances, and text returned.
- **Decision criterion:** Identical output suggests no observable restart effect under those conditions; different output indicates that restart or process state affects retrieval.

### Test B: Does re-indexing become visible without a restart?

- **Independent variable:** Re-indexing after changing one note.
- **Controls:** Keep the same OpenCode session, query, model, and `k`.
- **Procedure:** Search once, edit or add a uniquely identifiable note, run the index CLI, then search again in the same session.
- **Dependent variable:** Whether the new note appears and whether old chunks disappear as expected.
- **Decision criterion:** Visibility in the same session shows that a restart is not required for that path; invisibility supports investigating table-handle or process-lifecycle behavior.

### Test C: How much does query wording matter?

- **Independent variable:** Query phrasing.
- **Controls:** Hold the indexed vault, model, session, and `k` constant.
- **Procedure:** Run several phrasings of the same intent, such as book list, books read, reading history, and completed books.
- **Dependent variable:** Overlap of returned paths and rank positions.
- **Decision criterion:** Compare top-K overlap, for example with Jaccard similarity, rather than comparing only the number of results.

## Recommendations

1. Re-index after adding or editing vault notes.
2. For counting or inventory questions, use several fixed, explicit queries and merge and de-duplicate cited paths.
3. Report result counts as retrieved top-K evidence unless an exhaustive listing mechanism is used.
4. Do not add a workflow requirement that OpenCode must be restarted until Tests A and B isolate the effect.
5. When comparing retrieval quality, record the exact query string, model, table, `k`, and index timestamp.

## Codebase Improvement Recommendations

These are recommendations for the repository, not changes made by this post-mortem.

### High priority: make retrieval state observable

- **Expose query metadata in every result.** Return the normalized query text, embedding model, table name, requested `k`, and an index identifier or timestamp alongside the citations. This makes it possible to distinguish query changes from index changes during debugging.
- **Add an index status command or MCP tool.** Report the indexed vault path, active model/table, indexed-note count, chunk count, and last successful indexing time. A user should not have to infer freshness from search results.
- **Log process and table lifecycle at debug level.** Record when the MCP server bootstraps, opens a table, and observes an index change. Do not log note contents or embedding credentials.

### High priority: define freshness behavior

- **Choose and document one freshness contract.** Either the long-lived MCP server detects an index update and reopens or refreshes its table, or re-indexing explicitly requires restarting the MCP server. The current documentation establishes runtime caching and manual indexing but does not establish this cross-process behavior ([README.md:207-216](README.md#L207-L216)).
- **Add an integration test for the contract.** Test both re-indexing with the same MCP process and re-indexing followed by a process restart. Use a unique marker note and assert whether it appears or disappears as expected.
- **Prefer an explicit reload mechanism over an implicit restart.** If table refresh is supported, expose a safe reload operation or detect the index generation before searching. This avoids making users restart OpenCode merely to refresh knowledge.

### Medium priority: make inventory questions reliable

- **Add a clearly named exhaustive or metadata-based path.** Semantic top-K retrieval is appropriate for finding relevant passages, but it is not sufficient for questions such as “how many books?” or “list every retrospective.” A future inventory tool could enumerate indexed documents and return de-duplicated source paths before semantic ranking is applied.
- **Preserve provenance through de-duplication.** When multiple chunks from one note match, aggregate by `source_path` while retaining the best distance and all relevant headings. This makes note counts less sensitive to chunking.
- **Allow callers to request a larger bounded `k` explicitly.** Keep the existing default, but make the count-oriented workflow visible rather than relying on the agent to guess a query strategy.

### Medium priority: test query sensitivity and model changes

- **Create a retrieval regression fixture.** Store a small, non-sensitive fixture vault with known notes and expected source-path overlap for several equivalent queries.
- **Track model/table identity in test results.** Since each embedding model has its own table, retrieval tests must record which table was exercised ([planning.md:146-154](planning.md#L146-L154)).
- **Measure query variants with top-K overlap.** Add a repeatable benchmark for equivalent phrasings instead of treating one natural-language query as an exhaustive search.

### Scope boundary

Do not automatically add query expansion, retries, fallback models, or a mandatory restart workflow solely because of this smoke test. First establish the freshness contract and collect reproducible measurements; then make the smallest change that addresses the verified failure mode.

## Repository references

- [README.md:151-156](README.md#L151-L156): `search_vault` interface and top-K behavior.
- [README.md:201-202](README.md#L201-L202): restart requirement for configuration changes.
- [README.md:207-216](README.md#L207-L216): runtime caching and manual re-indexing.
- [README.md:234-244](README.md#L234-L244): embedding model and `taskType` caveat.
- [planning.md:146-159](planning.md#L146-L159): per-model tables and bulk indexer behavior.
- [planning.md:161-177](planning.md#L161-L177): MCP lifecycle and configuration notes.
- [opencode.json:15-23](opencode.json#L15-L23): project MCP registration.
