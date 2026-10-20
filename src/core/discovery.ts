import type { DiscoveredModel, DiscoveryOutcome, FailureCause } from "./outcome.js"
import { redact } from "./redact.js"
import type { Settings } from "./settings.js"

function fail(cause: FailureCause, detail: string, settings: Settings): DiscoveryOutcome {
  return { kind: "failure", cause, detail: redact(detail, settings.apiKey) }
}

function describeNetworkError(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown; name?: unknown } | undefined
  const code = typeof e?.code === "string" ? e.code : undefined
  if (code === "ConnectionRefused" || code === "ECONNREFUSED") return "connection refused"
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "host not found"
  if (code) return code
  if (typeof e?.message === "string" && e.message) return e.message
  return "network error"
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | undefined)?.name
  return name === "TimeoutError" || name === "AbortError"
}

function parseListing(body: string): DiscoveredModel[] | "not-json" | "no-data" {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return "not-json"
  }
  const data = (json as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return "no-data"
  const seen = new Set<string>()
  const models: DiscoveredModel[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue
    const id = (entry as { id?: unknown }).id
    if (typeof id !== "string" || id === "" || seen.has(id)) continue
    seen.add(id)
    const ownedBy = (entry as { owned_by?: unknown }).owned_by
    models.push(typeof ownedBy === "string" && ownedBy ? { id, ownedBy } : { id })
  }
  return models
}

/** Query CLIProxyAPI's OpenAI-compatible model listing. Never throws. */
export async function discoverModels(settings: Settings, fetchImpl: typeof fetch = fetch): Promise<DiscoveryOutcome> {
  try {
    const headers: Record<string, string> = { accept: "application/json" }
    if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`

    let response: Response
    let body: string
    try {
      // The timeout covers both headers and body so a stalled stream cannot block startup.
      const signal = AbortSignal.timeout(settings.timeoutMs)
      response = await fetchImpl(settings.modelsURL, { method: "GET", headers, signal })
      body = await response.text()
    } catch (err) {
      if (isTimeout(err)) return fail("timeout", `no response within ${settings.timeoutMs} ms`, settings)
      return fail("unreachable", describeNetworkError(err), settings)
    }

    if (response.status === 401 || response.status === 403) return fail("unauthorized", `HTTP ${response.status}`, settings)
    if (!response.ok) return fail("http-error", `HTTP ${response.status}`, settings)

    const parsed = parseListing(body)
    if (parsed === "not-json") return fail("malformed", "body is not JSON", settings)
    if (parsed === "no-data") return fail("malformed", "no data array in response", settings)
    return parsed.length === 0 ? { kind: "empty" } : { kind: "success", models: parsed }
  } catch (err) {
    return fail("unreachable", describeNetworkError(err), settings)
  }
}
