/**
 * Shared integration suite. host-v1.test.ts and host-v2.test.ts call defineHostSuite() so both
 * OpenCode lines are held to identical assertions (constitution Principle II).
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { existsSync, readFileSync, readdirSync, statSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { startMockProxy, type MockProxy } from "../mock/cliproxyapi"
import { DIST, hostInstalled, pluginMessages, withHost, type HostHandle, type HostRun, type Line } from "./harness"

const FIXTURE_IDS = ["claude-sonnet-4-6", "gemini-2.5-pro", "gpt-5.5", "grok-4.7", "kimi-k2.5"]
/**
 * Allowed startup overhead (ms) when the proxy is down: discovery timeout (3 s) + v1 notify bound
 * (1 s) + run-to-run noise. OpenCode 1.19.3 cold starts vary by several seconds between identical
 * runs (observed 1–8 s), so v1 gets a larger noise allowance than v2.
 */
function startupBudget(line: Line): number {
  return 3000 + 1000 + (line === "v1" ? 4000 : 1500)
}

function chatRequests(proxy: MockProxy) {
  return proxy.requests.filter((r) => r.method === "POST" && r.path === "/v1/chat/completions")
}

function userProviderConfig(line: Line, baseURL: string): Record<string, unknown> {
  const model = { name: "user-model", limit: { context: 8000, output: 1000 } }
  return line === "v1"
    ? { provider: { usermock: { npm: "@ai-sdk/openai-compatible", name: "User Mock", options: { baseURL: `${baseURL}/v1` }, models: { "user-model": model } } } }
    : { providers: { usermock: { package: "@opencode/ai/providers/openai-compatible", name: "User Mock", settings: { baseURL: `${baseURL}/v1` }, models: { "user-model": model } } } }
}

function expectNoSecret(run: HostRun, secret: string) {
  expect(run.stdout).not.toContain(secret)
  expect(run.stderr).not.toContain(secret)
}

function expectNoConfigWrites(h: HostHandle) {
  expect(h.changedConfigFiles()).toEqual([])
}

/** Files under the isolated host dirs (excluding the user's own opencode.json) containing `secret`. */
function filesContaining(h: HostHandle, secret: string): string[] {
  const hits: string[] = []
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (st.isFile() && name !== "opencode.json" && readFileSync(p).includes(secret)) hits.push(p)
    }
  }
  for (const d of ["cfg", "data", "state", "cache", "home"]) walk(join(h.root, d))
  return hits
}

