# Host Compatibility

Required by constitution Principle II. Update this file in the same change that adds or drops a
supported OpenCode version.

## Matrix

| Host | Version tested | US1 discover + chat | US2 settings | US3 failure handling | Last verified |
|------|----------------|---------------------|--------------|----------------------|---------------|
| OpenCode 1.x (`opencode-ai`) | 1.19.3 | Pass | Pass | Pass | 2026-10-20 (automated) |
| OpenCode 2.x (`@opencode/cli`) | 2.0.32 | Pass | Pass | Pass, warning visible only with `--print-logs` | 2026-10-20 (automated) |

Supported range: OpenCode `>=1.19.3 <2` and `>=2.0.0 <3`. Automated results come from
`bun run test:integration` against a mock CLIProxyAPI. The manual release check against a real
CLIProxyAPI is still pending (see "Release verification" below).

## Loader behaviour (observed)

- **One entry point serves both hosts.** The package has a single default-exported object
  `{ id, setup, server }`. OpenCode 2.x reads `id` + `setup` (`Plugin.define` is an identity
  function). OpenCode 1.19.3 reads `server()`. The module has no other exports.
- **OpenCode 1.19.3, local path or `file://` plugins** must default-export an object with
  `server()`. A module that only has a named plugin function is rejected with
  "must default export an object with server()".
- **OpenCode 2.0.32, local path plugins** are resolved as the files `<dir>/server.*` or
  `<dir>/index.*`; `package.json` is ignored. Point a local install at the `dist/` directory,
  not at the repository root. npm installs resolve through `package.json` `exports` normally
  (`<pkg>/server` maps to `dist/index.js`).
- **Both hosts substitute `{env:VAR}`** inside the plugin options block.

## Timing constraints (observed)

- OpenCode 2.0.32 gives all plugins a combined **5 s activation window**. If activation takes
  longer, every CLI command fails with HTTP 503 "Location plugins did not finish activating".
  The plugin therefore bounds discovery to **3 s** on both hosts.
- OpenCode 1.19.3 headless commands (`opencode models`, `opencode run`) have no TUI attached,
  and `client.tui.showToast` then never resolves. Each notification call is bounded to 1 s so
  it cannot stall startup. Before this bound, an unreachable proxy hung `opencode models`
  indefinitely.
- OpenCode 1.19.3 cold-start time varies by several seconds between identical runs. The
  integration budget allows for this.

## User-visible messages (observed)

| Host | Channel | Visible in the normal TUI? |
|------|---------|----------------------------|
| 1.19.3 | `client.app.log` (log file, `--print-logs`) and `client.tui.showToast` | Yes. Verified by rendering the TUI in a pseudo-terminal with the proxy down. |
| 2.0.32 | `console.error` from the server plugin | **No.** Shown only with `--print-logs`. `console.info` from plugins is dropped entirely. |

A visible toast on 2.x would need a separate TUI plugin, which OpenCode 2 configures in
`cli.json`. That adds a second config entry for the user and conflicts with the zero-config
principle, so it is not shipped. On 2.x a failure shows up as "no CLIProxyAPI models in the
picker"; run any command with `--print-logs` to see the reason.

## Model identifiers

Ids containing `/` (for example `devin/swe-2`) are registered verbatim and route correctly on
both hosts: `cliproxyapi/devin/swe-2` sends `model: "devin/swe-2"` to CLIProxyAPI. No
sanitisation is applied.

## Engines field

`package.json` declares `engines.opencode: ">=1.19.3"`. OpenCode 1.19.x checks this range for npm
plugins. Whether OpenCode 2.x enforces it was not observed (local path loading bypasses it).

## Release verification

Constitution gate: before each release, load the plugin into a real OpenCode 1.19.3+ and a real
OpenCode 2.x against a real CLIProxyAPI with at least one signed-in account, confirm the model
picker lists the proxy's models, complete one chat turn on each, and confirm no file under
`~/.config/opencode` changed.

| Date | OpenCode 1.x | OpenCode 2.x | CLIProxyAPI | Result |
|------|--------------|--------------|-------------|--------|
| _pending_ | | | | |
