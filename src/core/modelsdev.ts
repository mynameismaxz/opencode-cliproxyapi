/**
 * Best-effort context-window lookup from models.dev (https://models.dev).
 *
 * CLIProxyAPI's listing carries model ids only, so models are registered with OpenCode's own
 * 200k/32k defaults. This module enriches them with the limits published on models.dev: it
 * downloads the public catalog, flattens it into `model id -> candidate entries`, and resolves
 * one entry per discovered model.
 *
 * The lookup never blocks startup for long and never produces a user-facing message: it runs in
 * parallel with proxy discovery inside the same bound, and any problem (no network, timeout,
 * unexpected body) silently falls back to the documented defaults.
 */
import type { LimitsResolver, ResolvedLimits } from "./mapping.js"
import type { DiscoveredModel } from "./outcome.js"
import type { Settings } from "./settings.js"

export const MODELSDEV_URL = "https://models.dev/api.json"
/** Bounded so startup never stalls; the compressed catalog is under 1 MB. */
export const CONTEXT_LOOKUP_TIMEOUT_MS = 2000

/**
 * Providers that publish their own models (against aggregators/gateways, which disagree on
 * limits). Used as the tie-breaker when the proxy does not report a matching `owned_by`.
 * Order matters: it is the preference order. Best-effort list against the 2026-11 catalog.
 */
const FIRST_PARTY = [
  "anthropic",
  "openai",
  "google",
  "google-vertex",
  "xai",
  "moonshotai",
  "deepseek",
  "mistral",
  "minimax",
  "alibaba",
  "zai",
  "zhipuai",
] as const

/** One models.dev entry for a model id, from a specific provider. */
export interface CatalogEntry {
  providerId: string
  context?: number
  output?: number
}

/** Flattened catalog: model id -> candidate entries across all providers. */
export type ContextIndex = Map<string, CatalogEntry[]>

export interface ContextLookupOptions {
  /** Defaults to the public models.dev catalog; overridable for mirrors and tests. */
  url?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/** Flatten the models.dev catalog into `id -> entries`, skipping malformed providers and models. */
export function buildContextIndex(catalog: unknown): ContextIndex {
  const index: ContextIndex = new Map()
  if (!catalog || typeof catalog !== "object") return index
  for (const [providerId, provider] of Object.entries(catalog as Record<string, unknown>)) {
    const models = (provider as { models?: unknown } | null)?.models
    if (!models || typeof models !== "object") continue
    for (const [modelId, model] of Object.entries(models as Record<string, unknown>)) {
      const limit = (model as { limit?: unknown } | null)?.limit
      const context = positiveInt((limit as { context?: unknown } | null)?.context)
      const output = positiveInt((limit as { output?: unknown } | null)?.output)
      if (context === undefined && output === undefined) continue
      const entry: CatalogEntry = { providerId, context, output }
      const list = index.get(modelId)
      if (list) list.push(entry)
      else index.set(modelId, [entry])
    }
  }
  return index
}

/**
 * Pick the most trustworthy entry among the candidates: an exact `owned_by` match (CLIProxyAPI
 * names the upstream account), then a first-party provider, then the most commonly reported
 * context across aggregators, then the first candidate.
 */
function pickEntry(candidates: CatalogEntry[], ownedBy?: string): CatalogEntry | undefined {
  if (ownedBy) {
    const owned = ownedBy.toLowerCase()
    const match = candidates.find((c) => c.providerId.toLowerCase() === owned)
    if (match) return match
  }
  const firstParty = FIRST_PARTY.map((id) => candidates.find((c) => c.providerId === id)).find(Boolean)
  if (firstParty) return firstParty
  const counts = new Map<number, number>()
  for (const c of candidates) {
    if (c.context !== undefined) counts.set(c.context, (counts.get(c.context) ?? 0) + 1)
  }
  let best: number | undefined
  let bestCount = 0
  for (const [context, count] of counts) {
    if (count > bestCount) {
      best = context
      bestCount = count
    }
  }
  return best === undefined ? candidates[0] : candidates.find((c) => c.context === best)
}

/**
 * Candidates for a proxy model id: the exact id first, then the part after the first `/`
 * (proxies often prefix upstream ids, e.g. `test/gpt-5-codex`).
 */
function candidatesFor(index: ContextIndex, id: string): CatalogEntry[] | undefined {
  const exact = index.get(id)
  if (exact) return exact
  const slash = id.indexOf("/")
  return slash === -1 ? undefined : index.get(id.slice(slash + 1))
}

/** Resolver over a loaded index; `undefined` means "no match, keep the documented defaults". */
export function limitsResolverFrom(index: ContextIndex): LimitsResolver {
  return (model: DiscoveredModel): ResolvedLimits | undefined => {
    const candidates = candidatesFor(index, model.id)
    const entry = candidates && pickEntry(candidates, model.ownedBy)
    return entry ? { context: entry.context, output: entry.output } : undefined
  }
}

/** Download and index the models.dev catalog. Never rejects; `undefined` on any problem. */
export async function fetchContextIndex(options: ContextLookupOptions = {}): Promise<ContextIndex | undefined> {
  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const signal = AbortSignal.timeout(options.timeoutMs ?? CONTEXT_LOOKUP_TIMEOUT_MS)
    const response = await fetchImpl(options.url ?? MODELSDEV_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    })
    if (!response.ok) return undefined
    return buildContextIndex(JSON.parse(await response.text()))
  } catch {
    return undefined
  }
}

/** Load the index when the settings allow it; never rejects. */
export function contextIndexFor(settings: Settings): Promise<ContextIndex | undefined> {
  if (!settings.contextLookup) return Promise.resolve(undefined)
  return fetchContextIndex({ url: settings.contextURL })
}
