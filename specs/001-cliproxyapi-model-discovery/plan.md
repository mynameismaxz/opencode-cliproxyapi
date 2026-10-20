# Implementation Plan: CLIProxyAPI Model Discovery Plugin

**Branch**: `001-cliproxyapi-model-discovery` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-cliproxyapi-model-discovery/spec.md`

## Summary

Build the npm package `@mynameismaxz/opencode-cliproxyapi`, an OpenCode plugin that at startup fetches
`GET {baseURL}/v1/models` from a CLIProxyAPI instance and registers every returned model
under a single `cliproxyapi` provider so they appear in the model picker with no manual
provider config. One package serves both host lines through `package.json` `exports`: the
root module is a classic v1 plugin function that mutates the config in the `config` hook;
the `./server` module is a v2 `Plugin.define` plugin that calls `ctx.provider.transform`.
A host-agnostic core (settings resolution, bounded discovery, model mapping, redacted
outcome messages) is shared by both adapters. Failures never propagate to the host.

## Technical Context

**Language/Version**: TypeScript 5.x, ESM output; runs on the host's Bun runtime
(OpenCode 1.x and 2.x embed Bun). Local toolchain: Bun 1.4.2, Node 24 (npm only).

**Primary Dependencies**: none at runtime. `@opencode/plugin@2.0.32` and
`@opencode-ai/plugin@1.19.3` are dev dependencies used for types only (`import type`); see
research R2 for why no runtime import is needed. Host
provides the OpenAI-compatible runtime (`@ai-sdk/openai-compatible` on v1,
`@opencode/ai/providers/openai-compatible` on v2).

**Storage**: N/A (in-memory only; FR-009 forbids writes).

**Testing**: `bun test` for unit and contract tests with an in-process mock CLIProxyAPI
replaying recorded fixtures; host integration tests spawn real `opencode-ai@1.19.3` and
`@opencode/cli@2.0.x` binaries headless against the mock.

**Target Platform**: OpenCode `>=1.19.3 <2` and `>=2.0.0 <3` on macOS/Linux/Windows
(wherever OpenCode runs). See research R1 for the floor decision.

**Project Type**: library (OpenCode plugin package).

**Performance Goals**: discovery adds ≤3 s to startup in the worst case (timeout) and
typically <200 ms against a local proxy; zero added latency on the chat path.

**Constraints**: ≤2 user settings; exactly one user-facing message per start; API key never
appears in output; outbound traffic only to the configured base URL; no disk writes;
plugin must never throw into the host; identical observable behaviour on both host lines.

**Scale/Scope**: one provider, typically 5–150 models per listing; ~6 source modules,
~3 test suites; single package published to npm.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Pre-research | Post-design |
|-----------|------|--------------|-------------|
| I. Zero Manual Configuration | ≤2 inputs, env + options, defaults documented, models discovered at runtime, no hard-coded list, registration via plugin API only | PASS | PASS — `contracts/plugin-settings.md`; no fallback list at all |
| II. Dual-Version Host Compatibility | adapter layer; core never branches on version; compatibility matrix maintained; CI runs both lines | PASS (design intent) | PASS — `src/core` vs `src/hosts/{v1,v2}`; structural host selection (R5); matrix in README + CI. Floor 1.19.3 per constitution 1.0.1 and spec FR-015 (R1) |
| III. Never Break the Host | no throw from hooks; bounded timeout; graceful degrade; own namespace only; no disk writes | PASS | PASS — `DiscoveryOutcome` design; `contracts/host-registration.md` shared guarantees |
| IV. Test-First with Contract Coverage | failing test first; offline unit tests; contract fixtures; host matrix in CI; every failure path tested | PASS | PASS — fixtures enumerated in `contracts/cliproxyapi-models-api.md`; quickstart §1–4 |
| V. Minimal Surface & Simplicity | justify every runtime dep; no vendor SDKs; options only on documented need; config schema is an API | PASS | PASS — zero runtime deps (R11); `timeoutMs` kept constant, not an option (R7) |
| Technical Constraints | TS/ESM on Bun; official plugin SDKs; OpenAI-compatible contract; secret redaction; network scope; semver + engines | PASS | PASS — `engines.opencode` set; redaction helper in core |

No violations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-cliproxyapi-model-discovery/
├── plan.md              # This file
├── research.md          # Phase 0 output (R1–R11)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── cliproxyapi-models-api.md   # upstream HTTP contract + fixture list
│   ├── plugin-settings.md          # user-facing settings and messages
│   └── host-registration.md        # package exports + adapter obligations
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
package.json                 # main + exports "." and "./server" -> dist/index.js; engines.opencode
tsconfig.json
src/
├── core/                    # host-agnostic; imports no OpenCode package
│   ├── settings.ts          # resolve env/options/defaults, normalise base URL, 3 s timeout
│   ├── discovery.ts         # fetch /models with AbortSignal timeout, parse, dedupe
│   ├── mapping.ts           # DiscoveredModel -> ModelSpec (defaults from R7/R8)
│   ├── outcome.ts           # DiscoveryOutcome union, FailureCause, message builder
│   └── redact.ts            # strip apiKey / Authorization values from any text
├── hosts/
│   ├── v1.ts                # Hooks.config mutation + bounded log/toast notification
│   └── v2.ts                # provider.transform callback
├── entry-v1.ts              # v1 server() function
├── entry-v2.ts              # v2 setup() function
└── index.ts                 # the only export: default { id, setup, server }

tests/
├── unit/                    # settings, mapping, outcome, redact, adapters, entry shape
├── contract/                # discovery against mock proxy + fixtures
├── integration/             # shared suite run against host v1 (1.19.3) and v2 (2.0.32)
├── mock/                    # mock CLIProxyAPI server (Bun.serve), fixture replay
└── fixtures/cliproxyapi/    # recorded listings and error bodies (see contract)

scripts/install-hosts.sh     # installs both hosts into .hosts/
docs/compatibility.md        # host compatibility matrix and observed loader behaviour
.github/workflows/ci.yml     # unit job + integration matrix (v1, v2)
```

**Structure Decision**: Single library package. `src/core` is the only place with
behaviour; `src/hosts/*` are thin adapters. One default-exported object serves both hosts
(research R2, revised after host spikes). Tests mirror the three layers required by
Principle IV.

## Design Notes

- **Host selection is structural** (R5): v1 hosts call the default export's `server()`;
  v2 hosts call its `setup()`. No version parsing.
- **Entry-module discipline**: `src/index.ts` has exactly one export, the default object.
  Helpers are never re-exported from it.
- **Idempotency** (FR-017): v1 assigns `cfg.provider.cliproxyapi` (not append); v2 checks
  `editor.get("cliproxyapi")` before `add`. Double invocation yields one provider.
- **User-owned provider merge** (FR-008): if `cliproxyapi` already exists in config, user
  model entries and options win; discovered models fill gaps only.
- **Messages**: one `DiscoveryOutcome` -> one message; v1 uses `client.app.log` plus a toast,
  each bounded to 1 s; v2 uses `console.error` (visible with `--print-logs` only; R13).
- **Verification items resolved during implementation**: slash ids route verbatim on both
  hosts (R8); the v1 toast renders in the TUI (R13); `Provider.Info.empty` and
  `Model.Info.default` shapes confirmed at runtime (R4); v2 activation window (R12).
  Still unobserved: whether 2.x enforces `engines.opencode`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

None.
