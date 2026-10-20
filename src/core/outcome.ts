import { redact } from "./redact.js"

export const FAILURE_CAUSES = [
  "invalid-settings",
  "unreachable",
  "timeout",
  "unauthorized",
  "http-error",
  "malformed",
  "unsupported-host",
] as const

export type FailureCause = (typeof FAILURE_CAUSES)[number]

/** One model as reported by CLIProxyAPI's listing, after parsing and de-duplication. */
export interface DiscoveredModel {
  id: string
  ownedBy?: string
}

export type DiscoveryOutcome =
  | { kind: "success"; models: DiscoveredModel[] }
  | { kind: "empty" }
  | { kind: "failure"; cause: FailureCause; detail: string }

export interface MessageContext {
  baseURL: string
  apiKey?: string
}

export type MessageLevel = "info" | "warn"

export const UNSUPPORTED_HOST_MESSAGE =
  "@mynameismaxz/opencode-cliproxyapi supports OpenCode 1.19.3+ and 2.x; running on an older host, using environment settings only."

/** The single user-facing message for an outcome. Always redacted. `undefined` on success. */
export function messageFor(outcome: DiscoveryOutcome, ctx: MessageContext): string | undefined {
  const at = `CLIProxyAPI at ${ctx.baseURL}`
  let message: string | undefined
  if (outcome.kind === "success") return undefined
  if (outcome.kind === "empty") {
    message = `${at} reports no models. Sign in to an upstream account in CLIProxyAPI and restart.`
  } else {
    const detail = outcome.detail
    switch (outcome.cause) {
      case "unauthorized":
        message = `${at} rejected the API key. Set CLIPROXYAPI_API_KEY or the apiKey option.`
        break
      case "unreachable":
      case "timeout":
        message = `${at} could not be reached (${detail}). Proxied models are unavailable until restart.`
        break
      case "malformed":
      case "http-error":
        message = `${at} returned an unexpected response (${detail}).`
        break
      case "invalid-settings":
        message = `CLIPROXYAPI_BASE_URL / baseURL is not a valid URL: ${detail}.`
        break
      case "unsupported-host":
        message = UNSUPPORTED_HOST_MESSAGE
        break
    }
  }
  return redact(message, ctx.apiKey)
}

export function levelFor(outcome: DiscoveryOutcome): MessageLevel | undefined {
  if (outcome.kind === "success") return undefined
  return outcome.kind === "empty" ? "info" : "warn"
}
