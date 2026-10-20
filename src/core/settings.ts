/** Resolve the plugin's two settings: env var -> plugin option -> default. */

export const DEFAULT_BASE_URL = "http://localhost:8317"
/**
 * Bounded so startup never stalls. Must stay well under OpenCode 2.x's plugin activation window
 * (5 s for all plugins; exceeding it fails the whole CLI command with HTTP 503).
 */
export const DISCOVERY_TIMEOUT_MS = 3000
export const ENV_BASE_URL = "CLIPROXYAPI_BASE_URL"
export const ENV_API_KEY = "CLIPROXYAPI_API_KEY"

export interface Settings {
  /** Normalised OpenAI-compatible base URL, always ending in `/v1`, no trailing slash. */
  baseURL: string
  apiKey?: string
  timeoutMs: number
  modelsURL: string
}

export type SettingsResult =
  | { ok: true; settings: Settings }
  | { ok: false; cause: "invalid-settings"; value: string; apiKey?: string }

type Env = Record<string, string | undefined>

function pick(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c.trim()
  }
  return undefined
}

function normaliseBaseURL(raw: string): string | undefined {
  // Require an explicit scheme so "localhost:8317" is rejected rather than parsed as scheme "localhost:".
  if (!/^https?:\/\//i.test(raw)) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  if (!url.hostname) return undefined
  let path = url.pathname.replace(/\/+$/, "")
  if (!path.endsWith("/v1")) path = `${path}/v1`
  return `${url.protocol}//${url.host}${path}`
}

export function resolveSettings(env: Env, options?: Record<string, unknown>): SettingsResult {
  const opts = options && typeof options === "object" ? options : {}
  const apiKey = pick(env[ENV_API_KEY], opts.apiKey)
  const rawBaseURL = pick(env[ENV_BASE_URL], opts.baseURL) ?? DEFAULT_BASE_URL
  const baseURL = normaliseBaseURL(rawBaseURL)
  if (!baseURL) return { ok: false, cause: "invalid-settings", value: rawBaseURL, apiKey }
  return {
    ok: true,
    settings: { baseURL, apiKey, timeoutMs: DISCOVERY_TIMEOUT_MS, modelsURL: `${baseURL}/models` },
  }
}
