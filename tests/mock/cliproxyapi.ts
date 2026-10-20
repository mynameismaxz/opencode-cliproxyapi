/**
 * Mock CLIProxyAPI server for contract and integration tests.
 * Mirrors the subset of the real API described in
 * specs/001-cliproxyapi-model-discovery/contracts/cliproxyapi-models-api.md.
 */
import { join } from "node:path"

export const FIXTURES_DIR = join(import.meta.dir, "..", "fixtures", "cliproxyapi")

export interface MockProxyOptions {
  port?: number
  apiKey?: string
  fixture?: string
  delayMs?: number
  status?: number
}

export interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  model?: string
  stream?: boolean
}

export interface MockProxy {
  url: string
  port: number
  requests: RecordedRequest[]
  stop(): void
}

function headersOf(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  req.headers.forEach((v, k) => (out[k.toLowerCase()] = v))
  return out
}

async function readFixture(name: string): Promise<string> {
  return await Bun.file(join(FIXTURES_DIR, name)).text()
}

function chatCompletion(model: string) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }
}

function chatStream(model: string): ReadableStream {
  const created = Math.floor(Date.now() / 1000)
  const chunks = [
    { id: "chatcmpl-mock", object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }] },
    { id: "chatcmpl-mock", object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  ]
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`))
      controller.enqueue(enc.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
}

export function startMockProxy(opts: MockProxyOptions = {}): MockProxy {
  const requests: RecordedRequest[] = []
  const fixture = opts.fixture ?? "models.json"

  const authFailure = (req: Request): Response | undefined => {
    if (!opts.apiKey) return undefined
    const auth = req.headers.get("authorization")
    if (!auth) return new Response(Bun.file(join(FIXTURES_DIR, "error-401-missing.json")), { status: 401, headers: { "content-type": "application/json" } })
    if (auth !== `Bearer ${opts.apiKey}`) return new Response(Bun.file(join(FIXTURES_DIR, "error-401-invalid.json")), { status: 401, headers: { "content-type": "application/json" } })
    return undefined
  }

  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname: "127.0.0.1",
    idleTimeout: 30,
    async fetch(req) {
      const url = new URL(req.url)
      const headers = headersOf(req)

      if (url.pathname === "/healthz") return Response.json({ status: "ok" })

      if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/v1/models/")) {
        requests.push({ method: req.method, path: url.pathname + url.search, headers })
        if (opts.delayMs) await Bun.sleep(opts.delayMs)
        const denied = authFailure(req)
        if (denied) return denied
        if (opts.status && opts.status !== 200) return Response.json({ error: "mock failure" }, { status: opts.status })
        const body = await readFixture(fixture)
        return new Response(body, { status: 200, headers: { "content-type": fixture.endsWith(".json") ? "application/json" : "text/plain" } })
      }

      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        let body: any = {}
        try {
          body = await req.json()
        } catch {}
        requests.push({ method: req.method, path: url.pathname, headers, model: body?.model, stream: !!body?.stream })
        const denied = authFailure(req)
        if (denied) return denied
        if (body?.stream) return new Response(chatStream(body.model), { headers: { "content-type": "text/event-stream" } })
        return Response.json(chatCompletion(body?.model ?? "unknown"))
      }

      return Response.json({ error: "not found" }, { status: 404 })
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}`,
    port: server.port as number,
    requests,
    stop: () => server.stop(true),
  }
}
