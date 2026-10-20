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

/** Host key for an API id. Identity unless a host is shown to need otherwise (research R8). */
export function hostKeyFor(apiID: string): string {
  return apiID
}

export function toModelSpecs(models: DiscoveredModel[]): ModelSpec[] {
  return models.map((m) => ({
    apiID: m.id,
    hostKey: hostKeyFor(m.id),
    displayName: m.id,
    contextLimit: DEFAULT_CONTEXT_LIMIT,
    outputLimit: DEFAULT_OUTPUT_LIMIT,
    toolCall: true,
  }))
}
