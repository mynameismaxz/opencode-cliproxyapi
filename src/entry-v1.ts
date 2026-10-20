/** OpenCode 1.x (1.19.3+) server plugin function. Wired into the default export in ./index. */
import type { Plugin } from "@opencode-ai/plugin"
import { discoverModels } from "./core/discovery.js"
import { levelFor, messageFor, UNSUPPORTED_HOST_MESSAGE, type DiscoveryOutcome, type MessageLevel } from "./core/outcome.js"
import { redact } from "./core/redact.js"
import { resolveSettings } from "./core/settings.js"
import { applyV1, notifyV1 } from "./hosts/v1.js"

export const v1Server: Plugin = async (input, options) => {
  return {
    config: async (cfg) => {
      let message: string | undefined
      let level: MessageLevel | undefined
      let apiKey: string | undefined
      try {
        const resolved = resolveSettings(process.env, options)
        let outcome: DiscoveryOutcome
        let baseURL: string
        if (!resolved.ok) {
          apiKey = resolved.apiKey
          baseURL = resolved.value
          outcome = { kind: "failure", cause: "invalid-settings", detail: resolved.value }
        } else {
          apiKey = resolved.settings.apiKey
          baseURL = resolved.settings.baseURL
          outcome = await discoverModels(resolved.settings)
          applyV1(cfg, outcome, resolved.settings)
        }
        message = messageFor(outcome, { baseURL, apiKey })
        level = levelFor(outcome)
        // A host below the supported floor lacks serverUrl; fold the notice into the single message.
        if (!(input as { serverUrl?: unknown }).serverUrl) {
          message = message ? `${UNSUPPORTED_HOST_MESSAGE} ${message}` : UNSUPPORTED_HOST_MESSAGE
          level = "warn"
        }
      } catch (err) {
        message = redact(`@mynameismaxz/opencode-cliproxyapi failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, apiKey)
        level = "warn"
      }
      if (message && level) await notifyV1(input.client, message, level)
    },
  }
}
