# Contributing to knowledge-engine

Thanks for wanting to help. This project stays small on purpose (see the _Minimum Viable Second Brain_ philosophy in the [README](README.md)), so contributions that fit the current loop are worth more than contributions that add surface area.

## Ways to contribute

- **Code** — bug fixes and features along the roadmap in `planning.md`
- **Tests** — see the note below on how tests are handled here
- **Docs** — README clarity, docstrings, examples, this site's pages
- **Bug reports** — open an issue with steps to reproduce, expected vs actual, and your platform (Intel Mac users: include your `@lancedb/lancedb` version — see the platform notes in the README)

## Getting started

```bash
# requires Node >= 20
npm install
npm run build        # tsc
npm run typecheck    # tsc --noEmit
make test            # vitest suite

# for anything touching embeddings or the vector store,
# copy .env.example to .env and set EMBEDDING_API_KEY + LANCEDB_PATH
npm run smoke        # end-to-end: embed → store → query
```

The project structure is documented in the [README](README.md). Each directory (`parser/`, `embedding/`, `store/`, …) is one complete, testable component.

## Ground rules

These are the project's design principles. PRs that follow them get merged faster:

- **Strict TypeScript** — strict mode, ESM, `verbatimModuleSyntax`, no `any`, no type suppressions
- **No DI framework** — clean functional interfaces; dependencies are injected via function arguments
- **Incremental** — each part is a complete, testable component that builds on the foundation; don't skip ahead of `planning.md`
- **Fail-fast** — configuration is validated at startup; malformed YAML or missing env vars throw immediately
- **Don't optimize ahead of the roadmap** — the MVSB table in the README lists what we're deliberately *not* doing yet

### A note on tests

Unit and integration tests in this repo are written manually by the maintainer. AI-assisted test generation may be used only when explicitly requested. If you contribute tests, hand-write them — a failing-to-passing repro test for a bug you found is the most valuable test of all.

## Commit & PR style

- Commits follow conventional prefixes, matching the existing log: `feat:`, `fix:`, `docs:`, `chore:`, `test:`
- Keep PRs small and focused; one behavior change per PR
- Describe what changed and why in the PR body; link any issue it closes
- If your change alters behavior visible to users, add an entry under **Unreleased** in [CHANGELOG.md](CHANGELOG.md)
- Every change is reviewed by hand before merging — expect questions, they're not objections
