/**
 * OpenCode 1.x adapter (1.19.3+). Registers models by mutating the config object passed to
 * the `config` hook; OpenCode reads `cfg.provider` after all plugin config hooks have run.
 */
import type { Config, PluginInput } from "@opencode-ai/plugin"
import { PROVIDER_ID, PROVIDER_NAME, toModelSpecs } from "../core/mapping.js"
import type { DiscoveryOutcome, MessageLevel } from "../core/outcome.js"
import type { Settings } from "../core/settings.js"

export const V1_RUNTIME_PACKAGE = "@ai-sdk/openai-compatible"

type ProviderConfig = NonNullable<Config["provider"]>[string]
type ModelConfig = NonNullable<ProviderConfig["models"]>[string]

/** Register discovered models under `cfg.provider.cliproxyapi`. No-op unless the outcome is success. */
export function applyV1(cfg: Config, outcome: DiscoveryOutcome, settings: Settings): void {
  if (outcome.kind !== "success") return

  const discovered: Record<string, ModelConfig> = {}
  for (const spec of toModelSpecs(outcome.models)) {
    discovered[spec.hostKey] = {
      id: spec.apiID,
      name: spec.displayName,
      limit: { context: spec.contextLimit, output: spec.outputLimit },
      tool_call: spec.toolCall,
    }
  }

  const options: Record<string, unknown> = { baseURL: settings.baseURL }
  if (settings.apiKey) options.apiKey = settings.apiKey

  cfg.provider ??= {}
  const existing = cfg.provider[PROVIDER_ID]
  // FR-008: anything the user wrote under `cliproxyapi` wins; discovery only fills gaps.
  cfg.provider[PROVIDER_ID] = {
    ...existing,
    npm: existing?.npm ?? V1_RUNTIME_PACKAGE,
    name: existing?.name ?? PROVIDER_NAME,
    options: { ...options, ...existing?.options } as ProviderConfig["options"],
    models: { ...discovered, ...existing?.models },
  }
}

/** Upper bound for each notification call; a headless host may never answer a toast request. */
export const NOTIFY_TIMEOUT_MS = 1000

function bounded(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    promise.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      () => {
        clearTimeout(timer)
        resolve()
      },
    )
  })
}

/**
 * Surface one message: the server log is the guaranteed channel, the toast is best-effort.
 * Each call is bounded so a missing TUI (e.g. `opencode models`, `opencode run`) can never
 * stall host startup. Never throws.
 */
export async function notifyV1(
  client: PluginInput["client"],
  message: string,
  level: MessageLevel,
  timeoutMs: number = NOTIFY_TIMEOUT_MS,
): Promise<void> {
  const attempt = (fn: () => Promise<unknown>) => {
    try {
      return bounded(Promise.resolve(fn()), timeoutMs)
    } catch {
      return Promise.resolve()
    }
  }
  await Promise.all([
    attempt(() => client.app.log({ body: { service: "cliproxyapi", level, message } })),
    attempt(() =>
      client.tui.showToast({
        body: { title: "CLIProxyAPI", message, variant: level === "info" ? "info" : "warning", duration: 8000 },
      }),
    ),
  ])
}
