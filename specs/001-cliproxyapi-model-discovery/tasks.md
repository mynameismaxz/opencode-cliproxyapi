---

description: "Task list for CLIProxyAPI Model Discovery Plugin"
---

# Tasks: CLIProxyAPI Model Discovery Plugin

**Input**: Design documents from `/specs/001-cliproxyapi-model-discovery/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. Constitution Principle IV (Test-First with Contract Coverage) requires a
failing test before every feature, offline unit tests, contract fixtures, and host
integration on both OpenCode lines. Write each test, confirm it fails, then implement.

**Organization**: Tasks are grouped by user story so each story is an independently testable
increment. Hosts under test: `opencode-ai@1.19.3` (v1) and `@opencode/cli@2.0.32` (v2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single library package at repository root: `src/`, `tests/`, `docs/`, `scripts/`. Layout
per plan.md: `src/core` (host-agnostic), `src/hosts` (adapters), `src/index.ts` (v1 entry),
`src/server.ts` (v2 entry), `tests/{unit,contract,integration,mock,fixtures}`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package skeleton that both host lines can load

- [X] T001 Create `package.json` at repo root: `name` `opencode-cliproxyapi`, `version` `0.1.0`, `type` `module`, `files` `["dist"]`, `exports` `{".": {"import":"./dist/index.js","types":"./dist/index.d.ts"}, "./server": {"import":"./dist/server.js","types":"./dist/server.d.ts"}}`, `engines.opencode` `">=1.19.3"`, `peerDependencies` `{"@opencode/plugin": ">=2.0.0 <3"}` with `peerDependenciesMeta` optional, `devDependencies` `@opencode-ai/plugin@1.19.3`, `@opencode/plugin@2.0.32`, `typescript@^5`, `bun-types`, and scripts `build` (`tsc -p tsconfig.json`), `test` (`bun test tests/unit tests/contract`), `test:integration` (`bun test tests/integration`), `mock-proxy` (`bun tests/mock/cli.ts`), `it:v1`, `it:v2` (see T018)
- [X] T002 Create `tsconfig.json`: `target` ES2022, `module` ESNext, `moduleResolution` bundler, `strict` true, `declaration` true, `outDir` `dist`, `rootDir` `src`, `types` `["bun-types"]`, `include` `["src"]`
- [X] T003 [P] Create directory skeleton with `.gitkeep` files: `src/core/`, `src/hosts/`, `tests/unit/`, `tests/contract/`, `tests/integration/`, `tests/mock/`, `tests/fixtures/cliproxyapi/`, `docs/`, `scripts/`
- [X] T004 [P] Create `.gitignore` with `node_modules/`, `dist/`, `.hosts/`, `.tmp/`, `*.tgz`
- [X] T005 Run `bun install` and confirm `import type { Plugin } from "@opencode-ai/plugin"` and `import { Plugin } from "@opencode/plugin"` both type-check in a throwaway `src/_probe.ts`, then delete the probe

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Host-agnostic core and test infrastructure every story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Fixtures and mock proxy

- [X] T006 [P] Create recorded fixtures per `contracts/cliproxyapi-models-api.md` in `tests/fixtures/cliproxyapi/`: `models.json` (ids `gemini-2.5-pro`, `claude-sonnet-4-6`, `gpt-5.5`, `kimi-k2.5`, `grok-4.7` with `object`, `created`, `owned_by`), `models-empty.json`, `models-slash-ids.json` (adds `devin/swe-2`, `test/gpt-5-codex`), `models-duplicates.json` (`gpt-5.5` twice), `models-bad-entries.json` (entries missing `id`, numeric `id`, mixed with valid), `error-401-missing.json` (`{"error":"Missing API key"}`), `error-401-invalid.json` (`{"error":"Invalid API key"}`), `malformed.txt` (`not json`)
- [X] T007 [P] Implement mock CLIProxyAPI in `tests/mock/cliproxyapi.ts` exporting `startMockProxy({ port, apiKey?, fixture, delayMs?, status? })` using `Bun.serve`: `GET /healthz` → `{"status":"ok"}`; `GET /v1/models` → if `apiKey` set and `Authorization` is not `Bearer <apiKey>` respond 401 with the missing/invalid fixture bodies, else respond with the fixture file (raw bytes, so `malformed.txt` is served verbatim) after `delayMs`; `POST /v1/chat/completions` → record `{ model, headers, stream }` into an in-memory `requests` array and reply with a minimal OpenAI chat completion (`choices[0].message.content = "ok"`, and SSE chunks when `stream: true`); return `{ url, requests, stop() }`
- [X] T008 [P] Implement CLI wrapper `tests/mock/cli.ts` parsing `--port`, `--api-key`, `--fixture`, `--delay-ms` and calling `startMockProxy`, printing the URL and logging each chat request line

### Core: redaction and outcome

- [X] T009 [P] Write unit test `tests/unit/redact.test.ts`: `redact(text, apiKey)` removes every occurrence of the key, replaces `Authorization: Bearer <anything>` values with `<redacted>`, is a no-op when `apiKey` is undefined, and never throws on non-string input
- [X] T010 Implement `src/core/redact.ts` to make T009 pass
- [X] T011 [P] Write unit test `tests/unit/outcome.test.ts` covering the `DiscoveryOutcome` union from `data-model.md` (`success{models}`, `empty`, `failure{cause, detail}`), every `FailureCause` value (`invalid-settings`, `unreachable`, `timeout`, `unauthorized`, `http-error`, `malformed`, `unsupported-host`), and `messageFor(outcome, settings)` returning exactly the strings in the "What the user sees" table of `contracts/plugin-settings.md`, with `success` returning `undefined`, and the API key never appearing in any message
- [X] T012 Implement `src/core/outcome.ts` (types, `FailureCause`, `messageFor`, `levelFor` → `"info"` for `empty`, `"warn"` for failures) to make T011 pass; call `redact` on `detail`

### Core: settings

- [X] T013 [P] Write unit test `tests/unit/settings.test.ts` for `resolveSettings(env, options)`: precedence `CLIPROXYAPI_BASE_URL` → `options.baseURL` → `http://localhost:8317`; `CLIPROXYAPI_API_KEY` → `options.apiKey` → `undefined`; `""` treated as unset; normalisation of `http://h:8317`, `http://h:8317/`, `http://h:8317/v1`, `http://h:8317/v1/` all to `http://h:8317/v1`; `https` preserved; non-URL and non-http scheme → `{ ok: false, cause: "invalid-settings" }`; `timeoutMs` constant `5000`; derived `modelsURL = baseURL + "/models"`
- [X] T014 Implement `src/core/settings.ts` to make T013 pass (no OpenCode imports)

