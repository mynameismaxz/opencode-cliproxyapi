import { describe, expect, test } from "bun:test"
import { resolveSettings, DEFAULT_BASE_URL, DISCOVERY_TIMEOUT_MS } from "../../src/core/settings"

const ok = (r: ReturnType<typeof resolveSettings>) => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`)
  return r.settings
}

describe("resolveSettings", () => {
  test("defaults to the local CLIProxyAPI address with no key", () => {
    const s = ok(resolveSettings({}, undefined))
    expect(DEFAULT_BASE_URL).toBe("http://localhost:8317")
    expect(s.baseURL).toBe("http://localhost:8317/v1")
    expect(s.modelsURL).toBe("http://localhost:8317/v1/models")
    expect(s.apiKey).toBeUndefined()
    expect(s.timeoutMs).toBe(3000)
    expect(DISCOVERY_TIMEOUT_MS).toBe(3000)
  })

  test("env wins over options, options win over default", () => {
    const env = { CLIPROXYAPI_BASE_URL: "http://env:1", CLIPROXYAPI_API_KEY: "env-key" }
    const opts = { baseURL: "http://opt:2", apiKey: "opt-key" }
    const both = ok(resolveSettings(env, opts))
    expect(both.baseURL).toBe("http://env:1/v1")
    expect(both.apiKey).toBe("env-key")
    const onlyOpts = ok(resolveSettings({}, opts))
    expect(onlyOpts.baseURL).toBe("http://opt:2/v1")
    expect(onlyOpts.apiKey).toBe("opt-key")
  })

  test("empty strings count as unset", () => {
    const s = ok(resolveSettings({ CLIPROXYAPI_BASE_URL: "", CLIPROXYAPI_API_KEY: "" }, { baseURL: "http://opt:2", apiKey: "" }))
    expect(s.baseURL).toBe("http://opt:2/v1")
    expect(s.apiKey).toBeUndefined()
  })

  test.each([
    ["http://h:8317", "http://h:8317/v1"],
    ["http://h:8317/", "http://h:8317/v1"],
    ["http://h:8317/v1", "http://h:8317/v1"],
    ["http://h:8317/v1/", "http://h:8317/v1"],
    ["https://proxy.example.com/base", "https://proxy.example.com/base/v1"],
    ["https://proxy.example.com/base/v1/", "https://proxy.example.com/base/v1"],
    ["  http://h:8317  ", "http://h:8317/v1"],
  ])("normalises %p to %p", (input, expected) => {
    expect(ok(resolveSettings({ CLIPROXYAPI_BASE_URL: input }, undefined)).baseURL).toBe(expected)
  })

  test.each(["notaurl", "ftp://h:8317", "http://", "localhost:8317"])("rejects invalid base URL %p", (value) => {
    const r = resolveSettings({ CLIPROXYAPI_BASE_URL: value }, undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.cause).toBe("invalid-settings")
      expect(r.value).toBe(value.trim())
    }
  })

  test("ignores unknown option keys and non-string option values", () => {
    const s = ok(resolveSettings({}, { baseURL: 123, apiKey: { x: 1 }, somethingElse: true } as Record<string, unknown>))
    expect(s.baseURL).toBe("http://localhost:8317/v1")
    expect(s.apiKey).toBeUndefined()
  })

  test("invalid-settings result still carries the api key for redaction", () => {
    const r = resolveSettings({ CLIPROXYAPI_BASE_URL: "nope", CLIPROXYAPI_API_KEY: "k" }, undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.apiKey).toBe("k")
  })
})
