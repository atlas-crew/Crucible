set dotenv-load := false
set positional-arguments := true

# Default recipe: list all available recipes
default:
    @just --list

# ── Install ────────────────────────────────────

# Install all workspace dependencies via pnpm
install:
    pnpm install

# Reinstall from scratch (removes node_modules and lockfile caches)
reinstall: clean-modules
    pnpm install

# ── Dev servers ────────────────────────────────

# Run web-client + demo-dashboard dev servers in parallel (mirrors `pnpm dev`)
dev:
    pnpm dev

# Run only the Next.js web client
dev-web:
    pnpm --filter web-client dev

# Run only the demo-dashboard API/server
dev-api:
    pnpm --filter @crucible/demo-dashboard dev

# ── Build ──────────────────────────────────────

# Build every project via Nx
build:
    pnpm build

# Build a single project by name (e.g. `just build-one web-client`)
build-one project:
    pnpm --filter {{project}} build

# Build only the publishable release artifacts (client, CLI, crucible)
build-release:
    pnpm build:release

# ── Quality gates ──────────────────────────────

# Run the full test suite via Nx
test:
    pnpm test

# Run tests for a single project (e.g. `just test-one web-client`)
test-one project:
    pnpm --filter {{project}} test

# Watch-mode tests for a single project
test-watch project="web-client":
    pnpm --filter {{project}} test:watch

# Lint every project via Nx
lint:
    pnpm lint

# Type-check every project via Nx
type-check:
    pnpm type-check

# Run lint + type-check + tests in order (fast-fail CI pipeline)
check: lint type-check test

# ── Docker ─────────────────────────────────────

image := "crucible:local"

# Build the production Docker image
docker-build:
    docker build -t {{image}} .

# Run the Docker image locally on port 3000
docker-run port="3000":
    docker run --rm -p {{port}}:3000 {{image}}

# ── Cleanup ────────────────────────────────────

# Remove build outputs (dist/, .next/, tsbuildinfo) — keeps node_modules
clean:
    rm -rf apps/*/dist apps/*/.next apps/*/tsconfig.tsbuildinfo
    rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo
    rm -rf .nx/cache

# Remove every node_modules directory in the workspace
clean-modules:
    find . -name node_modules -type d -prune -exec rm -rf {} +

# Remove build outputs AND node_modules (full reset)
nuke: clean clean-modules

# ── Docs ───────────────────────────────────────

# Ruby path (Homebrew); override with RUBY_DIR= if needed
ruby_bin := env("RUBY_DIR", "/opt/homebrew/opt/ruby/bin")

# Serve the documentation site locally (Jekyll, default port 4000)
docs-serve port="4000":
    cd docs && PATH="{{ruby_bin}}:$PATH" bundle install --quiet && PATH="{{ruby_bin}}:$PATH" bundle exec jekyll serve --port {{port}} --livereload --livereload-port 35732

# Build the documentation site without serving
docs-build:
    cd docs && PATH="{{ruby_bin}}:$PATH" bundle install --quiet && PATH="{{ruby_bin}}:$PATH" bundle exec jekyll build
