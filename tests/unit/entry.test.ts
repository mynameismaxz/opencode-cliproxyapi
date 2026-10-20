import { afterEach, describe, expect, test } from "bun:test"
import plugin from "../../src/index"
import { startMockProxy, type MockProxy } from "../mock/cliproxyapi"

let proxy: MockProxy | undefined
const savedEnv = { ...process.env }
afterEach(() => {
  proxy?.stop()
  proxy = undefined
  for (const k of ["CLIPROXYAPI_BASE_URL", "CLIPROXYAPI_API_KEY"]) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

function fakeV1Client() {
  const logs: any[] = []
  const toasts: any[] = []
  return {
    logs,
    toasts,
    client: { app: { log: async (a: any) => logs.push(a.body) }, tui: { showToast: async (a: any) => toasts.push(a.body) } },
  }
}

describe("default export shape", () => {
  test("exposes the v2 Plugin.define fields and the v1 server() entry, and nothing else", () => {
    expect(Object.keys(plugin).sort()).toEqual(["id", "server", "setup"])
    expect(plugin.id).toBe("cliproxyapi")
    expect(typeof plugin.setup).toBe("function")
    expect(typeof plugin.server).toBe("function")
  })
})

describe("v1 server entry", () => {
  test("registers models and sends no message on success", async () => {
    proxy = startMockProxy({ fixture: "models.json" })
    process.env.CLIPROXYAPI_BASE_URL = proxy.url
    const { client, logs, toasts } = fakeV1Client()
    const hooks = await plugin.server({ client, serverUrl: new URL("http://localhost:4096") } as any, undefined)
    const cfg: any = {}
    await hooks.config!(cfg)
    expect(Object.keys(cfg.provider.cliproxyapi.models)).toHaveLength(5)
    expect(logs).toEqual([])
    expect(toasts).toEqual([])
  })

  test("a host without serverUrl (below 1.19.3) gets one combined message", async () => {
    process.env.CLIPROXYAPI_BASE_URL = "http://127.0.0.1:1"
    const { client, logs } = fakeV1Client()
    const hooks = await plugin.server({ client } as any, undefined)
    await hooks.config!({} as any)
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe("warn")
    expect(logs[0].message).toStartWith("@mynameismaxz/opencode-cliproxyapi supports OpenCode 1.19.3+ and 2.x;")
    expect(logs[0].message).toContain("could not be reached")
  })

  test("never throws out of the config hook, even with a hostile config object", async () => {
    proxy = startMockProxy({ fixture: "models.json" })
    process.env.CLIPROXYAPI_BASE_URL = proxy.url
    const { client, logs } = fakeV1Client()
    const hooks = await plugin.server({ client, serverUrl: new URL("http://x") } as any, undefined)
    const hostile = Object.freeze({ provider: Object.freeze({}) })
    await expect(hooks.config!(hostile as any)).resolves.toBeUndefined()
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toContain("failed unexpectedly")
  })
})

describe("v2 setup entry", () => {
  test("calls provider.transform on success and stays silent", async () => {
    proxy = startMockProxy({ fixture: "models.json" })
    let transforms = 0
    const errors: string[] = []
    const orig = console.error
    console.error = (m: string) => errors.push(m)
    try {
      await plugin.setup({ options: { baseURL: proxy.url }, provider: { transform: async () => void transforms++ } } as any)
    } finally {
      console.error = orig
    }
    expect(transforms).toBe(1)
    expect(errors).toEqual([])
  })

  test("never throws when transform rejects; reports one redacted message", async () => {
    proxy = startMockProxy({ fixture: "models.json", apiKey: "sk-xyz" })
    const errors: string[] = []
    const orig = console.error
    console.error = (m: string) => errors.push(m)
    try {
      await plugin.setup({
        options: { baseURL: proxy.url, apiKey: "sk-xyz" },
        provider: { transform: async () => { throw new Error("boom sk-xyz") } },
      } as any)
    } finally {
      console.error = orig
    }
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("failed unexpectedly")
    expect(errors[0]).not.toContain("sk-xyz")
  })
})
