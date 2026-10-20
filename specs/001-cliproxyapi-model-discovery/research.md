# Phase 0 Research: CLIProxyAPI Model Discovery Plugin

**Date**: 2026-10-20 | **Feature**: [spec.md](./spec.md)

All findings below were verified against published packages, the local OpenCode 2.0.32
install, or tagged source unless marked UNVERIFIED. UNVERIFIED items become explicit
verification tasks in the implementation phase.

## R1. OpenCode version lines and the support floor

**Decision**: Support OpenCode `>=1.19.3 <2.0.0` (v1 line) and `>=2.0.0 <3.0.0` (v2 line).
Test matrix: v1 floor 1.19.3 (which is also the latest 1.x at time of writing) and latest
2.x (2.0.x). When a newer 1.19.x or 1.2x.y ships, it is added to the matrix.

**Rationale**: npm shows no 1.8.x release. The `opencode-ai` 1.x minors are 1.0, 1.1, 1.2,
1.3, 1.4, 1.14, 1.15, 1.16, 1.17, 1.18, 1.19 (latest 1.19.3). The user set the floor to
1.19.3 on 2026-10-20 (constitution 1.0.1, spec FR-015). At 1.19.3 every v1 facility the
plugin relies on is present and verified: plugin options tuple, `serverUrl`, the
`config` hook running before provider load, the bundled `@ai-sdk/openai-compatible`
runtime, the `engines.opencode` compatibility check, and the `{ server }` object
entrypoint.

**Alternatives considered**: floor 1.4.1 (the first release with plugin options; rejected
by the user in favour of a single, current, fully verified 1.x target); floor 1.0.0
(rejected: no plugin options, settings would be env-only).

## R2. Plugin packaging that loads on both host lines

**Decision (revised during implementation, 2026-10-20)**: One npm package whose only export is
a default object `{ id: "cliproxyapi", setup, server }`. OpenCode 2.x reads `id` + `setup`;
OpenCode 1.19.3 reads `server()`. `package.json` maps both `"."` and `"./server"` to
`dist/index.js` and also sets `main`. `engines.opencode: ">=1.19.3"`, `type: "module"`.
Relative imports in the build carry explicit `.js` extensions so the package loads under strict
Node ESM as well as Bun.

**Why the original split-entry design was dropped**: integration spikes showed
(a) OpenCode 1.19.3 rejects local path / `file://` plugins unless they default-export an object
with `server()`; (b) OpenCode 2.0.32 resolves local path plugins as `<dir>/server.*` or
`<dir>/index.*` files and ignores `package.json`, so a separate `./server` module would never be
found for local installs. A single combined default export works for every load path on both
hosts. `Plugin.define` is an identity function, so no runtime import of `@opencode/plugin` is
needed; `@opencode/plugin` and `@opencode-ai/plugin` are dev dependencies (types only).

**Alternatives considered**: separate `index.js` (v1 named export) and `server.js` (v2) entries
(the original plan; rejected per the findings above); runtime import of `Plugin.define`
(rejected: adds host-side resolution risk for no behaviour).

## R3. v1 registration mechanism

**Decision**: Implement the `config` hook: `config: async (cfg) => { cfg.provider ??= {};
cfg.provider.cliproxyapi = {...} }`. Perform the (bounded) network fetch inside the hook,
which is awaited.

**Rationale**: Verified in `provider/provider.ts` at 1.19.3 (and from 1.4.1): plugins are listed
(running `config()`) before `cfg.provider` is read, and the hook receives the same cached
config object, so mutations are honoured. In 1.0.0 the hook runs during bootstrap before
lazy provider state, with the same effect. Errors thrown in the hook are logged and
ignored by the host, but the plugin will still catch everything itself (Principle III).
The `provider.models` hook (1.19.3) only applies to providers already in the models.dev
catalog, so it cannot register a new custom provider.

**Provider config shape** (SDK `ProviderConfig`, stable 1.0→1.19):
`{ npm: "@ai-sdk/openai-compatible", name: "CLIProxyAPI", options: { baseURL, apiKey? },
models: { [id]: { name, limit: { context, output } } } }`. `name` and `limit` must be set
(defaults are 0). Config providers are activated unconditionally; no key is needed for the
models to appear in the picker.

**`@ai-sdk/openai-compatible`**: provided by the host. 1.19.3 bundles it
(`BUNDLED_PROVIDERS`). The plugin never depends on it.

