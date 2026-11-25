import { afterEach, describe, expect, test } from "bun:test"
import {
  buildContextIndex,
  contextIndexFor,
  fetchContextIndex,
  limitsResolverFrom,
  CONTEXT_LOOKUP_TIMEOUT_MS,
  MODELSDEV_URL,
} from "../../src/core/modelsdev"

/** Minimal models.dev-shaped catalog used across the tests. */
const CATALOG = {
  google: {
    models: {
      "gemini-2.5-pro": { id: "gemini-2.5-pro", limit: { context: 1048576, output: 65536 } },
      "gemini-nolimit": { id: "gemini-nolimit" },
    },
  },
  anthropic: {
    models: {
      "claude-sonnet-4-6": { id: "claude-sonnet-4-6", limit: { context: 200000, output: 64000 } },
    },
  },
  aggregator: {
    models: {
      "claude-sonnet-4-6": { id: "claude-sonnet-4-6", limit: { context: 1000000, output: 128000 } },
      "kimi-k2.5": { id: "kimi-k2.5", limit: { context: 262144, output: 262144 } },
    },
  },
  "azure-cognitive-services": {
    models: {
      "gpt-5-codex": { id: "gpt-5-codex", limit: { context: 400000, output: 128000 } },
    },
  },
  openrouter: {
    models: {
      "moonshotai/kimi-k2.7-code": { id: "moonshotai/kimi-k2.7-code", limit: { context: 262144, output: 262144 } },
      broken: { limit: { context: "huge" } },
      "zero-context": { limit: { context: 0 } },
      negative: { limit: { context: -5, output: 10 } },
    },
  },
}

describe("buildContextIndex", () => {
  test("flattens providers into id -> entries, dropping entries without sane limits", () => {
    const index = buildContextIndex(CATALOG)
    expect([...index.keys()].sort()).toEqual([
      "claude-sonnet-4-6",
      "gemini-2.5-pro",
      "gpt-5-codex",
      "kimi-k2.5",
      "moonshotai/kimi-k2.7-code",
      "negative", // context invalid, output sane: kept with the usable field
    ])
    expect(index.get("gemini-2.5-pro")).toEqual([{ providerId: "google", context: 1048576, output: 65536 }])
    expect(index.get("claude-sonnet-4-6")).toEqual([
      { providerId: "anthropic", context: 200000, output: 64000 },
      { providerId: "aggregator", context: 1000000, output: 128000 },
    ])
  })

  test("entries carrying only one of the two limits are still indexed", () => {
    const index = buildContextIndex({ p: { models: { m: { limit: { output: 4096 } } } } })
    expect(index.get("m")).toEqual([{ providerId: "p", context: undefined, output: 4096 }])
  })

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["number", 42],
    ["empty object", {}],
    ["provider without models", { p: {} }],
    ["models not an object", { p: { models: "nope" } }],
    ["model entries not objects", { p: { models: { m: null, n: 3 } } }],
  ])("tolerates a %s catalog", (_name, input) => {
    expect(buildContextIndex(input).size).toBe(0)
  })
})

describe("limitsResolverFrom", () => {
  const resolve = limitsResolverFrom(buildContextIndex(CATALOG))

  test("no match -> undefined, keeping the documented defaults", () => {
    expect(resolve({ id: "devin/swe-2" })).toBeUndefined()
    expect(resolve({ id: "totally-unknown" })).toBeUndefined()
  })

  test("exact id match", () => {
    expect(resolve({ id: "gemini-2.5-pro" })).toEqual({ context: 1048576, output: 65536 })
  })

  test("suffix after the first '/' matches when the exact id is absent", () => {
    expect(resolve({ id: "test/gpt-5-codex", ownedBy: "openai" })).toEqual({ context: 400000, output: 128000 })
  })

  test("the exact id wins over a suffix match", () => {
    // `moonshotai/kimi-k2.7-code` exists verbatim; the resolver must not second-guess it.
    expect(resolve({ id: "moonshotai/kimi-k2.7-code" })).toEqual({ context: 262144, output: 262144 })
  })

  test("an owned_by match beats first-party and aggregators (case-insensitive)", () => {
    expect(resolve({ id: "claude-sonnet-4-6", ownedBy: "Anthropic" })).toEqual({ context: 200000, output: 64000 })
  })

  test("a first-party provider beats aggregators when owned_by does not match", () => {
    expect(resolve({ id: "claude-sonnet-4-6", ownedBy: "custom" })).toEqual({ context: 200000, output: 64000 })
    expect(resolve({ id: "claude-sonnet-4-6" })).toEqual({ context: 200000, output: 64000 })
  })

  test("aggregator-only ids resolve to the most commonly reported context", () => {
    expect(resolve({ id: "kimi-k2.5", ownedBy: "moonshot" })).toEqual({ context: 262144, output: 262144 })
  })

  test("malformed entries never surface", () => {
    expect(resolve({ id: "broken" })).toBeUndefined()
    expect(resolve({ id: "zero-context" })).toBeUndefined()
    expect(resolve({ id: "gemini-nolimit" })).toBeUndefined()
    // context invalid but output sane: the entry survives with the usable field only
    expect(resolve({ id: "negative" })).toEqual({ context: undefined, output: 10 })
  })
})

