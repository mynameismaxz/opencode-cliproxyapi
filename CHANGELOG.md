# Changelog

## Unreleased

- Model limits now come from [models.dev](https://models.dev): the plugin downloads the public
  catalog at startup (bounded, best-effort, in parallel with proxy discovery) and registers each
  discovered model with its published context/output window instead of a fixed 200k/32k default.
  Matching prefers the `owned_by` upstream, then first-party providers, then the most commonly
  published window; unknown models keep the 200k/32k defaults.
- New settings: `contextLookup` / `CLIPROXYAPI_CONTEXT_LOOKUP` (on by default) and `contextURL` /
  `CLIPROXYAPI_CONTEXT_URL` to disable the lookup or point at a mirror.

## 0.1.2

- Verified against OpenCode 2.4.1 (models, chat, failure handling, user providers, no config
  writes).
- Updated the OpenCode 2 dev dependency and the integration host to `@opencode/plugin@2.4.1` /
  `@opencode/cli@2.4.1`.
- Fixed the integration suite's user-provider fixture: its 8,000-token context window made
  OpenCode 2.4.x auto-compact on every turn, so the mock reply failed summary validation. The
  fixture now uses OpenCode's own 200,000 / 32,000 defaults.
- Documented OpenCode 2.4.x background plugin loading (no 5 s startup wait) and plugin
  auto-update behaviour, and recommend `@latest` for OpenCode 2.x installs.

## 0.1.0 (unreleased)

- Discover CLIProxyAPI models at OpenCode startup and register them under the `cliproxyapi`
  provider, with no manual provider configuration.
- Two optional settings: base URL and API key, from env vars or plugin options; env wins.
- Graceful failure: 3 s discovery bound, one redacted message per start, user providers untouched.
- Supports OpenCode 1.19.3+ and OpenCode 2.x from one package (single default export).
