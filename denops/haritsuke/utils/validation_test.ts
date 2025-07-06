import { assertEquals, assertThrows } from "../deps/std.ts"
import { describe, it } from "../deps/test.ts"
import { validateYankEntry, validateContentSize, calculateContentSize } from "./validation.ts"

describe("validateYankEntry", () => {
  it("should validate valid YankEntry", () => {
    const timestamp = Date.now()
    const validEntry = {
      id: "123",
      content: "test content",
      regtype: "v" as const,
      timestamp,
      size: 12,
    }

    const result = validateYankEntry(validEntry)
    assertEquals(result, validEntry)
  })

  it("should validate YankEntry with optional fields", () => {
    const validEntry = {
      id: "123",
      content: "test content",
      regtype: "V" as const,
      blockwidth: 10,
      timestamp: Date.now(),
      size: 12,
      sourceFile: "/path/to/file",
      sourceLine: 42,
      sourceFiletype: "typescript",
    }

    const result = validateYankEntry(validEntry)
    assertEquals(result, validEntry)
  })

  it("should throw on invalid object", () => {
    assertThrows(
      () => validateYankEntry(null),
      Error,
    )

    assertThrows(
      () => validateYankEntry("string"),
      Error,
    )
  })

  it("should throw on missing id", () => {
    assertThrows(
      () => validateYankEntry({ content: "test", regtype: "v", timestamp: 1, size: 4 }),
      Error,
    )
  })

  it("should throw on invalid regtype", () => {
    assertThrows(
      () => validateYankEntry({ id: "1", content: "test", regtype: "x", timestamp: 1, size: 4 }),
      Error,
    )
  })

  it("should throw on invalid timestamp", () => {
    assertThrows(
      () => validateYankEntry({ id: "1", content: "test", regtype: "v", timestamp: -1, size: 4 }),
      Error,
      "Invalid YankEntry: timestamp must be a positive number",
    )
  })

  it("should throw on invalid size", () => {
    assertThrows(
      () => validateYankEntry({ id: "1", content: "test", regtype: "v", timestamp: 1, size: -1 }),
      Error,
      "Invalid YankEntry: size must be a non-negative number",
    )
  })
})

describe("validateContentSize", () => {
  it("should return true for content within limit", () => {
    const content = "Hello, World!"
    assertEquals(validateContentSize(content, 100), true)
  })

  it("should return false for content exceeding limit", () => {
    const content = "x".repeat(101)
    assertEquals(validateContentSize(content, 100), false)
  })

  it("should handle multi-byte characters correctly", () => {
    const content = "🎉" // 4 bytes in UTF-8
    assertEquals(validateContentSize(content, 3), false)
    assertEquals(validateContentSize(content, 4), true)
  })
})

describe("calculateContentSize", () => {
  it("should calculate size for ASCII text", () => {
    assertEquals(calculateContentSize("Hello"), 5)
  })

  it("should calculate size for multi-byte characters", () => {
    assertEquals(calculateContentSize("こんにちは"), 15) // 3 bytes per character
    assertEquals(calculateContentSize("🎉"), 4) // emoji is 4 bytes
  })

  it("should handle empty string", () => {
    assertEquals(calculateContentSize(""), 0)
  })
})