### Core: discovery

- [X] T015 [P] Write contract test `tests/contract/discovery.test.ts` using `startMockProxy` and each fixture: `models.json` → `success` with 5 ids in order; `models-empty.json` → `empty`; `models-duplicates.json` → one `gpt-5.5`; `models-bad-entries.json` → only valid ids, no throw; `models-slash-ids.json` → ids preserved verbatim; 401 missing/invalid → `failure(unauthorized)`; `status: 500` → `failure(http-error)`; `malformed.txt` → `failure(malformed)`; `delayMs: 6000` with `timeoutMs: 100` → `failure(timeout)`; closed port → `failure(unreachable)`; with `apiKey` the mock sees `Authorization: Bearer <key>`; without, no `Authorization` header; request never carries `Anthropic-Version` or `client_version`
- [X] T016 Implement `src/core/discovery.ts` `discoverModels(settings): Promise<DiscoveryOutcome>` using `fetch` with `AbortSignal.timeout(settings.timeoutMs)`, `Accept: application/json`, optional bearer header, parsing only `data[].id` (non-empty string) and `data[].owned_by`, dedupe first-wins, mapping every error class to its `FailureCause`, never throwing

### Integration harness

- [X] T017 Create `scripts/install-hosts.sh` installing `opencode-ai@1.19.3` into `.hosts/v1` and `@opencode/cli@2.0.32` into `.hosts/v2` via `npm i -g --prefix`, skipping when the binary already exists, and printing both resolved binary paths
- [X] T018 Implement `tests/integration/harness.ts` exporting `withHost(line: "v1" | "v2", opts: { pluginOptions?, env?, extraProviders? }, fn)`: creates a temp project under `.tmp/<random>/` with `opencode.json` referencing the repo's built package by absolute path (`"plugin": [[path, options]]` for v1, `"plugins": [{ "package": path, "options": options }]` for v2), sets `XDG_CONFIG_HOME` to an empty temp dir so the user's real config is never read, runs the host binary headless to (a) list models and (b) run one prompt against a given `provider/model`, captures stdout/stderr and wall-clock time, and cleans up; document in a header comment which host CLI subcommands were verified to list models and run a prompt on each line (spike this first: candidates are `opencode models`, `opencode run -m <provider/model> "<prompt>"`, and `opencode serve` + `GET /provider`)
- [X] T019 Add `it:v1` and `it:v2` scripts to `package.json` that run `bun run build` then `bun test tests/integration --filter v1|v2`, and make `tests/integration/*.test.ts` skip with a clear message when `.hosts/<line>` is missing

