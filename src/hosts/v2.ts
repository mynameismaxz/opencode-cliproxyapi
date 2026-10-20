/**
 * OpenCode 2.x adapter. Registers models through `ctx.provider.transform(editor => ...)`.
 *
 * Verified against @opencode/plugin@2.0.32 at runtime:
 *   Provider.Info.empty(id)          -> { id, name: id, activation: "auto", package: "" }
 *   Model.Info.default(provider, id) -> { id, modelID, providerID, name, capabilities: { tools: true,
 *       input: ["text","image"], output: ["text"] }, variants: [], time: { released: 0 }, cost: [],
 *       status: "active", enabled: true, limit: { context: 200000, output: 32000 } }
 *   Plugin.define(plugin)            -> plugin (identity)
 * The objects are built here as plain data so the plugin needs no runtime import of
 * @opencode/plugin (Principle V; avoids host-side module resolution of that package).
 */
import { PROVIDER_ID, PROVIDER_NAME, toModelSpecs, type ModelSpec } from "../core/mapping.js"
import type { DiscoveryOutcome } from "../core/outcome.js"
import type { Settings } from "../core/settings.js"

export const V2_RUNTIME_PACKAGE = "@opencode/ai/providers/openai-compatible"

export interface V2ProviderInfo {
  id: string
  name: string
  activation: "auto" | "enabled" | "disabled"
  package: string
  settings?: Record<string, unknown>
}

export interface V2ModelInfo {
  id: string
  modelID: string
  providerID: string
  name: string
  capabilities: { tools: boolean; input: string[]; output: string[] }
  variants: unknown[]
  time: { released: number }
  cost: unknown[]
  status: "active"
  enabled: boolean
  limit: { context: number; output: number }
}

/** Structural subset of `ProviderEditor` from @opencode/plugin that this adapter uses. */
export interface V2Editor {
  list(): readonly unknown[]
  get(providerID: string): { provider: unknown; models: ReadonlyMap<string, unknown> } | undefined
  add(input: { info: V2ProviderInfo; models: readonly V2ModelInfo[] }): void
  update(providerID: string, update: (provider: any) => void): void
  remove(providerID: string): void
  readonly models: {
    set(providerID: string, models: readonly unknown[]): void
    update(providerID: string, modelID: string, update: (model: any) => void): void
    remove(providerID: string, modelID: string): void
  }
}

function modelInfo(spec: ModelSpec): V2ModelInfo {
  return {
    id: spec.hostKey,
    modelID: spec.apiID,
    providerID: PROVIDER_ID,
    name: spec.displayName,
    capabilities: { tools: spec.toolCall, input: ["text", "image"], output: ["text"] },
    variants: [],
    time: { released: 0 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: spec.contextLimit, output: spec.outputLimit },
  }
}

/**
 * Build the synchronous, replayable transform callback. Returns undefined when nothing should
 * be registered (empty or failed discovery).
 */
export function buildV2Transform(outcome: DiscoveryOutcome, settings: Settings): ((editor: V2Editor) => void) | undefined {
  if (outcome.kind !== "success") return undefined
  const models = toModelSpecs(outcome.models).map(modelInfo)
  const providerSettings: Record<string, unknown> = { baseURL: settings.baseURL }
  if (settings.apiKey) providerSettings.apiKey = settings.apiKey
  const info: V2ProviderInfo = {
    id: PROVIDER_ID,
    name: PROVIDER_NAME,
    activation: "enabled",
    package: V2_RUNTIME_PACKAGE,
    settings: providerSettings,
  }

  return (editor) => {
    const existing = editor.get(PROVIDER_ID)
    if (!existing) {
      editor.add({ info, models })
      return
    }
    // FR-008 / FR-017: keep whatever is already registered under our id, add only missing models.
    const merged: unknown[] = [...existing.models.values()]
    for (const m of models) if (!existing.models.has(m.id)) merged.push(m)
    editor.models.set(PROVIDER_ID, merged)
  }
}