describe("fetchContextIndex", () => {
  const okFetch = (body: unknown, status = 200): typeof fetch =>
    (() => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }))) as typeof fetch

  test("fetches the public catalog URL, bounded, and indexes the body", async () => {
    let seenURL = ""
    const fetchImpl = ((url: any) => {
      seenURL = String(url)
      return Promise.resolve(new Response(JSON.stringify(CATALOG)))
    }) as unknown as typeof fetch
    const index = await fetchContextIndex({ fetchImpl })
    expect(seenURL).toBe(MODELSDEV_URL)
    expect(index?.get("gemini-2.5-pro")).toEqual([{ providerId: "google", context: 1048576, output: 65536 }])
    expect(CONTEXT_LOOKUP_TIMEOUT_MS).toBe(2000)
  })

  test("honours a custom URL (mirrors, tests)", async () => {
    let seenURL = ""
    const fetchImpl = ((url: any) => {
      seenURL = String(url)
      return Promise.resolve(new Response(JSON.stringify(CATALOG)))
    }) as unknown as typeof fetch
    await fetchContextIndex({ url: "http://127.0.0.1:1/catalog.json", fetchImpl })
    expect(seenURL).toBe("http://127.0.0.1:1/catalog.json")
  })

  test.each([
    ["http error", okFetch({}, 500)],
    ["not json", okFetch("<html>")],
    ["rejected", (() => Promise.reject(new Error("down"))) as unknown as typeof fetch],
    ["thrown", (() => {
      throw new TypeError("boom")
    }) as unknown as typeof fetch],
  ])("%s -> undefined, never rejects", async (_name, fetchImpl) => {
    expect(await fetchContextIndex({ fetchImpl })).toBeUndefined()
  })

  test("slow response -> undefined within the bound", async () => {
    // A fetch implementation that honours the abort signal, like the platform one does.
    const fetchImpl = ((_url: any, init: { signal: AbortSignal }) =>
      new Promise((resolve) => {
        init.signal.addEventListener("abort", () => resolve(new Response("late", { status: 500 })))
        setTimeout(() => resolve(new Response("{}")), 500)
      })) as unknown as typeof fetch
    const start = performance.now()
    expect(await fetchContextIndex({ fetchImpl, timeoutMs: 50 })).toBeUndefined()
    expect(performance.now() - start).toBeLessThan(400)
  })
})

describe("contextIndexFor", () => {
  const settings = (over: Record<string, unknown>) =>
    ({ baseURL: "http://h:8317/v1", modelsURL: "http://h:8317/v1/models", timeoutMs: 3000, ...over }) as Parameters<typeof contextIndexFor>[0]

  let server: ReturnType<typeof Bun.serve> | undefined
  afterEach(() => {
    server?.stop(true)
    server = undefined
  })

  test("disabled by settings -> undefined without any fetch", async () => {
    const index = await contextIndexFor(settings({ contextLookup: false }))
    expect(index).toBeUndefined()
  })

  test("enabled -> loads the catalog from the settings URL override", async () => {
    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response(JSON.stringify(CATALOG), { headers: { "content-type": "application/json" } }),
    })
    const url = `http://127.0.0.1:${server.port}/api.json`
    const index = await contextIndexFor(settings({ contextLookup: true, contextURL: url }))
    expect(index?.get("gemini-2.5-pro")).toEqual([{ providerId: "google", context: 1048576, output: 65536 }])
  })

  test("enabled with an unreachable URL -> undefined (best effort, never rejects)", async () => {
    server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("nope", { status: 500 }) })
    const url = `http://127.0.0.1:${server.port}/api.json`
    const index = await contextIndexFor(settings({ contextLookup: true, contextURL: url }))
    expect(index).toBeUndefined()
  })
})