**Checkpoint**: `bun test` green for unit + contract; harness can start both hosts against the mock

---

## Phase 3: User Story 1 - Discover and Select a Proxied Model (Priority: P1) 🎯 MVP

**Goal**: With a reachable CLIProxyAPI and zero configuration, every proxied model appears
under provider `cliproxyapi` in both hosts and a chat turn completes through the proxy.

**Independent Test**: `bun run mock-proxy --fixture models.json`, then `bun run it:v1` and
`bun run it:v2`: both list exactly the 5 fixture ids under `cliproxyapi`, and a prompt to
`cliproxyapi/gemini-2.5-pro` produces a `POST /v1/chat/completions` on the mock with
`model: "gemini-2.5-pro"` and no `Authorization` header.

### Tests for User Story 1

- [X] T020 [P] [US1] Write unit test `tests/unit/mapping.test.ts`: `toModelSpecs(discovered)` yields `apiID = id`, `hostKey = id`, `displayName = id`, `contextLimit = 200000`, `outputLimit = 32000`, `toolCall = true`; order preserved; `sanitizeHostKey` behaviour for ids containing `/` is covered by a test that is initially marked `todo` until T030 decides it
- [X] T021 [P] [US1] Write unit test `tests/unit/hosts-v1.test.ts`: `applyV1(cfg, outcome, settings)` on `success` sets `cfg.provider.cliproxyapi` to `{ npm: "@ai-sdk/openai-compatible", name: "CLIProxyAPI", options: { baseURL, apiKey? }, models: { [hostKey]: { name, limit: { context: 200000, output: 32000 }, tool_call: true } } }`, omits `apiKey` when undefined, leaves other `cfg.provider.*` keys untouched, calling twice yields an identical single entry (FR-017), and on `empty`/`failure` leaves `cfg` deep-equal to its input
- [X] T022 [P] [US1] Write unit test `tests/unit/hosts-v2.test.ts` with a fake `ProviderEditor` (`list/get/add/update/remove/models.set`): `buildV2Transform(outcome, settings)` on `success` calls `editor.add` once with `info` `{ id: "cliproxyapi", name: "CLIProxyAPI", activation: "enabled", package: "@opencode/ai/providers/openai-compatible", settings: { baseURL, apiKey? } }` and one `Model.Info` per spec with `modelID = apiID`, `id = hostKey`, `name`, `limit`; when `editor.get("cliproxyapi")` already exists it calls `editor.models.set` instead of `add`; running the callback twice does not duplicate; on `empty`/`failure` returns `undefined` (no transform)
- [X] T023 [P] [US1] Write integration test `tests/integration/host-v1.test.ts` "zero-config happy path": mock on 8317 with `models.json`; `withHost("v1", {})` lists all 5 ids under `cliproxyapi` with no extras/duplicates; prompt to `cliproxyapi/gemini-2.5-pro` completes; mock recorded one chat request with `model === "gemini-2.5-pro"` and no `Authorization` header
- [X] T024 [P] [US1] Write integration test `tests/integration/host-v2.test.ts` with the same assertions as T023 using `withHost("v2", {})`

### Implementation for User Story 1

