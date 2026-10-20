# Data Model: CLIProxyAPI Model Discovery Plugin

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All entities are in-memory only. The plugin persists nothing to disk (FR-009).

## Settings

Resolved connection settings, built once per plugin start.

| Field       | Type               | Source precedence                                     | Validation |
|-------------|--------------------|-------------------------------------------------------|------------|
| `baseURL`   | `string` (URL)     | `CLIPROXYAPI_BASE_URL` env → `options.baseURL` → default `http://localhost:8317` | Must parse as http(s) URL. Normalised: trailing `/` stripped; `/v1` appended if the path does not already end in `/v1`. Invalid → `DiscoveryOutcome.failure(invalid-settings)`. |
| `apiKey`    | `string \| undefined` | `CLIPROXYAPI_API_KEY` env → `options.apiKey` → undefined | Empty string treated as undefined. Never logged. |
| `timeoutMs` | `number`           | constant `3000`                                       | Not user-configurable. Must stay under OpenCode 2.x's 5 s plugin activation window (see research R12). |

Derived: `modelsURL = baseURL + "/models"`, `chatBaseURL = baseURL` (host appends
`/chat/completions`).

## DiscoveredModel

One entry from the CLIProxyAPI listing after parsing and de-duplication.

| Field     | Type                | Notes |
|-----------|---------------------|-------|
| `id`      | `string`            | Verbatim from `data[].id`. Non-empty. Unique within one outcome (first occurrence wins). |
| `ownedBy` | `string \| undefined` | From `data[].owned_by` when present. Informational only. |

Validation: a listing entry without a string `id` is skipped and counted; if every entry is
skipped the outcome is `empty`, not `failure`.

## ModelSpec

Host-neutral registration record produced from a `DiscoveredModel`. Both host adapters
consume this and nothing else.

| Field           | Type     | Value |
|-----------------|----------|-------|
| `apiID`         | `string` | `DiscoveredModel.id`, sent to CLIProxyAPI unchanged (FR-003). |
| `hostKey`       | `string` | Key used in the host's model map. Equals `apiID` unless the host cannot accept it (R8), in which case a sanitised form; the mapping `hostKey → apiID` is kept. |
| `displayName`   | `string` | `apiID`. |
| `contextLimit`  | `number` | `200000` (R7). |
| `outputLimit`   | `number` | `32000` (R7). |
| `toolCall`      | `boolean`| `true`. |

## ProviderGroup

The single provider the plugin owns.

| Field        | Value |
|--------------|-------|
| `id`         | `cliproxyapi` (constant; reserved to the plugin) |
| `name`       | `CLIProxyAPI` |
| `runtime`    | v1: `npm: "@ai-sdk/openai-compatible"`; v2: `package: "@opencode/ai/providers/openai-compatible"` |
| `baseURL`    | `Settings.baseURL` |
| `apiKey`     | `Settings.apiKey` (omitted when undefined) |
| `models`     | `ModelSpec[]` keyed by `hostKey` |

Rule (FR-008): if the host already has a provider with id `cliproxyapi` that the user
defined, the plugin merges: user-defined model entries and options take precedence,
discovered models that the user did not define are added. Any other provider id is never
touched.

## DiscoveryOutcome

Result of one discovery attempt. Exactly one user-facing message is derived from it
(FR-011).

```
success  { models: ModelSpec[] (length ≥ 1) }
empty    { }                                   → informational message
failure  { cause: FailureCause, detail: string } → one warning
```

`FailureCause` enum:

| Cause              | Trigger |
|--------------------|---------|
| `invalid-settings` | base URL does not parse |
| `unreachable`      | network error / connection refused / DNS |
| `timeout`          | no response within `timeoutMs` |
| `unauthorized`     | HTTP 401 (missing or invalid key; message names the setting, never the value) |
| `http-error`       | any other non-2xx status |
| `malformed`        | body is not JSON or lacks `data` array |
| `unsupported-host` | v1 host below 1.19.3 that did not enforce `engines.opencode` (no `serverUrl`); prefixed to the single message |

`detail` is already redacted (no `Authorization` header values, no API key substring).

## State transitions

```
plugin start
  → resolve Settings
      ├─ invalid → Outcome.failure(invalid-settings) → warn → register nothing
      └─ valid   → fetch listing (bounded by timeoutMs)
            ├─ error/timeout/401/non-2xx/malformed → Outcome.failure(cause) → warn → register nothing
            ├─ 200 with 0 usable ids → Outcome.empty → info → register nothing
            └─ 200 with ≥1 ids → Outcome.success → build ProviderGroup → register on host
```

No state survives the process; a restart re-runs the whole flow (spec assumption:
startup-only discovery).
