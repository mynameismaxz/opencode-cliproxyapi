import { describe, expect, test } from "bun:test"
import { buildV2Transform, type V2Editor } from "../../src/hosts/v2"
import type { DiscoveryOutcome } from "../../src/core/outcome"
import type { Settings } from "../../src/core/settings"

const settings: Settings = { baseURL: "http://h:8317/v1", modelsURL: "http://h:8317/v1/models", timeoutMs: 5000 }
const success: DiscoveryOutcome = { kind: "success", models: [{ id: "gemini-2.5-pro" }, { id: "devin/swe-2" }] }

type Rec = { provider: any; models: Map<string, any> }

function fakeEditor(initial: Record<string, Rec> = {}) {
  const store = new Map<string, Rec>(Object.entries(initial))
  const calls: string[] = []
  const editor: V2Editor = {
    list: () => [...store.values()],
    get: (id) => store.get(id),
    add: ({ info, models }) => {
      calls.push("add")
      store.set(info.id, { provider: info, models: new Map(models.map((m: any) => [m.id, m])) })
    },
    update: () => {
      calls.push("update")
    },
    remove: (id) => {
      calls.push("remove")
      store.delete(id)
    },
    models: {
      set: (id, models) => {
        calls.push("models.set")
        const rec = store.get(id)!
        rec.models = new Map(models.map((m: any) => [m.id, m]))
      },
      update: () => {
        calls.push("models.update")
      },
      remove: () => {
        calls.push("models.remove")
      },
    },
  }
  return { editor, store, calls }
}

describe("buildV2Transform", () => {
  test("returns undefined when there is nothing to register", () => {
    expect(buildV2Transform({ kind: "empty" }, settings)).toBeUndefined()
    expect(buildV2Transform({ kind: "failure", cause: "timeout", detail: "x" }, settings)).toBeUndefined()
  })

  test("adds the provider with an OpenAI-compatible runtime and default model info", () => {
    const { editor, store, calls } = fakeEditor()
    buildV2Transform(success, { ...settings, apiKey: "k" })!(editor)
    expect(calls).toEqual(["add"])
    const rec = store.get("cliproxyapi")!
    expect(rec.provider).toEqual({
      id: "cliproxyapi",
      name: "CLIProxyAPI",
      activation: "enabled",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: "http://h:8317/v1", apiKey: "k" },
    })
    expect(rec.models.get("devin/swe-2")).toEqual({
      id: "devin/swe-2",
      modelID: "devin/swe-2",
      providerID: "cliproxyapi",
      name: "devin/swe-2",
      capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
      variants: [],
      time: { released: 0 },
      cost: [],
      status: "active",
      enabled: true,
      limit: { context: 200000, output: 32000 },
    })
  })

  test("omits apiKey from settings when unset", () => {
    const { editor, store } = fakeEditor()
    buildV2Transform(success, settings)!(editor)
    expect(store.get("cliproxyapi")!.provider.settings).toEqual({ baseURL: "http://h:8317/v1" })
  })

  test("is idempotent when replayed (FR-017)", () => {
    const { editor, store } = fakeEditor()
    const t = buildV2Transform(success, settings)!
    t(editor)
    t(editor)
    expect([...store.keys()]).toEqual(["cliproxyapi"])
    expect([...store.get("cliproxyapi")!.models.keys()]).toEqual(["gemini-2.5-pro", "devin/swe-2"])
  })
})

describe("buildV2Transform merge with an existing cliproxyapi provider (FR-008)", () => {
  test("keeps existing models and settings, adds only missing models", () => {
    const userModel = { id: "custom-x", modelID: "custom-x", name: "Custom X" }
    const userGemini = { id: "gemini-2.5-pro", modelID: "gemini-2.5-pro", name: "Pinned Gemini" }
    const userProvider = { id: "cliproxyapi", name: "Mine", settings: { baseURL: "http://user:1/v1" } }
    const { editor, store, calls } = fakeEditor({
      cliproxyapi: { provider: userProvider, models: new Map<string, any>([["custom-x", userModel], ["gemini-2.5-pro", userGemini]]) },
    })
    buildV2Transform(success, settings)!(editor)
    expect(calls).toEqual(["models.set"])
    const rec = store.get("cliproxyapi")!
    expect(rec.provider).toBe(userProvider)
    expect(rec.models.get("custom-x")).toBe(userModel)
    expect(rec.models.get("gemini-2.5-pro")).toBe(userGemini)
    expect(rec.models.get("devin/swe-2").modelID).toBe("devin/swe-2")
    expect([...rec.models.keys()]).toEqual(["custom-x", "gemini-2.5-pro", "devin/swe-2"])
  })
})