export function defineHostSuite(line: Line) {
  // Real host runs take seconds each; keep bare `bun test` from applying the 5 s default.
  setDefaultTimeout(240_000)
  const installed = hostInstalled(line)
  const d = installed ? describe : describe.skip
  if (!installed) {
    const msg = `[integration] ${line} host or dist/ missing: run scripts/install-hosts.sh and bun run build`
    // In CI a missing host must fail the run, never silently skip it (constitution PR gate 1).
    if (process.env.CI) throw new Error(msg)
    console.warn(msg)
  }

  d(`OpenCode ${line} host`, () => {
    let baselineMs = 0

    beforeAll(async () => {
      // Slower of two runs, so a single unusually fast cold start does not make the budget flaky.
      for (let i = 0; i < 2; i++) {
        const ms = await withHost(line, { noPlugin: true }, async (h) => (await h.listModels()).run.ms)
        baselineMs = Math.max(baselineMs, ms)
      }
    })

    describe("US1 discover and select", () => {
      let proxy: MockProxy
      beforeAll(() => {
        proxy = startMockProxy({ fixture: "models.json" })
      })
      afterAll(() => proxy.stop())

      test("zero-config: lists exactly the proxied models and completes a chat turn", async () => {
        await withHost(line, { env: { CLIPROXYAPI_BASE_URL: proxy.url } }, async (h) => {
          const { run, proxied } = await h.listModels()
          expect(run.exitCode).toBe(0)
          expect([...proxied].sort()).toEqual(FIXTURE_IDS)

          const before = chatRequests(proxy).length
          const chat = await h.prompt("cliproxyapi/gemini-2.5-pro")
          expect(chat.exitCode).toBe(0)
          const sent = chatRequests(proxy).slice(before)
          expect(sent.length).toBeGreaterThanOrEqual(1)
          expect(sent.every((r) => r.model === "gemini-2.5-pro")).toBe(true)
          expect(sent.every((r) => r.headers.authorization === undefined)).toBe(true)
          expectNoConfigWrites(h)
        })
      })

      test("loading the plugin twice does not duplicate models (FR-017)", async () => {
        await withHost(line, { env: { CLIPROXYAPI_BASE_URL: proxy.url } }, async (h) => {
          const alias = join(h.root, "dist-alias")
          symlinkSync(DIST, alias)
          // Rewrite the config to reference the plugin through two different paths.
          const { writeFileSync, readFileSync } = await import("node:fs")
          const cfgPath = join(h.project, "opencode.json")
          const cfg = JSON.parse(readFileSync(cfgPath, "utf8"))
          cfg[line === "v1" ? "plugin" : "plugins"] = [DIST, alias]
          writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
          const { run, proxied } = await h.listModels()
          expect(run.exitCode).toBe(0)
          expect([...proxied].sort()).toEqual(FIXTURE_IDS)
        })
      })
    })

    describe("US1 model ids containing '/' (research R8)", () => {
      let proxy: MockProxy
      beforeAll(() => {
        proxy = startMockProxy({ fixture: "models-slash-ids.json" })
      })
      afterAll(() => proxy.stop())

      test("are listed and routed with the original id", async () => {
        await withHost(line, { env: { CLIPROXYAPI_BASE_URL: proxy.url } }, async (h) => {
          const { proxied } = await h.listModels()
          expect([...proxied].sort()).toEqual(["devin/swe-2", "gemini-2.5-pro", "test/gpt-5-codex"])
          const before = chatRequests(proxy).length
          const chat = await h.prompt("cliproxyapi/devin/swe-2")
          expect(chat.exitCode).toBe(0)
          const sent = chatRequests(proxy).slice(before)
          expect(sent.length).toBeGreaterThanOrEqual(1)
          expect(sent.every((r) => r.model === "devin/swe-2")).toBe(true)
        })
      })
    })

    describe("US2 minimal connection setup", () => {
      const KEY = "test-key-9f3c"
      let proxy: MockProxy
      beforeAll(() => {
        proxy = startMockProxy({ fixture: "models.json", apiKey: KEY })
      })
      afterAll(() => proxy.stop())

      test("env-only base URL and key", async () => {
        await withHost(line, { env: { CLIPROXYAPI_BASE_URL: proxy.url, CLIPROXYAPI_API_KEY: KEY } }, async (h) => {
          const { run, proxied } = await h.listModels({ printLogs: true })
          expect([...proxied].sort()).toEqual(FIXTURE_IDS)
          expect(proxy.requests.at(-1)!.headers.authorization).toBe(`Bearer ${KEY}`)
          const before = chatRequests(proxy).length
          const chat = await h.prompt("cliproxyapi/gpt-5.5")
          expect(chat.exitCode).toBe(0)
          expect(chatRequests(proxy).slice(before).every((r) => r.headers.authorization === `Bearer ${KEY}`)).toBe(true)
          expectNoSecret(run, KEY)
          expectNoSecret(chat, KEY)
          expect(filesContaining(h, KEY)).toEqual([])
          expectNoConfigWrites(h)
        })
      })

      test("options may reference a secret with {env:VAR}", async () => {
        await withHost(
          line,
          { env: { CLIPROXY_IT_SECRET: KEY }, pluginOptions: { baseURL: proxy.url, apiKey: "{env:CLIPROXY_IT_SECRET}" } },
          async (h) => {
            const { proxied } = await h.listModels()
            expect([...proxied].sort()).toEqual(FIXTURE_IDS)
            expect(proxy.requests.at(-1)!.headers.authorization).toBe(`Bearer ${KEY}`)
          },
        )
      })

      test("options-only base URL and key", async () => {
        await withHost(line, { pluginOptions: { baseURL: proxy.url, apiKey: KEY } }, async (h) => {
          const { proxied } = await h.listModels()
          expect([...proxied].sort()).toEqual(FIXTURE_IDS)
          expect(proxy.requests.at(-1)!.headers.authorization).toBe(`Bearer ${KEY}`)
        })
      })

      test("env wins over options", async () => {
        await withHost(
          line,
          { env: { CLIPROXYAPI_BASE_URL: proxy.url, CLIPROXYAPI_API_KEY: KEY }, pluginOptions: { baseURL: "http://127.0.0.1:1", apiKey: "wrong" } },
          async (h) => {
            const { proxied } = await h.listModels()
            expect([...proxied].sort()).toEqual(FIXTURE_IDS)
          },
        )
      })

      test("missing key: no models, one warning naming the setting, host unaffected", async () => {
        await withHost(line, { env: { CLIPROXYAPI_BASE_URL: proxy.url } }, async (h) => {
          const { run, proxied, all } = await h.listModels({ printLogs: true })
          expect(run.exitCode).toBe(0)
          expect(proxied).toEqual([])
          expect(all.length).toBeGreaterThan(0)
          const msgs = pluginMessages(run)
          expect(msgs.length).toBe(1)
          expect(msgs[0]).toContain("rejected the API key")
          expect(msgs[0]).toContain("CLIPROXYAPI_API_KEY")
          expectNoSecret(run, KEY)
        })
      })
    })

    describe("US3 graceful behaviour when the proxy is unavailable", () => {
      let user: MockProxy
      beforeAll(() => {
        user = startMockProxy({ fixture: "models.json" })
      })
      afterAll(() => user.stop())

      async function scenario(env: Record<string, string>, expectText: string) {
        await withHost(line, { env, extraConfig: userProviderConfig(line, user.url) }, async (h) => {
          const { run, proxied } = await h.listModels({ printLogs: true })
          expect(run.exitCode).toBe(0)
          expect(proxied).toEqual([])
          expect(run.ms).toBeLessThanOrEqual(baselineMs + startupBudget(line))
          const msgs = pluginMessages(run)
          expect(msgs.length).toBe(1)
          expect(msgs[0]).toContain(expectText)

          const before = chatRequests(user).length
          const chat = await h.prompt("usermock/user-model")
          expect(chat.exitCode).toBe(0)
          expect(chatRequests(user).slice(before).some((r) => r.model === "user-model")).toBe(true)
          expectNoConfigWrites(h)
        })
      }

      test("proxy unreachable", async () => {
        await scenario({ CLIPROXYAPI_BASE_URL: "http://127.0.0.1:1" }, "could not be reached")
      })

      test("malformed response", async () => {
        const p = startMockProxy({ fixture: "malformed.txt" })
        try {
          await scenario({ CLIPROXYAPI_BASE_URL: p.url }, "unexpected response")
        } finally {
          p.stop()
        }
      })

      test("empty model list is informational", async () => {
        const p = startMockProxy({ fixture: "models-empty.json" })
        try {
          await scenario({ CLIPROXYAPI_BASE_URL: p.url }, "reports no models")
        } finally {
          p.stop()
        }
      })

      test("slow proxy is cut off by the discovery timeout", async () => {
        const p = startMockProxy({ fixture: "models.json", delayMs: 7000 })
        try {
          await scenario({ CLIPROXYAPI_BASE_URL: p.url }, "could not be reached (no response within 3000 ms)")
        } finally {
          p.stop()
        }
      })

      test("invalid base URL", async () => {
        await scenario({ CLIPROXYAPI_BASE_URL: "notaurl" }, "is not a valid URL: notaurl")
      })
    })
  })
}