**Alternatives considered**: `auth` hook `loader` — rejected, it only runs when credentials
already exist in `auth.json` (requires `/connect`), so it cannot supply a key silently.

## R4. v2 registration mechanism

**Decision**: In `setup(ctx)`, fetch the model list first (bounded), then call
`await ctx.provider.transform((editor) => { editor.get(ID) ? editor.models.set(ID, models)
: editor.add({ info, models }) })`. The transform callback is synchronous and replayable;
the model array is captured in a closure.

**Rationale**: Verified in `@opencode/plugin@2.0.32` types: `ProviderDomain.transform:
Transform<ProviderEditor>`, `ProviderEditor.add({ info: Provider.Info, models: Model.Info[]
})`, `editor.get(id)`, `editor.models.set(id, models)`, and `ctx.provider.reload()`.
`Provider.Info` fields: `{ id, name, activation: "auto"|"enabled"|"disabled", package,
settings?, headers?, body? }` with `Provider.Info.empty(id)` as a base.
`Model.Info.default(providerID, modelID)` yields a complete model with
`capabilities: { tools: true, input: ["text","image"], output: ["text"] }`, `status:
"active"`, `limit: { context: 200000, output: 32000 }`. The OpenAI-compatible runtime
package is `@opencode/ai/providers/openai-compatible` with `settings: { apiKey?, baseURL }`;
it ships with the host. (Field details from the v2 docs and `@opencode/schema` source read
by research; exact helper names to be confirmed against installed types in implementation.)

**Alternatives considered**: `ctx.integration` credential flow — rejected for this feature;
`settings.apiKey` is sufficient and keeps setup to two values. `setInterval` refresh with
`ctx.provider.reload()` — out of scope (spec: discovery at startup only).

## R5. Host detection

**Decision**: Structural detection. The v1 entry module is only ever invoked by a v1 host
and the v2 entry only by a v2 host, so no version sniffing is required to select a code
path. Within the v1 path, if the input lacks `serverUrl` or no `options` object is passed
(both present from 1.4.1, so this only triggers on hosts below the supported floor that do
not enforce `engines.opencode`), fall back to environment variables and emit the
"supported range" message. `ctx.app.version` (v2) and `GET /global/health` (v1 via
`serverUrl`) are available for diagnostics and the compatibility message only.

**Rationale**: v1 `PluginInput` has no version field and the v1 SDK client has no
`global.health()`; the HTTP route exists on 1.19.3. Feature detection via which
entrypoint ran is simpler and cannot be wrong.

## R6. CLIProxyAPI contract

**Decision**: Base URL default `http://localhost:8317`; the plugin normalises any user value
to `<origin>[/path]/v1` (append `/v1` if absent, strip trailing slash). Discovery is
`GET <base>/models` with no `Anthropic-Version` header and no `client_version` query, so
the OpenAI-format response is returned. Chat uses `<base>/chat/completions` through the
host's OpenAI-compatible provider.

**Verified facts** (CLIProxyAPI `main`, 2026-10-20):
- Default `server.port: 8317`, binds all interfaces, TLS off. `GET /healthz` → `{"status":"ok"}`.
- `/v1/models` response is exactly `{ "object": "list", "data": [{ "id", "object": "model",
  "created"?, "owned_by"? }] }`. Extra registry fields are stripped; do not rely on them.
- IDs may contain `/` (e.g. `devin/swe-2`, per-credential prefixes like `test/gpt-5-codex`)
  and `.` (e.g. `gpt-5.5`); no `:` observed.
- Auth is optional: with `access.api-keys` empty, requests pass unauthenticated. Accepted:
  `Authorization: Bearer <key>` (first checked), `X-Api-Key`, `X-Goog-Api-Key`, `?key=`.
  Missing key → `401 {"error":"Missing API key"}`; wrong key → `401 {"error":"Invalid API
  key"}` (plain-string `error`).
- Empty list is `200 {"object":"list","data":[]}` when no upstream account is signed in.
- Listing is served from memory (fast) except in `home.enabled` mode which proxies upstream.
- Streaming chat completions supported.

**Alternatives considered**: Anthropic-compatible `/v1/messages` route — rejected; the
OpenAI route is the user-stated contract and matches both hosts' built-in provider runtime.

## R7. Model metadata defaults

**Decision**: Every discovered model is registered with `name = id`, `limit.context =
200000`, `limit.output = 32000`, tool calling enabled, text+image input, text output, cost
unspecified. Identical on both hosts.