- [X] T025 [US1] Implement `src/core/mapping.ts` (`ModelSpec`, `toModelSpecs`, `sanitizeHostKey` stub returning the id unchanged) to make T020 pass
- [X] T026 [US1] Implement `src/hosts/v1.ts` exporting `applyV1(cfg, outcome, settings)` and `notifyV1(client, outcome, settings)` (the latter wired in US3) to make T021 pass; import only `import type` from `@opencode-ai/plugin`
- [X] T027 [US1] Implement `src/hosts/v2.ts` exporting `buildV2Transform(outcome, settings)` to make T022 pass; before coding, open `node_modules/@opencode/plugin/dist/promise/index.d.ts` and `node_modules/@opencode/schema/dist/{provider,model}.d.ts` and record the exact helper names (`Provider.Info.empty`, `Model.Info.default`, `Provider.ID.make`, `Model.ID.make` or their real equivalents) in a comment at the top of the file (research R4 open item)
- [X] T028 [US1] Implement `src/index.ts` (v1 entry) exporting ONLY `export const CLIProxyAPIPlugin: Plugin = async (input, options) => ({ config: async (cfg) => { ... } })` that resolves settings from `process.env` and `options`, awaits `discoverModels`, calls `applyV1`, and wraps everything in try/catch so nothing escapes; no other exports in this module
- [X] T029 [US1] Implement `src/server.ts` (v2 entry) `export default Plugin.define({ id: "cliproxyapi", setup })` where `setup(ctx)` resolves settings from `process.env` and `ctx.options`, awaits `discoverModels`, and if `buildV2Transform` returns a callback runs `await ctx.provider.transform(callback)`; wrap in try/catch; return nothing
- [X] T030 [US1] Spike + decide model ids containing `/` on v1 (research R8): run `withHost("v1")` with `models-slash-ids.json` and attempt a prompt to `cliproxyapi/devin/swe-2`; if routed correctly keep `sanitizeHostKey` as identity; if not, implement sanitisation in `src/core/mapping.ts` (e.g. replace `/` with `__`) with a `hostKey → apiID` map used by both adapters so the request still carries the original id (FR-003), and un-`todo` the T020 test; record the finding in `docs/compatibility.md`
- [X] T031 [US1] Build with `bun run build` and run T023 and T024; fix adapter/entry issues until both hosts list and chat; if a host does not load the `./server` subpath or treats the root export unexpectedly, record the observed loader behaviour in `docs/compatibility.md` and adjust `package.json` `exports` per research R2 alternatives
- [X] T032 [US1] Add integration test case "double load" to `tests/integration/host-v1.test.ts` and `host-v2.test.ts`: reference the plugin twice in the host config (once by path, once via a symlinked copy) and assert the 5 ids appear exactly once (FR-017)

**Checkpoint**: US1 is the MVP. Both hosts show proxied models with zero config and complete a chat turn.

---

## Phase 4: User Story 2 - Minimal Connection Setup (Priority: P2)

**Goal**: Non-default host and authenticated proxy work by setting at most `baseURL` and
`apiKey`, via env vars or the plugin options block, env winning.

**Independent Test**: mock on 9090 with `--api-key test-key`; with
`CLIPROXYAPI_BASE_URL=http://localhost:9090 CLIPROXYAPI_API_KEY=test-key` both hosts list
models and the mock sees `Authorization: Bearer test-key`; same result with the values in
the options block only; with env and options disagreeing the env value is used; with the
key absent exactly one warning names the setting, no proxied models, host unaffected, and
`test-key` appears nowhere in output.

### Tests for User Story 2

- [X] T033 [P] [US2] Add integration cases to `tests/integration/host-v1.test.ts`: (a) env-only baseURL+apiKey on port 9090 → models listed, bearer seen; (b) options-only `{ baseURL, apiKey }` → same; (c) env `baseURL` on 9090 and options `baseURL` on a dead port → env wins, models listed; (d) key required but absent → zero `cliproxyapi` models, stdout+stderr contain exactly one line matching `rejected the API key` naming `CLIPROXYAPI_API_KEY`, string `test-key` absent from all captured output
- [X] T034 [P] [US2] Add the same four cases to `tests/integration/host-v2.test.ts` using `plugins: [{ package, options }]`

### Implementation for User Story 2

- [X] T035 [US2] Verify `src/index.ts` passes the v1 `options` tuple argument and `src/server.ts` passes `ctx.options` into `resolveSettings`; add a unit test in `tests/unit/settings.test.ts` that an `options` object with unknown keys is ignored without error
- [X] T036 [US2] Run T033/T034 against the built package and fix until green; confirm the v1 host honours `{env:CLIPROXYAPI_API_KEY}` substitution inside the options block and note the result in `docs/compatibility.md`
- [X] T037 [US2] Write the "Settings" section of `README.md` from `contracts/plugin-settings.md`: the two settings, env var names, option keys, defaults, accepted base URL forms, and the v1 and v2 config snippets (zero-config and with options)

