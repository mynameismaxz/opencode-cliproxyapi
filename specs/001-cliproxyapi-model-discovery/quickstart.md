# Quickstart: Validate CLIProxyAPI Model Discovery

Runnable scenarios that prove the feature end-to-end. Commands assume the repo root.

## Prerequisites

- Bun ≥ 1.2 (local: 1.4.2)
- Node/npm (only to install the hosts)
- OpenCode hosts installed into isolated prefixes (CI does this automatically):

```sh
./scripts/install-hosts.sh   # opencode-ai@1.19.3 -> .hosts/v1, @opencode/cli@2.0.32 -> .hosts/v2
```

## 1. Build and unit/contract tests

```sh
bun install
bun run typecheck
bun run build          # tsc -> dist/
bun test               # unit + contract (mock proxy, fixtures)
```

Expected: all tests pass. The contract suite covers success, empty, slash ids, duplicates,
bad entries, 401 missing, 401 invalid, HTTP 500, malformed, timeout, and unreachable.

## 2–4. User stories on both hosts (automated)

```sh
bun run it:v1          # OpenCode 1.19.3
bun run it:v2          # OpenCode 2.0.32
```

Each run starts its own mock CLIProxyAPI instances and runs the shared suite in
`tests/integration/suite.ts` with an isolated `HOME`/`XDG_*`:

- **US1**: zero-config lists exactly the 5 fixture models under `cliproxyapi`; a prompt to
  `cliproxyapi/gemini-2.5-pro` reaches the mock as `model: "gemini-2.5-pro"` with no
  `Authorization` header; loading the plugin twice does not duplicate models; ids with `/`
  route verbatim.
- **US2**: env-only and options-only base URL + key work; env wins over options;
  `{env:VAR}` in options works; a missing key yields zero models and one warning naming
  `CLIPROXYAPI_API_KEY`; the key never appears in output or host files.
- **US3**: with the proxy unreachable, malformed, empty, slow (7 s), or the base URL invalid,
  the host never hangs, the slow proxy is cut off 3.0 to 4.5 s after its request arrives
  (measured directly, independent of host start-up noise), exactly one message appears
  (with `--print-logs`), no proxied models are registered, a user-owned provider still
  completes a chat turn, and no config file is modified.

## Manual try-out

```sh
bun run mock-proxy --fixture models.json --port 8317 &
# then add the dist/ path to your OpenCode config (see README) and open the model picker
```

## 5. Manual verification before release (constitution gate)

1. Point a real OpenCode 1.19.3+ and a real OpenCode 2.0.x at a real CLIProxyAPI with at
   least one signed-in upstream account (reference the plugin by its `dist/` path).
2. Open the model picker; confirm the `CLIProxyAPI` group lists the proxy's models.
3. Complete one chat turn on each host.
4. Confirm no file under `~/.config/opencode` or the project was modified by the plugin.
5. Record the result in `docs/compatibility.md` under "Release verification".

## References

- Settings surface: [contracts/plugin-settings.md](./contracts/plugin-settings.md)
- Upstream API: [contracts/cliproxyapi-models-api.md](./contracts/cliproxyapi-models-api.md)
- Host behaviour: [contracts/host-registration.md](./contracts/host-registration.md)
- Entities: [data-model.md](./data-model.md)
