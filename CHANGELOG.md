# Changelog

## 0.1.0 (unreleased)

- Discover CLIProxyAPI models at OpenCode startup and register them under the `cliproxyapi`
  provider, with no manual provider configuration.
- Two optional settings: base URL and API key, from env vars or plugin options; env wins.
- Graceful failure: 3 s discovery bound, one redacted message per start, user providers untouched.
- Supports OpenCode 1.19.3+ and OpenCode 2.x from one package (single default export).