**Checkpoint**: US1 and US2 both pass on both hosts.

---

## Phase 5: User Story 3 - Graceful Behaviour When the Proxy Is Unavailable (Priority: P3)

**Goal**: With CLIProxyAPI down, slow, empty, or misbehaving, OpenCode starts promptly,
user-configured providers keep working, and exactly one message explains the cause.

**Independent Test**: with nothing on 8317, `time bun run it:v1` / `it:v2` finish within
the host's normal startup plus ≤5 s, show exactly one warning, register zero `cliproxyapi`
models, and a prompt to a user-configured provider still succeeds. Repeat with
`malformed.txt` and `models-empty.json`.

### Tests for User Story 3

- [X] T038 [P] [US3] Add integration cases to `tests/integration/host-v1.test.ts`, each also configuring a user-owned provider `usermock` (second mock on another port, declared in `opencode.json` `provider.usermock` with `npm: "@ai-sdk/openai-compatible"`) and asserting a prompt to `usermock/<model>` still succeeds: (a) nothing listening on 8317 → wall-clock ≤ baseline + 5.5 s, exactly one `could not be reached` message, zero `cliproxyapi` models; (b) `malformed.txt` → one `unexpected response` message; (c) `models-empty.json` → one `reports no models` message at info level; (d) `--delay-ms 7000` → one message within ≤ 5.5 s of the baseline; (e) invalid `CLIPROXYAPI_BASE_URL=notaurl` → one `not a valid URL` message
- [X] T039 [P] [US3] Add the same five cases to `tests/integration/host-v2.test.ts` (user-owned provider declared under v2's `providers` key with `package: "@opencode/ai/providers/openai-compatible"`)
- [X] T040 [P] [US3] Add unit tests to `tests/unit/hosts-v1.test.ts`: when `cfg.provider.cliproxyapi` already exists with a user model `custom-x` and `options.baseURL`, `applyV1` keeps the user's `options` and `custom-x` and adds discovered models not already present (FR-008 merge rule); and `applyV1` with `input.serverUrl === undefined` or `options === undefined` produces an additional `unsupported-host` outcome while still applying env settings
- [X] T041 [P] [US3] Add unit tests to `tests/unit/hosts-v2.test.ts`: when the fake editor already has `cliproxyapi` with a user model, the transform merges via `editor.models.set` preserving the user model and `editor.update` is not called on user `settings`

### Implementation for User Story 3

- [X] T042 [US3] Implement `notifyV1` in `src/hosts/v1.ts`: `await client.app.log({ body: { service: "cliproxyapi", level, message } })` (guaranteed channel) then best-effort `client.tui.showToast({ body: { title: "CLIProxyAPI", message, variant } })` wrapped in try/catch; wire it into `src/index.ts` so exactly one call happens per start; variant `info` for `empty`, `warning` otherwise
- [X] T043 [US3] Implement the v2 message channel in `src/server.ts`: `console.info`/`console.error` with prefix `[cliproxyapi]` using `messageFor`; exactly one call per start
- [X] T044 [US3] Implement the FR-008 merge rule in `src/hosts/v1.ts` and `src/hosts/v2.ts` to make T040/T041 pass (user entries win; discovered models fill gaps; never touch other provider ids)
- [X] T045 [US3] Implement the `unsupported-host` path in `src/hosts/v1.ts`/`src/index.ts` to make the T040 case pass (env-only settings, one extra message as specified in `contracts/plugin-settings.md`)
- [X] T046 [US3] Spike (research R9): verify whether a toast sent during the v1 `config` hook reaches the TUI by running `opencode` interactively for 10 s in a pty from `tests/integration/host-v1.test.ts` (or manually) with the proxy down; record the observed behaviour in `docs/compatibility.md`; the log line remains the guaranteed channel either way
- [X] T047 [US3] Spike (research R9): determine whether a v2 `./tui` entrypoint can learn the server-side outcome (inspect `node_modules/@opencode/plugin/dist/promise/{storage,rpc,event}.d.ts` and `dist/tui/*.d.ts`); if a documented channel exists and the implementation is ≤ ~60 lines, implement `src/tui.ts` showing the single message via `context.ui.toast.show` and add `"./tui"` to `package.json` `exports`; otherwise write the finding and the console-only decision into `docs/compatibility.md`
- [X] T048 [US3] Run `tests/integration/host-v1.test.ts` and `tests/integration/host-v2.test.ts` (T038/T039 cases) against the built package and fix `src/hosts/*.ts`, `src/index.ts`, `src/server.ts` until green, including the startup-time bound

**Checkpoint**: All three stories pass on both hosts; failure paths never affect user providers.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Release readiness required by the constitution

- [X] T049 [P] Write `docs/compatibility.md`: matrix with rows `opencode-ai 1.19.3` and `@opencode/cli 2.0.32`, columns for US1/US2/US3 status, loader behaviour notes (T031), slash-id finding (T030), `{env:VAR}` finding (T036), toast findings (T046/T047), and the `engines.opencode` behaviour observed on 2.x
- [X] T050 [P] Complete `README.md`: what the plugin does, install for v1 (`"plugin": ["opencode-cliproxyapi"]`) and v2 (`"plugins": ["opencode-cliproxyapi"]` or `opencode plugin add opencode-cliproxyapi`), the Settings section from T037, the messages table, default model limits (200000/32000) and why, supported OpenCode range, link to `docs/compatibility.md`; verify it can be read in under 5 minutes and names only two settings (SC-006)
- [X] T051 [P] Create `CHANGELOG.md` with a `0.1.0` entry listing the three stories and the supported host range
- [X] T052 Create `.github/workflows/ci.yml`: on pull request run `bun install`, `bun run build`, `bun test`, then `scripts/install-hosts.sh` and `bun run it:v1` and `bun run it:v2` as a matrix with both jobs required to pass (constitution Principle II and PR gate 1)
- [X] T053 Add a secret-leak guard to `tests/integration/harness.ts`: after every host run, assert the configured API key (when set) does not appear in stdout, stderr, or the temp project directory, and that no file under the temp `XDG_CONFIG_HOME` or project was modified by the plugin (FR-009, SC-007)
- [X] T054 Run `npm pack --dry-run` and verify the tarball contains `dist/index.js`, `dist/server.js` (and `dist/tui.js` if T047 shipped), their `.d.ts` files, and nothing from `tests/`; verify with `node -e "import.meta.resolve"` or `bun -e` that `opencode-cliproxyapi/server` resolves from a temp consumer
- [X] T055 Execute `quickstart.md` sections 1–4 end to end on the local machine and fix any drift between the quickstart and the actual scripts
- [ ] T056 Manual release verification (constitution gate): point real `opencode-ai@1.19.3` and the installed `@opencode/cli` 2.0.32 at a real CLIProxyAPI with at least one signed-in account, open the model picker, complete one chat turn on each, confirm no file under `~/.config/opencode` changed; record the date and versions in `docs/compatibility.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Phase 1; blocks all stories. Internal order:
  fixtures/mock (T006–T008) in parallel with core tests (T009, T011, T013, T015); each
  core implementation follows its own test; T015/T016 need T007; harness (T017–T019)
  needs T001
- **US1 (Phase 3)**: depends on Phase 2. Internal order: T020–T024 tests first (parallel) →
  T025 → T026/T027 (parallel) → T028/T029 (parallel) → T030 → T031 → T032
- **US2 (Phase 4)**: depends on Phase 2 and on T028/T029 from US1 (entry modules must exist);
  T033/T034 first → T035 → T036 → T037
- **US3 (Phase 5)**: depends on Phase 2 and on T026–T029 from US1; T038–T041 first →
  T042–T045 (T042/T043 parallel, T044/T045 parallel) → T046/T047 (parallel spikes) → T048
- **Polish (Phase 6)**: depends on all stories; T049–T051 parallel; T052 after T019; T053
  before T055; T056 last

### User Story Dependencies

- **US1 (P1)**: standalone after Foundational
- **US2 (P2)**: needs the US1 entry modules (T028, T029) because settings flow through them;
  otherwise independent and independently testable
- **US3 (P3)**: needs the US1 adapters and entries; independently testable via its own
  integration cases

### Within Each User Story

- Tests are written first and must fail before implementation
- Core before adapters, adapters before entry modules, entry modules before host integration
- Spikes (T030, T046, T047) record findings in `docs/compatibility.md`

### Parallel Opportunities

- Phase 1: T003, T004 together
- Phase 2: T006, T007, T008, T009, T011, T013, T015 together; T017 alongside
- US1: T020–T024 together; T026 with T027; T028 with T029
- US2: T033 with T034
- US3: T038–T041 together; T042 with T043; T044 with T045; T046 with T047
- Polish: T049, T050, T051 together

---

## Parallel Example: User Story 1

```bash
# Tests first, all in parallel:
Task: "Unit test mapping in tests/unit/mapping.test.ts"
Task: "Unit test v1 adapter in tests/unit/hosts-v1.test.ts"
Task: "Unit test v2 adapter in tests/unit/hosts-v2.test.ts"
Task: "Integration happy path v1 in tests/integration/host-v1.test.ts"
Task: "Integration happy path v2 in tests/integration/host-v2.test.ts"

# Then adapters in parallel:
Task: "Implement src/hosts/v1.ts"
Task: "Implement src/hosts/v2.ts"

# Then entries in parallel:
Task: "Implement src/index.ts (v1 entry)"
Task: "Implement src/server.ts (v2 entry)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational (core + mock + harness)
2. Phase 3 US1: both hosts list proxied models with zero config and complete a chat turn
3. STOP and validate with `bun run it:v1 && bun run it:v2`
4. Publishable as `0.1.0-alpha` for local-proxy users

### Incremental Delivery

1. US1 → MVP (zero-config local proxy)
2. US2 → remote/authenticated proxies via two settings
3. US3 → hardened failure behaviour, user-visible messages, merge rule
4. Polish → docs, CI matrix, release gate

### Parallel Team Strategy

After Foundational: one developer on US1 adapters/entries; once T028/T029 land, a second
developer runs US2 integration while a third starts US3 unit tests and notification
channels. Spikes T030/T046/T047 are good standalone assignments.

---

## Notes

- `src/index.ts` must never export anything but `CLIProxyAPIPlugin` (v1 loads every exported function as a plugin)
- Core modules under `src/core` must not import any OpenCode package
- Every message goes through `messageFor` + `redact`; never format the API key into text
- Integration tests isolate `XDG_CONFIG_HOME` so the developer's real OpenCode config is never read or written
- Commit after each task or logical group; stop at each checkpoint to validate the story

---

## Implementation Notes (2026-10-20)

Recorded where the build differs from the task text above. Details in `research.md` R2, R12–R14
and `docs/compatibility.md`.

- **T001, T026–T029**: entry layout changed after host spikes. There is one entry module,
  `src/index.ts`, with a single default export `{ id, setup, server }`. Its parts live in
  `src/entry-v1.ts` (`server`) and `src/entry-v2.ts` (`setup`). `src/server.ts` was removed and
  `package.json` maps both `"."` and `"./server"` to `dist/index.js`. No runtime dependency on
  either host SDK, so the planned optional peer dependency was dropped.
- **T003**: `.gitkeep` files were unnecessary because every directory received real files.
- **T016 / FR-010**: the discovery timeout is 3000 ms, not 5000 ms. OpenCode 2.0.32 fails every
  CLI command when plugins take over 5 s to activate.
- **T018**: tests load the plugin from `dist/` by path. OpenCode 2 ignores `package.json` for
  local plugins, and the npm name `opencode-cliproxyapi` is a third-party package.
- **T030**: ids containing `/` route verbatim on both hosts; the host key stays the API id.
- **T042**: notification calls are bounded to 1 s each. Headless v1 commands never answer
  `showToast`, which previously hung `opencode models` with the proxy down.
- **T043**: v2 uses `console.error` for all messages because OpenCode 2 drops `console.info`
  from plugins. Visible with `--print-logs` only.
- **T046**: the v1 toast renders in the interactive TUI (verified in a pseudo-terminal).
- **T047**: no `./tui` entry shipped. A v2 toast requires a TUI plugin configured in `cli.json`,
  a second user config entry that conflicts with Principle I. Verified that the v2 TUI does not
  show server-plugin output.
- **T053**: extended to scan the host's data, state, cache, and home dirs for the API key.
- **T054**: caught extensionless relative imports in the build that broke strict Node ESM;
  all relative imports now end in `.js`.
- **T056**: not done. Requires a real CLIProxyAPI with a signed-in account (manual release gate).
