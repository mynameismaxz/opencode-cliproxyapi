import { describe, expect, test } from "bun:test"
import { toModelSpecs, DEFAULT_CONTEXT_LIMIT, DEFAULT_OUTPUT_LIMIT } from "../../src/core/mapping"

describe("toModelSpecs", () => {
  test("maps discovered models with documented defaults, preserving order", () => {
    const specs = toModelSpecs([{ id: "gemini-2.5-pro", ownedBy: "google" }, { id: "gpt-5.5" }])
    expect(DEFAULT_CONTEXT_LIMIT).toBe(200000)
    expect(DEFAULT_OUTPUT_LIMIT).toBe(32000)
    expect(specs).toEqual([
      { apiID: "gemini-2.5-pro", hostKey: "gemini-2.5-pro", displayName: "gemini-2.5-pro", contextLimit: 200000, outputLimit: 32000, toolCall: true },
      { apiID: "gpt-5.5", hostKey: "gpt-5.5", displayName: "gpt-5.5", contextLimit: 200000, outputLimit: 32000, toolCall: true },
    ])
  })

  test("api id is never altered, even with slashes", () => {
    const [spec] = toModelSpecs([{ id: "devin/swe-2" }])
    expect(spec!.apiID).toBe("devin/swe-2")
    expect(spec!.displayName).toBe("devin/swe-2")
  })

  test("host key equals the api id, including ids containing '/' (verified on both hosts, T030)", () => {
    const [spec] = toModelSpecs([{ id: "devin/swe-2" }])
    expect(spec!.hostKey).toBe("devin/swe-2")
  })
})
