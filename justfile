set dotenv-load := false

default:
    @just --list

# ── Docs ───────────────────────────────────────

# Ruby path (Homebrew); override with RUBY_DIR= if needed
ruby_bin := env("RUBY_DIR", "/opt/homebrew/opt/ruby/bin")

# Serve the documentation site locally (Jekyll, default port 4000)
docs-serve port="4000":
    cd docs && PATH="{{ruby_bin}}:$PATH" bundle install --quiet && PATH="{{ruby_bin}}:$PATH" bundle exec jekyll serve --port {{port}} --livereload --livereload-port 35732

# Build the documentation site without serving
docs-build:
    cd docs && PATH="{{ruby_bin}}:$PATH" bundle install --quiet && PATH="{{ruby_bin}}:$PATH" bundle exec jekyll build
