# Contract: Host Registration (plugin ↔ OpenCode)

Defines what each host adapter must do with a `DiscoveryOutcome`. The core module never
imports a host package; adapters never parse HTTP.

## Package layout

```json
{
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".":        { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./server": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "engines": { "opencode": ">=1.19.3" }
}
```

`dist/index.js` has exactly one export:

```ts
export default { id: "cliproxyapi", setup /* v2 */, server /* v1 */ }
```

Local installs reference the `dist/` directory (OpenCode 2 loads `<dir>/index.js` and ignores
`package.json`). No runtime dependency on either host SDK.

## v1 adapter (`server()`, OpenCode 1.19.3 – 1.x)

- `server` signature: `async (input: PluginInput, options?: PluginOptions) => Hooks`.
- Returns `{ config: async (cfg) => { ... } }` only.
- Inside `config`:
  1. Resolve Settings from `process.env` and `options`.
  2. Run discovery (bounded).
  3. On `success`: `cfg.provider ??= {}`; build/merge `cfg.provider.cliproxyapi` as
     `{ npm: "@ai-sdk/openai-compatible", name: "CLIProxyAPI", options: { baseURL, apiKey? },
     models: { [hostKey]: { name, limit: { context, output }, tool_call: true } } }`,
     applying the FR-008 merge rule if the key already exists.
  4. On `empty`/`failure`: leave `cfg` untouched.
  5. Emit the single message via `input.client.app.log` and `input.client.tui.showToast`,
     each bounded to 1 s (a headless host never answers the toast).
- Never throws; any unexpected exception becomes `failure(...)` with a redacted detail.
- If `input.serverUrl` is undefined (only possible on a host below the 1.19.3 floor that does
  not enforce `engines.opencode`), prefix the single message with the `unsupported-host` notice.
  `options` being undefined is normal: it is the zero-config form.

## v2 adapter (`setup()`, OpenCode 2.x)

- Inside `setup(ctx)`:
  1. Resolve Settings from `process.env` and `ctx.options`.
  2. Run discovery (bounded).
  3. On `success`: `await ctx.provider.transform((editor) => { ... })` where the callback is
     synchronous, uses the captured `ModelSpec[]`, and either `editor.add({ info, models })`
     for a new `cliproxyapi` provider or `editor.models.set(...)`/`editor.update(...)` to
     merge into an existing user-defined one (FR-008).
     `info = { ...Provider.Info.empty(id), name: "CLIProxyAPI", activation: "enabled",
     package: "@opencode/ai/providers/openai-compatible", settings: { baseURL, apiKey? } }`;
     each model = `{ ...Model.Info.default(id, hostKey), modelID: apiID, name, limit }`.
  4. On `empty`/`failure`: no transform.
  5. Emit the single message via `console.error` prefixed `[cliproxyapi]` (2.x drops
     `console.info`; output is visible with `--print-logs` only).
- Never throws out of `setup`; returns no cleanup (nothing to clean).

## v2 TUI entry

Not shipped. A toast on 2.x needs a TUI plugin configured separately in `cli.json`, which adds
a second user config entry (Principle I). See research R13.

## Shared guarantees (both adapters)

- Idempotent: invoking the adapter twice in one process yields one provider entry with no
  duplicate models (FR-017).
- Only the `cliproxyapi` provider id is read or written (FR-008).
- No filesystem writes (FR-009). No network calls except to `Settings.baseURL` (FR-013).
- Startup delay bounded by `timeoutMs` = 3000 ms (FR-010), under 2.x's 5 s activation window.
