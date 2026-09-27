# TrackMyPocket Backend - Agent Instructions

## Run Commands

```bash
# Development
npm run dev           # Main app entry (src/index.ts)
npm run dev:api       # API Gateway (processes/api-gateway/index.ts)
npm run dev:worker    # Worker process (processes/worker/index.ts)

# Build & Type Check
npm run build         # Compile to dist/
npm run type-check    # TypeScript check only

# Testing
npm run test          # All tests
npm run test:v1       # API v1 tests only
npm run test:v2       # API v2 tests only
npm run test:watch    # Watch mode

# Linting & Formatting
npm run lint          # ESLint
npm run lint:fix       # ESLint auto-fix
npm run format        # Prettier

# Database
npm run docker:up      # Start PostgreSQL, Redis, Kafka, MinIO, Grafana, Jaeger
npm run migrate:v1     # Run v1 schema migrations
npm run migrate:v2     # Run v2 schema migrations
npm run seed          # Seed database

# Other
npm run exchange-rates:fetch   # Fetch latest exchange rates
```

## Architecture

- **Multi-process**: `processes/api-gateway/`, `processes/worker/`, `processes/event-processor/`
- **Domain-driven**: `src/domains/` contains auth, users, transactions, categories, accounts, workspaces, etc.
- **Two API versions**: v1 and v2 (tests, migrations, routes split by version)
- **Services**: PostgreSQL, Redis, Kafka, MinIO (S3), Prometheus, Grafana, Jaeger

## Path Aliases

Uses `@/*` imports: `@domains/*`, `@shared/*`, `@config/*`, `@database/*`, `@messaging/*`, etc. (see tsconfig.json)

## Development Notes

- Requires Docker running for database/cache/queue services
- Uses `ts-node` with `tsconfig-paths/register` for path alias resolution in dev
- Environment: copy `.env.example` to `.env` before running
- Kafka topics must be created: `npm run kafka:topics`

## Related Projects
- Frontend Repo: @../trackmypocket-web/

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **spendwise-service** (4302 symbols, 10847 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/spendwise-service/context` | Codebase overview, check index freshness |
| `gitnexus://repo/spendwise-service/clusters` | All functional areas |
| `gitnexus://repo/spendwise-service/processes` | All execution flows |
| `gitnexus://repo/spendwise-service/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
