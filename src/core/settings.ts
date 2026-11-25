/** Resolve the plugin's settings: env var -> plugin option -> default. */

export const DEFAULT_BASE_URL = "http://localhost:8317"
/**
 * Bounded so startup never stalls. OpenCode 2.0.32–2.3.x required activation to finish within a
 * combined 5 s window (past it, every CLI command failed with HTTP 503). OpenCode 2.4.0+ loads
 * plugins in the background, but a 3 s bound still keeps model registration quick and makes a
 * slow proxy cheap to abandon.
 */
export const DISCOVERY_TIMEOUT_MS = 3000
export const ENV_BASE_URL = "CLIPROXYAPI_BASE_URL"
export const ENV_API_KEY = "CLIPROXYAPI_API_KEY"
export const ENV_CONTEXT_LOOKUP = "CLIPROXYAPI_CONTEXT_LOOKUP"
export const ENV_CONTEXT_URL = "CLIPROXYAPI_CONTEXT_URL"

/** Values that explicitly switch the models.dev context lookup off (case-insensitive). */
const CONTEXT_LOOKUP_OFF = new Set(["0", "false", "no", "off"])

export interface Settings {
  /** Normalised OpenAI-compatible base URL, always ending in `/v1`, no trailing slash. */
  baseURL: string
  apiKey?: string
  timeoutMs: number
  modelsURL: string
  /** Enrich registered models with context limits from models.dev. Default: on. */
  contextLookup: boolean
  /** Override for the models.dev catalog URL (mirrors, tests). Unset means the public URL. */
  contextURL?: string
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

/**
 * First recognised candidate decides; the default is on. A boolean option is taken as-is, and a
 * string counts as off only when it is one of the explicit off values (env wins over options).
 */
function pickBool(...candidates: unknown[]): boolean {
  for (const c of candidates) {
    if (typeof c === "boolean") return c
    if (typeof c === "string" && c.trim() !== "") return !CONTEXT_LOOKUP_OFF.has(c.trim().toLowerCase())
  }
  return true
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
    settings: {
      baseURL,
      apiKey,
      timeoutMs: DISCOVERY_TIMEOUT_MS,
      modelsURL: `${baseURL}/models`,
      contextLookup: pickBool(env[ENV_CONTEXT_LOOKUP], opts.contextLookup),
      contextURL: pick(env[ENV_CONTEXT_URL], opts.contextURL),
    },
  }
}
