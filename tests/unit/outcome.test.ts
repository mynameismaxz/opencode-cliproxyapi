import { describe, expect, test } from "bun:test"
import { messageFor, levelFor, type DiscoveryOutcome, FAILURE_CAUSES } from "../../src/core/outcome"

const ctx = { baseURL: "http://h:8317/v1", apiKey: "sk-secret" }

describe("DiscoveryOutcome messages", () => {
  test("success produces no message", () => {
    const o: DiscoveryOutcome = { kind: "success", models: [{ id: "a" }] }
    expect(messageFor(o, ctx)).toBeUndefined()
    expect(levelFor(o)).toBeUndefined()
  })

  test("empty is informational", () => {
    const o: DiscoveryOutcome = { kind: "empty" }
    expect(messageFor(o, ctx)).toBe("CLIProxyAPI at http://h:8317/v1 reports no models. Sign in to an upstream account in CLIProxyAPI and restart.")
    expect(levelFor(o)).toBe("info")
  })

  test("enumerates every failure cause", () => {
    expect([...FAILURE_CAUSES].sort()).toEqual(
      ["http-error", "invalid-settings", "malformed", "timeout", "unauthorized", "unreachable", "unsupported-host"].sort(),
    )
  })

  test.each([
    ["unauthorized", "HTTP 401", "CLIProxyAPI at http://h:8317/v1 rejected the API key. Set CLIPROXYAPI_API_KEY or the apiKey option."],
    ["unreachable", "connection refused", "CLIProxyAPI at http://h:8317/v1 could not be reached (connection refused). Proxied models are unavailable until restart."],
    ["timeout", "no response within 5000 ms", "CLIProxyAPI at http://h:8317/v1 could not be reached (no response within 5000 ms). Proxied models are unavailable until restart."],
    ["malformed", "body is not JSON", "CLIProxyAPI at http://h:8317/v1 returned an unexpected response (body is not JSON)."],
    ["http-error", "HTTP 500", "CLIProxyAPI at http://h:8317/v1 returned an unexpected response (HTTP 500)."],
    ["invalid-settings", "notaurl", "CLIPROXYAPI_BASE_URL / baseURL is not a valid URL: notaurl."],
    ["unsupported-host", "", "@mynameismaxz/opencode-cliproxyapi supports OpenCode 1.19.3+ and 2.x; running on an older host, using environment settings only."],
  ] as const)("%s message", (cause, detail, expected) => {
    const o: DiscoveryOutcome = { kind: "failure", cause, detail }
    expect(messageFor(o, ctx)).toBe(expected)
    expect(levelFor(o)).toBe("warn")
  })

  test("never includes the api key, even if it leaks into detail", () => {
    const o: DiscoveryOutcome = { kind: "failure", cause: "unreachable", detail: "failed with Bearer sk-secret header sk-secret" }
    const msg = messageFor(o, ctx)!
    expect(msg).not.toContain("sk-secret")
  })
})
