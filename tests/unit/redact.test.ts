import { describe, expect, test } from "bun:test"
import { redact } from "../../src/core/redact"

describe("redact", () => {
  test("removes every occurrence of the api key", () => {
    expect(redact("key=sk-secret and again sk-secret", "sk-secret")).toBe("key=<redacted> and again <redacted>")
  })
  test("masks Authorization bearer values even without a known key", () => {
    expect(redact("Authorization: Bearer abc.def-123 trailing", undefined)).toBe("Authorization: Bearer <redacted> trailing")
    expect(redact('{"authorization":"Bearer zzz"}', undefined)).toBe('{"authorization":"Bearer <redacted>"}')
  })
  test("is a no-op for clean text when no key is set", () => {
    expect(redact("plain message", undefined)).toBe("plain message")
  })
  test("never throws on non-string input", () => {
    expect(redact(undefined as unknown as string, "k")).toBe("")
    expect(redact(42 as unknown as string, "k")).toBe("42")
    expect(redact({ a: 1 } as unknown as string, "k")).toBe("[object Object]")
  })
  test("ignores empty api key", () => {
    expect(redact("abc", "")).toBe("abc")
  })
})
