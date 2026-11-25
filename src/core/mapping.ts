import type { DiscoveredModel } from "./outcome.js"

/** Defaults shared by both hosts; they match OpenCode 2.x `Model.Info.default`. */
export const DEFAULT_CONTEXT_LIMIT = 200000
export const DEFAULT_OUTPUT_LIMIT = 32000

export const PROVIDER_ID = "cliproxyapi"
export const PROVIDER_NAME = "CLIProxyAPI"

/** Host-neutral registration record. Adapters consume this and nothing else. */
export interface ModelSpec {
  /** Identifier sent to CLIProxyAPI, exactly as it reported it (FR-003). */
  apiID: string
  /** Key used in the host's model map. */
  hostKey: string
  displayName: string
  contextLimit: number
  outputLimit: number
  toolCall: boolean
}

/** Limits a resolver may know for a model; either field may be missing or invalid. */
export interface ResolvedLimits {
  context?: number
  output?: number
}

/** Looks up the published limits for one discovered model, or `undefined` when unknown. */
export type LimitsResolver = (model: DiscoveredModel) => ResolvedLimits | undefined

function safeLimit(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/** Host key for an API id. Identity unless a host is shown to need otherwise (research R8). */
export function hostKeyFor(apiID: string): string {
  return apiID
}

/**
 * Build registration specs. With a `resolveLimits` (the models.dev lookup), known context/output
 * limits replace the defaults; anything missing or invalid falls back to them.
 */
export function toModelSpecs(models: DiscoveredModel[], resolveLimits?: LimitsResolver): ModelSpec[] {
  return models.map((m) => {
    const resolved = resolveLimits?.(m)
    return {
      apiID: m.id,
      hostKey: hostKeyFor(m.id),
      displayName: m.id,
      contextLimit: safeLimit(resolved?.context) ?? DEFAULT_CONTEXT_LIMIT,
      outputLimit: safeLimit(resolved?.output) ?? DEFAULT_OUTPUT_LIMIT,
      toolCall: true,
    }
  })
}
