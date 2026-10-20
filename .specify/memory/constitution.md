# OpenCode CLIProxyAPI Plugin Constitution

## Core Principles

### I. Zero Manual Configuration

The plugin exists to remove hand-written provider and model configuration from the user's
OpenCode setup. The following rules are binding:

- A user MUST be able to use CLIProxyAPI-backed models after supplying at most two inputs:
  the CLIProxyAPI base URL and an API key. Both MUST be accepted from environment variables
  and from the plugin's own config block; environment variables take precedence.
- Sensible defaults MUST be applied when inputs are absent (e.g. a local CLIProxyAPI base URL
  on the default port). Defaults MUST be documented in the README.
- The list of available models MUST be discovered at runtime from CLIProxyAPI's model
  listing endpoint. Hard-coded model lists in the plugin source are prohibited, except as a
  clearly labelled last-resort fallback that is only used when discovery fails.
- The plugin MUST register discovered models with OpenCode through the plugin API's
  configuration hooks. Users MUST NOT be required to edit `opencode.json` provider or model
  entries to add, remove, or rename models exposed by the proxy.
- Any user-visible setting beyond base URL and API key MUST be optional and MUST have a
  default that works without intervention.

**Rationale**: The sole value proposition of this plugin is eliminating manual configuration.
Any requirement that forces users back into manual config is a defect, not a feature gap.

### II. Dual-Version Host Compatibility (NON-NEGOTIABLE)

The plugin MUST work on OpenCode 1.19.3 and later 1.x releases, and on OpenCode 2.x, from
a single published package.

- Version-specific behaviour MUST be isolated behind a host adapter layer. Core discovery and
  model-mapping logic MUST NOT branch on the host version.
- The adapter MUST detect the host version (or capability) at load time and select the
  matching code path. Detection MUST prefer feature detection over version-string parsing
  where the plugin API allows it.
- A compatibility matrix listing every supported OpenCode minor version and its test status
  MUST be maintained in the repository and updated in the same change that adds or drops
  support.
- Dropping support for any OpenCode version is a breaking change and requires a MAJOR
  version bump of the plugin.
- A change that passes on one supported host line but fails on the other MUST NOT be merged.

**Rationale**: Users are split across OpenCode major versions. A plugin that silently works
on one and breaks on the other erodes trust faster than having no plugin at all.

### III. Never Break the Host

The plugin runs inside the user's coding agent. Failures in the plugin MUST never degrade
OpenCode itself.

- The plugin MUST NOT throw out of any plugin hook. All errors MUST be caught, logged with
  enough context to diagnose, and converted into a safe no-op or degraded state.
- Network calls to CLIProxyAPI MUST have an explicit, bounded timeout. Startup MUST NOT be
  blocked indefinitely waiting on the proxy.
- When CLIProxyAPI is unreachable, returns an error, or returns an unparseable response, the
  plugin MUST degrade gracefully: register nothing (or a cached last-known-good list), emit a
  single clear warning, and let OpenCode continue normally.
- The plugin MUST NOT modify, remove, or override providers and models the user configured
  themselves. It MAY only add entries under its own provider namespace.
- The plugin MUST NOT write to the user's config files on disk. All registration happens
  in-memory through the plugin API.

**Rationale**: A plugin that can crash or hang the host is worse than manual configuration.
Graceful degradation keeps the user productive even when the proxy is down.

### IV. Test-First with Contract Coverage

Tests are written before implementation and define the contract with both the host and the
proxy.

- Every feature and bug fix MUST start with a failing test. Red → Green → Refactor is the
  required cycle.
- Model discovery and model mapping MUST have unit tests that run without network access,
  using recorded or synthetic CLIProxyAPI responses.
- Contract tests MUST cover the CLIProxyAPI model listing response shape. Any change in the
  expected shape MUST be reflected by updating the recorded fixture, never by loosening the
  parser silently.
- Host-integration tests MUST exercise the plugin's load path on every supported OpenCode
  major line (1.x and 2.x). CI MUST run this matrix on every pull request.
- Error paths from Principle III (timeout, unreachable proxy, malformed response, missing
  API key) MUST each have a dedicated test proving the host is not broken.

**Rationale**: The plugin sits between two independently evolving systems. Contract tests
are the only reliable early warning when either side changes.

### V. Minimal Surface & Simplicity

The plugin MUST stay small, understandable, and easy to audit.

