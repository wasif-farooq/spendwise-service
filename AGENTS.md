# Spendwise Backend - Agent Instructions

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
- Frontend Repo: @../spendwise-web/

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
