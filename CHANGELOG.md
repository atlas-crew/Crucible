# Changelog

All notable changes to Crucible are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Repo-level tags (`v0.X.Y`) drive the release pipeline; individual workspace
packages have their own versions and only publish when bumped (see the
**Package versions** footer of each release).

## [Unreleased]

## [0.4.0] - 2026-04-28

### Added

- **Per-run target URL override.** Every scenario run now carries an
  effective target URL that flows end-to-end through the engine, REST
  surface, CLI, web client, and TypeScript client library. Targets
  validate as `http`/`https` URLs, scope the per-execution outbound
  allowlist, and persist on the execution record so restarts replay
  against the originating target rather than the engine default.
- **`--target` / `-t` flag** on `crucible simulate` and `crucible
  assess`, including the `--target=<url>` form. Multi-scenario `assess`
  invocations apply the target uniformly to every scenario in the run.
- **Launch dialog target overrides** in the web client, with per-run
  `Target: <url>` rows surfaced in the history sidebar.
- **REST API reference** documenting launch endpoints, restart
  semantics, the per-run `targetUrl` field, SSRF allowlist scoping,
  and WebSocket `EXECUTION_STARTED` / `EXECUTION_DELTA` payload shapes.
- **Client library README** documenting target URL usage, validation
  rules, restart-inheritance behavior, and a multi-environment
  example.
- **CLI user guide** entries documenting the launch dialog and per-run
  target workflow, including a multi-environment example.
- **Runner step schema contracts** for scenario authors, formalizing
  the runner step contract surface.
- **WAF blocking expectation toggle** for simulation scenarios,
  letting authors opt individual checks into WAF-blocked expected
  outcomes.
- **Dismiss finished executions** from the web client sidebar.
- **AI/LLM security scenarios** mapped to the OWASP Top 10 for LLM
  Applications, with hardened assertions and realistic payloads.
- **Compliance scenario coverage** expanded across PCI DSS, SOC 2,
  HIPAA (minimum necessary), Privacy frameworks, and PCI strong
  cryptography.
- **Scenario kind classification** and **OWASP / compliance rule_id
  tags** on every catalog scenario.
- **Mermaid diagram rendering** in the GitHub Pages site layout.
- **Client library and CLI user guides** added to the Pages site and
  README index.
- **Workspace `justfile` recipes** for dev, build, test, docker, and
  cleanup, plus tmux service targets for long-running dev processes.

### Changed

- **Scenario catalog URLs** aligned to Chimera v1 routes across
  single-mode and mixed-mode scenario files.
- **Restart semantics** now inherit the originating execution's stored
  target URL rather than falling back to the current engine default,
  preserving idempotency across configuration drift.
- **Restart endpoint error contract** — the REST surface now returns
  `400` for invalid target URLs and `500` for unexpected failures with
  the underlying error message surfaced in the response body.
- **Scenario engine documentation** describes the per-run target URL
  resolution path and validation rules.

### Fixed

- **Build packaging** hardened so the scenario catalog ships correctly
  in the published `crucible` package.
- **Web client xterm fit** deferred until the terminal is mounted and
  sized, eliminating layout-thrash on initial render.
- **Web client persistence rehydration** deferred to avoid SSR / CSR
  state mismatch and the render loop it caused.
- **Firefox font rejection** on the web client home — swapped Recursive
  VF for `@fontsource-variable` to avoid OTS validation failures.
- **Execution definitions and summaries** restored on the web client
  after they were dropped during a refactor.
- **Chimera compatibility hints** now surface in scenario error paths
  so authors see which Chimera version mismatched.
- **WAF override scope** narrowed to authored checks only, preventing
  it from leaking into checks that didn't opt in.

### Package versions

| Package           | Previous | Current |
| ----------------- | -------- | ------- |
| `crucible`        | 0.2.4    | 0.3.0   |
| `@crucible/cli`   | 0.1.0    | 0.2.0   |
| `@crucible/client`| 0.1.0    | 0.1.1   |

[Unreleased]: https://github.com/NickCrew/Crucible/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/NickCrew/Crucible/compare/v0.3.0...v0.4.0
