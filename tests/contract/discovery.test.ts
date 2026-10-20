import { afterEach, describe, expect, test } from "bun:test"
import { discoverModels } from "../../src/core/discovery"
import { resolveSettings, type Settings } from "../../src/core/settings"
import { startMockProxy, type MockProxy } from "../mock/cliproxyapi"

let proxy: MockProxy | undefined
afterEach(() => {
  proxy?.stop()
  proxy = undefined
})

function settingsFor(url: string, apiKey?: string, timeoutMs?: number): Settings {
  const r = resolveSettings({ CLIPROXYAPI_BASE_URL: url, CLIPROXYAPI_API_KEY: apiKey }, undefined)
  if (!r.ok) throw new Error("bad settings")
  return timeoutMs ? { ...r.settings, timeoutMs } : r.settings
}

async function freePort(): Promise<number> {
  const s = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = s.port as number
  s.stop(true)
  return port
}

describe("discoverModels against the CLIProxyAPI contract", () => {
  test("models.json -> success with ids in order", async () => {
    proxy = startMockProxy({ fixture: "models.json" })
    const o = await discoverModels(settingsFor(proxy.url))
    expect(o.kind).toBe("success")
    if (o.kind === "success") {
      expect(o.models.map((m) => m.id)).toEqual(["gemini-2.5-pro", "claude-sonnet-4-6", "gpt-5.5", "kimi-k2.5", "grok-4.7"])
      expect(o.models[0]!.ownedBy).toBe("google")
    }
  })

  test("models-empty.json -> empty", async () => {
    proxy = startMockProxy({ fixture: "models-empty.json" })
    expect((await discoverModels(settingsFor(proxy.url))).kind).toBe("empty")
  })

  test("duplicates collapse, first wins", async () => {
    proxy = startMockProxy({ fixture: "models-duplicates.json" })
    const o = await discoverModels(settingsFor(proxy.url))
    expect(o.kind === "success" && o.models.map((m) => m.id)).toEqual(["gpt-5.5", "gemini-2.5-pro"])
  })

  test("bad entries are skipped without throwing", async () => {
    proxy = startMockProxy({ fixture: "models-bad-entries.json" })
    const o = await discoverModels(settingsFor(proxy.url))
    expect(o.kind === "success" && o.models.map((m) => m.id)).toEqual(["gemini-2.5-pro", "kimi-k2.5"])
  })

  test("ids with slashes are preserved verbatim", async () => {
    proxy = startMockProxy({ fixture: "models-slash-ids.json" })
    const o = await discoverModels(settingsFor(proxy.url))
    expect(o.kind === "success" && o.models.map((m) => m.id)).toEqual(["gemini-2.5-pro", "devin/swe-2", "test/gpt-5-codex"])
  })

  test("401 missing key -> unauthorized", async () => {
    proxy = startMockProxy({ apiKey: "k" })
    const o = await discoverModels(settingsFor(proxy.url))
    expect(o.kind === "failure" && o.cause).toBe("unauthorized")
  })

  test("401 invalid key -> unauthorized, and key not in detail", async () => {
    proxy = startMockProxy({ apiKey: "k" })
    const o = await discoverModels(settingsFor(proxy.url, "wrong-key"))
    expect(o.kind === "failure" && o.cause).toBe("unauthorized")
    expect(JSON.stringify(o)).not.toContain("wrong-key")
  })

  test("500 -> http-error", async () => {
    proxy = startMockProxy({ status: 500 })
    const o = await discoverModels(settingsFor(proxy.url))
    expect(o.kind === "failure" && o.cause).toBe("http-error")
    expect(o.kind === "failure" && o.detail).toBe("HTTP 500")
  })

  test("malformed body -> malformed", async () => {
    proxy = startMockProxy({ fixture: "malformed.txt" })
    const o = await discoverModels(settingsFor(proxy.url))
    expect(o.kind === "failure" && o.cause).toBe("malformed")
  })

  test("JSON without data array -> malformed", async () => {
    proxy = startMockProxy({ fixture: "error-401-missing.json" })
    const o = await discoverModels(settingsFor(proxy.url))
    expect(o.kind === "failure" && o.cause).toBe("malformed")
  })

  test("slow response -> timeout within the bound", async () => {
    proxy = startMockProxy({ delayMs: 2000 })
    const start = performance.now()
    const o = await discoverModels(settingsFor(proxy.url, undefined, 100))
    expect(o.kind === "failure" && o.cause).toBe("timeout")
    expect(performance.now() - start).toBeLessThan(1500)
  })

  test("closed port -> unreachable", async () => {
    const port = await freePort()
    const o = await discoverModels(settingsFor(`http://127.0.0.1:${port}`))
    expect(o.kind === "failure" && o.cause).toBe("unreachable")
  })

  test("sends bearer only when a key is set, never Anthropic-Version or client_version", async () => {
    proxy = startMockProxy({ apiKey: "k" })
    await discoverModels(settingsFor(proxy.url, "k"))
    const withKey = proxy.requests.at(-1)!
    expect(withKey.headers.authorization).toBe("Bearer k")
    expect(withKey.headers["anthropic-version"]).toBeUndefined()
    expect(withKey.path).not.toContain("client_version")
    proxy.stop()

    proxy = startMockProxy({})
    await discoverModels(settingsFor(proxy.url))
    const noKey = proxy.requests.at(-1)!
    expect(noKey.headers.authorization).toBeUndefined()
    expect(noKey.path).toBe("/v1/models")
  })

  test("never throws even with a broken fetch implementation", async () => {
    const s = settingsFor("http://127.0.0.1:1")
    const o = await discoverModels(s, (() => {
      throw new TypeError("boom")
    }) as unknown as typeof fetch)
    expect(o.kind).toBe("failure")
  })
})
