/** OpenCode 2.x setup function. Wired into the default export in ./index. */
import type { Plugin } from "@opencode/plugin"
import { discoverModels } from "./core/discovery.js"
import { levelFor, messageFor, type DiscoveryOutcome } from "./core/outcome.js"
import { redact } from "./core/redact.js"
import { resolveSettings } from "./core/settings.js"
import { buildV2Transform } from "./hosts/v2.js"

const PREFIX = "[cliproxyapi]"

export async function v2Setup(ctx: Plugin.Context): Promise<void> {
  let apiKey: string | undefined
  try {
    const resolved = resolveSettings(process.env, ctx.options as Record<string, unknown>)
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
      const transform = buildV2Transform(outcome, resolved.settings)
      if (transform) await ctx.provider.transform(transform as unknown as Parameters<typeof ctx.provider.transform>[0])
    }
    const message = messageFor(outcome, { baseURL, apiKey })
    // OpenCode 2.x drops console.info/log from plugins; console.error is the channel that reaches
    // the user (visible with --print-logs). The message text itself carries the severity.
    if (message && levelFor(outcome)) console.error(`${PREFIX} ${message}`)
  } catch (err) {
    console.error(redact(`${PREFIX} failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, apiKey))
  }
}
