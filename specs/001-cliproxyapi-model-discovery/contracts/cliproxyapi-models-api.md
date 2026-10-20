# Contract: CLIProxyAPI Model Listing (upstream)

The plugin depends on this subset of CLIProxyAPI's OpenAI-compatible HTTP API. Any change
here must be reflected by updating the recorded fixtures under `tests/fixtures/cliproxyapi/`
(Principle IV).

## Request

```
GET {baseURL}/models
Accept: application/json
Authorization: Bearer {apiKey}      # only when apiKey is set
```

- `{baseURL}` ends in `/v1` (e.g. `http://localhost:8317/v1`).
- The plugin MUST NOT send `Anthropic-Version` and MUST NOT add a `client_version` query,
  otherwise CLIProxyAPI switches to a different response format.
- Timeout: 3000 ms, enforced client-side with an abort signal covering headers and body
  (OpenCode 2.x fails startup if plugins take longer than 5 s to activate; research R12).

## Responses

| Status | Body | Plugin outcome |
|--------|------|----------------|
| 200 | `{"object":"list","data":[{"id":"<string>","object":"model","created":<int>?,"owned_by":"<string>"?}, ...]}` | `success` (≥1 id) or `empty` (0 ids) |
| 200 | `{"object":"list","data":[]}` | `empty` |
| 401 | `{"error":"Missing API key"}` or `{"error":"Invalid API key"}` | `failure(unauthorized)` |
| other non-2xx | any | `failure(http-error)` |
| 200 | non-JSON, or JSON without a `data` array | `failure(malformed)` |

Parsing rules:
- Only `data[].id` (string, non-empty) and `data[].owned_by` (optional string) are read.
- Unknown fields are ignored. Entries with a missing or non-string `id` are skipped.
- Duplicate ids are collapsed; first occurrence wins.
- Ids may contain `/` and `.` and are passed through verbatim as the API identifier.

## Chat (used by the host, not by the plugin)

The host's OpenAI-compatible provider runtime sends `POST {baseURL}/chat/completions`
with the same `Authorization` header and the model's `apiID`. Streaming is supported by
CLIProxyAPI. The plugin only supplies `baseURL`, `apiKey`, and model ids.

## Fixtures to record

| File | Content |
|------|---------|
| `models.json` | 5+ models across vendors, e.g. `gemini-2.5-pro`, `claude-sonnet-4-6`, `gpt-5.5`, `kimi-k2.5`, `grok-4.7` |
| `models-empty.json` | `{"object":"list","data":[]}` |
| `models-slash-ids.json` | includes `devin/swe-2` and `test/gpt-5-codex` |
| `models-duplicates.json` | the same id twice |
| `models-bad-entries.json` | entries missing `id` mixed with valid ones |
| `error-401-missing.json` | `{"error":"Missing API key"}` |
| `error-401-invalid.json` | `{"error":"Invalid API key"}` |
| `malformed.txt` | `not json` |
