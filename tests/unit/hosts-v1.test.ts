import { describe, expect, test } from "bun:test"
import { applyV1 } from "../../src/hosts/v1"
import type { DiscoveryOutcome } from "../../src/core/outcome"
import type { Settings } from "../../src/core/settings"

const settings: Settings = { baseURL: "http://h:8317/v1", modelsURL: "http://h:8317/v1/models", timeoutMs: 5000 }
const withKey: Settings = { ...settings, apiKey: "k" }
const success: DiscoveryOutcome = { kind: "success", models: [{ id: "gemini-2.5-pro" }, { id: "gpt-5.5" }] }

const model = (id: string) => ({ id, name: id, limit: { context: 200000, output: 32000 }, tool_call: true })

describe("applyV1", () => {
  test("registers the cliproxyapi provider on success", () => {
    const cfg: any = {}
    applyV1(cfg, success, settings)
    expect(cfg.provider.cliproxyapi).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "CLIProxyAPI",
      options: { baseURL: "http://h:8317/v1" },
      models: { "gemini-2.5-pro": model("gemini-2.5-pro"), "gpt-5.5": model("gpt-5.5") },
    })
  })

  test("includes apiKey only when set", () => {
    const cfg: any = {}
    applyV1(cfg, success, withKey)
    expect(cfg.provider.cliproxyapi.options).toEqual({ baseURL: "http://h:8317/v1", apiKey: "k" })
  })

  test("leaves other providers untouched", () => {
    const other = { npm: "@ai-sdk/openai-compatible", name: "Mine", options: { baseURL: "http://x" }, models: { m: { name: "m" } } }
    const cfg: any = { provider: { mine: structuredClone(other) }, model: "mine/m" }
    applyV1(cfg, success, settings)
    expect(cfg.provider.mine).toEqual(other)
    expect(cfg.model).toBe("mine/m")
  })

  test("is idempotent (FR-017)", () => {
    const cfg: any = {}
    applyV1(cfg, success, settings)
    const once = structuredClone(cfg)
    applyV1(cfg, success, settings)
    expect(cfg).toEqual(once)
    expect(Object.keys(cfg.provider)).toEqual(["cliproxyapi"])
  })

  test.each([
    ["empty", { kind: "empty" } as DiscoveryOutcome],
    ["failure", { kind: "failure", cause: "unreachable", detail: "x" } as DiscoveryOutcome],
  ])("does not touch the config on %s", (_name, outcome) => {
    const cfg: any = { provider: { mine: { name: "Mine" } }, theme: "x" }
    const before = structuredClone(cfg)
    applyV1(cfg, outcome, settings)
    expect(cfg).toEqual(before)
  })
})

import { notifyV1 } from "../../src/hosts/v1"

describe("notifyV1", () => {
  const never = () => new Promise(() => {})

  test("returns within the bound even when the toast never resolves (headless host)", async () => {
    const calls: any[] = []
    const client: any = {
      app: { log: async (a: any) => calls.push(["log", a]) },
      tui: { showToast: () => never() },
    }
    const t0 = performance.now()
    await notifyV1(client, "msg", "warn", 50)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(calls).toEqual([["log", { body: { service: "cliproxyapi", level: "warn", message: "msg" } }]])
  })

  test("never throws when the client throws synchronously or rejects", async () => {
    const client: any = {
      app: { log: () => { throw new Error("sync") } },
      tui: { showToast: () => Promise.reject(new Error("async")) },
    }
    await expect(notifyV1(client, "m", "info", 50)).resolves.toBeUndefined()
  })

  test("uses the info variant for informational messages and warning otherwise", async () => {
    const toasts: any[] = []
    const client: any = { app: { log: async () => {} }, tui: { showToast: async (a: any) => toasts.push(a.body.variant) } }
    await notifyV1(client, "m", "info", 50)
    await notifyV1(client, "m", "warn", 50)
    expect(toasts).toEqual(["info", "warning"])
  })
})

describe("applyV1 merge with a user-owned cliproxyapi provider (FR-008)", () => {
  test("user options and models win; discovery only fills gaps", () => {
    const cfg: any = {
      provider: {
        cliproxyapi: {
          name: "My Proxy",
          options: { baseURL: "http://user-set:9999/v1", headers: { "x-team": "a" } },
          models: { "custom-x": { name: "Custom X" }, "gpt-5.5": { name: "GPT 5.5 (pinned)", limit: { context: 1, output: 1 } } },
        },
      },
    }
    applyV1(cfg, success, withKey)
    const p = cfg.provider.cliproxyapi
    expect(p.name).toBe("My Proxy")
    expect(p.npm).toBe("@ai-sdk/openai-compatible")
    expect(p.options).toEqual({ baseURL: "http://user-set:9999/v1", apiKey: "k", headers: { "x-team": "a" } })
    expect(p.models["custom-x"]).toEqual({ name: "Custom X" })
    expect(p.models["gpt-5.5"]).toEqual({ name: "GPT 5.5 (pinned)", limit: { context: 1, output: 1 } })
    expect(p.models["gemini-2.5-pro"]).toEqual(model("gemini-2.5-pro"))
  })
})
