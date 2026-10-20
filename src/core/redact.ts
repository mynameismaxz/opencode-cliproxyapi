/** Remove secrets from any text before it can reach a log, toast, or error message. */
const BEARER = /(bearer\s+)[^\s"',;}]+/gi

export function redact(text: unknown, apiKey?: string): string {
  let out: string
  try {
    out = text === undefined || text === null ? "" : String(text)
  } catch {
    return ""
  }
  if (apiKey) out = out.split(apiKey).join("<redacted>")
  return out.replace(BEARER, "$1<redacted>")
}
