# Contract: Plugin Settings (user-facing)

This is the plugin's public configuration surface. Removing or renaming anything here is a
breaking change (Principle V).

## Settings

| Setting   | Env var                | Option key (plugin config) | Default                   | Required |
|-----------|------------------------|----------------------------|---------------------------|----------|
| Base URL  | `CLIPROXYAPI_BASE_URL` | `baseURL`                  | `http://localhost:8317`   | No |
| API key   | `CLIPROXYAPI_API_KEY`  | `apiKey`                   | none (unauthenticated)    | No |

Precedence: env var → option → default. A value of `""` counts as unset.

Base URL accepted forms (all normalise to `http://host:8317/v1`):
`http://host:8317`, `http://host:8317/`, `http://host:8317/v1`, `http://host:8317/v1/`.

## Where options are written

OpenCode v1 (`opencode.json`):

```json
{ "plugin": [["<package-or-path-to-dist>", { "baseURL": "http://192.168.1.10:8317", "apiKey": "{env:MY_PROXY_KEY}" }]] }
```

OpenCode v2 (`opencode.json`):

```json
{ "plugins": [{ "package": "<package-or-path-to-dist>", "options": { "baseURL": "http://192.168.1.10:8317", "apiKey": "{env:MY_PROXY_KEY}" } }] }
```

Zero-config form on either host: `"plugin": ["<package-or-path-to-dist>"]` / `"plugins":
["<package-or-path-to-dist>"]`. Both hosts substitute `{env:VAR}` inside options (verified).
Published name: `@mynameismaxz/opencode-cliproxyapi` (the unscoped `opencode-cliproxyapi` is a different, third-party
package; research R14).

## What the user sees

| Situation | Channel (v1: log + toast, each ≤1 s) | Channel (v2: `console.error`, `--print-logs` only) | Message shape |
|-----------|--------------|--------------|---------------|
| success | nothing | nothing | models appear under provider "CLIProxyAPI" |
| empty | info toast + log | console.error | `CLIProxyAPI at <baseURL> reports no models. Sign in to an upstream account in CLIProxyAPI and restart.` |
| unauthorized | warning toast + log | console.error | `CLIProxyAPI at <baseURL> rejected the API key. Set CLIPROXYAPI_API_KEY or the apiKey option.` |
| unreachable / timeout | warning toast + log | console.error | `CLIProxyAPI at <baseURL> could not be reached (<cause>). Proxied models are unavailable until restart.` |
| malformed / http-error | warning toast + log | console.error | `CLIProxyAPI at <baseURL> returned an unexpected response (<status or reason>).` |
| invalid-settings | warning toast + log | console.error | `CLIPROXYAPI_BASE_URL / baseURL is not a valid URL: <value>.` |
| unsupported-host (v1 only; prefixed to the main message) | warning toast + log | n/a | `@mynameismaxz/opencode-cliproxyapi supports OpenCode 1.19.3+ and 2.x; running on an older host, using environment settings only.` |

Guarantees: exactly one message per start; the API key value never appears in any message.

## Provider identity

- Provider id: `cliproxyapi` (model references look like `cliproxyapi/<model-id>`)
- Provider display name: `CLIProxyAPI`