**Rationale**: CLIProxyAPI's listing carries no limits or capabilities. These values match
v2's `Model.Info.default` so behaviour is consistent across hosts, and over-estimating
context only affects compaction thresholds, not correctness. Per-model overrides are a
possible follow-up once a concrete need is documented (Principle V).

## R8. Model identifier handling

**Decision**: Dedupe by exact `id`. Register the API-facing identifier verbatim (FR-003).
For the host-facing key: v2 separates `id` from `modelID`, so a sanitised key can map to
the original API id. For v1 the config model key is the API id; whether ids containing `/`
survive OpenCode's `provider/model` reference parsing is UNVERIFIED and will be tested with
a fixture containing `devin/swe-2`. If v1 cannot route them, apply FR-016 (skip with a
warning naming the id).

## R9. Surfacing warnings

**Decision**:
- v1: `client.tui.showToast({ body: { title: "CLIProxyAPI", message, variant: "warning" } })`
  plus `client.app.log({ body: { service: "cliproxyapi", level: "warn", message } })`.
  Both exist from 1.0.0. Whether a toast sent during the `config` hook reaches a TUI that
  attaches later is UNVERIFIED; the log line is the guaranteed channel.
- v2: `console.error("[cliproxyapi] ...")` from the server plugin (documented channel).
  A `./tui` entrypoint using `context.ui.toast.show` is the user-visible channel; how the
  TUI entry learns the server-side outcome (shared `ctx.storage`, `ctx.rpc`, or an event)
  is UNVERIFIED and is scoped as a spike task. Baseline deliverable is the console channel.
- Exactly one message per discovery attempt; the API key is never included (redaction
  helper strips `Authorization` values and the configured key from any text).

## R10. Testing approach

**Decision**: `bun test` for unit and contract tests. Contract tests run against an
in-process mock CLIProxyAPI (Bun `serve`) that replays recorded fixtures: normal list,
empty list, ids with `/`, 401 missing key, 401 invalid key, malformed JSON, slow response.
Host integration tests spawn real binaries headless: `opencode-ai@1.19.3` and
`@opencode/cli@2.0.x` installed into isolated prefixes, pointed at a temp project whose
config references the built plugin, against the mock proxy; assert model presence via the
hosts' model listing/`run` commands and complete one chat turn. The local machine already
has `@opencode/cli` 2.0.32 and Bun 1.4.2.

**Rationale**: Principles III and IV require every failure path to be tested and both host
lines to be exercised per PR.

## R11. Dependencies

**Decision**: Zero runtime dependencies. `@opencode/plugin` is an optional peer dependency
(v2 host provides it; needed at runtime for `Plugin.define` and schema helpers).
`@opencode-ai/plugin` is a dev dependency used for types only (`import type`). Dev tooling:
TypeScript, `bun-types`. Build with `tsc` to ESM `dist/`.

**Rationale**: Principle V. v1 hosts install npm plugins with Bun into
`~/.cache/opencode/node_modules`; a type-only import leaves no runtime require.

## R12. OpenCode 2.x plugin activation window

**Finding** (2.0.32): all plugins together must finish `setup` within about 5 s. Past that, the
server answers HTTP 503 "Location plugins did not finish activating" and the CLI command fails.

**Decision**: discovery timeout is 3000 ms on both hosts (was 5000 ms). The timeout covers both
response headers and body.

## R13. Message visibility per host

**Findings**:
- 1.19.3: `client.app.log` reaches the log file and `--print-logs`; `client.tui.showToast`
  renders in the interactive TUI (verified in a pseudo-terminal). In headless commands the toast
  call never resolves, which hung `opencode models` until each notification call was bounded to
  1 s.
- 2.0.32: plugin `console.info`/`console.log` output is dropped; `console.error` is shown only
  with `--print-logs`. Nothing reaches the TUI. A TUI toast would require a separate TUI plugin
  configured in `cli.json`, a second user config entry that conflicts with Principle I.

**Decision**: v1 uses log + bounded toast; v2 uses `console.error` for every message. The v2
limitation is documented in `docs/compatibility.md` and the README.

## R14. npm package name

**Finding**: `opencode-cliproxyapi` is already published on npm by a third party (0.1.2,
July 2026). An OpenCode host given that name downloads and runs the third-party package.

**Decision**: publish as `@mynameismaxz/opencode-cliproxyapi` (chosen by the project owner, 2026-10-20). Tests load the
plugin only by local path, so no host ever downloads a package during tests.