- Runtime dependencies MUST be kept to the minimum needed. Adding a runtime dependency
  requires written justification in the pull request explaining why the standard library or
  the OpenCode plugin SDK is insufficient.
- The plugin MUST NOT bundle provider SDKs or model-vendor clients. It only discovers models
  and points OpenCode at CLIProxyAPI's OpenAI-compatible endpoint.
- Configuration options MUST be added only when a concrete user need is documented. YAGNI
  applies; speculative options are rejected.
- The public config schema is an API. Removing or renaming an option is a breaking change.
- Code MUST favour clear, linear logic over abstraction. An abstraction is justified only
  when it is used by at least two concrete call sites.

**Rationale**: Users install this plugin into a tool that already has access to their
codebase and credentials. Small, legible code is a security property, not just a style
preference.

## Technical Constraints

- **Language & runtime**: TypeScript, published as ESM. The plugin MUST load under the
  JavaScript runtime OpenCode ships with (Bun) and MUST NOT rely on Node-only or Bun-only
  APIs unless guarded.
- **Plugin API**: The plugin MUST be authored against the official OpenCode plugin SDK
  (`@opencode-ai/plugin`) and installed through OpenCode's standard plugin mechanisms
  (package reference in the OpenCode config or a local plugin directory). No patching of
  OpenCode internals.
- **Upstream contract**: CLIProxyAPI's OpenAI-compatible HTTP API is the integration
  contract. The plugin MUST use the model listing endpoint for discovery and MUST register
  models so that OpenCode sends requests to CLIProxyAPI's OpenAI-compatible completion
  endpoints.
- **Secrets**: The API key MUST never be logged, written to disk by the plugin, or included
  in error messages. Logs MUST redact authorization headers.
- **Network scope**: The plugin MUST only make outbound requests to the configured
  CLIProxyAPI base URL. No telemetry, update checks, or third-party calls.
- **Caching**: If a cache of the discovered model list is kept, it MUST be in-memory or in
  the plugin's own namespaced location, MUST be invalidated on host restart or explicit
  refresh, and MUST never be the primary source when the proxy is reachable.
- **Versioning**: The plugin follows semantic versioning. The package's peer-dependency or
  engines metadata MUST declare the supported OpenCode range matching the compatibility
  matrix.

## Development Workflow & Quality Gates

- **Spec-driven flow**: Features follow the Spec Kit lifecycle: specify → clarify → plan →
  tasks → implement. A feature MUST NOT begin implementation without an approved spec and
  plan.
- **Pull request gates** (all required to merge):
  1. Unit, contract, and host-integration tests pass on both OpenCode 1.x and 2.x.
  2. Type check and lint pass with zero errors.
  3. No new runtime dependency without justification (Principle V).
  4. Compatibility matrix and README updated when behaviour or supported versions change.
  5. Reviewer confirms the change complies with Principles I–V and lists any justified
     exceptions in the PR description.
- **Manual verification**: Before a release, the plugin MUST be loaded manually in a real
  OpenCode 1.19.3+ install and a real OpenCode 2.x install against a running CLIProxyAPI, and
  at least one discovered model MUST successfully complete a chat turn on each.
- **Release**: Every release MUST include a changelog entry. Breaking changes MUST include
  a migration note.

## Governance

- This constitution supersedes any other project practice, README guidance, or convention.
  Where a conflict exists, the constitution wins until amended.
- **Amendment procedure**: Propose the change in a pull request that modifies this file,
  states the rationale, and identifies affected specs, plans, or templates. Amendments are
  adopted on merge. Amendments that weaken Principle II or Principle III MUST include a
  written risk assessment and a migration plan for existing users.
- **Versioning policy**: The constitution uses semantic versioning.
  - MAJOR: a principle is removed or redefined in a backward-incompatible way.
  - MINOR: a principle or section is added, or guidance is materially expanded.
  - PATCH: clarifications, wording, and non-semantic refinements.
- **Compliance review**: Every pull request review MUST include an explicit check against
  the Core Principles. Complexity or deviations MUST be justified in writing in the PR and,
  if they persist, promoted into an amendment rather than left as unspoken exceptions.
- **Runtime guidance**: Agent-facing development guidance (for example `CLAUDE.md` or
  `AGENTS.md`) MUST remain consistent with this constitution and MUST reference it.

**Version**: 1.0.1 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
