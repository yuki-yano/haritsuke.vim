import { assertEquals, describe, it } from "./deps/test.ts"
import { parseRegtype } from "./utils.ts"

describe("utils", () => {
  describe("parseRegtype", () => {
    it("should parse characterwise register type 'v'", () => {
      assertEquals(parseRegtype("v"), "v")
    })

    it("should parse linewise register type 'V'", () => {
      assertEquals(parseRegtype("V"), "V")
    })

    it("should parse linewise register type with control character", () => {
      assertEquals(parseRegtype("\x56"), "V") // \x56 is ASCII 'V'
    })

    it("should parse blockwise register type 'b'", () => {
      assertEquals(parseRegtype("b"), "b")
    })

    it("should parse blockwise register type with control character prefix", () => {
      assertEquals(parseRegtype("\x16"), "b") // ^V (Ctrl-V)
      assertEquals(parseRegtype("\x161"), "b") // ^V followed by other chars
      assertEquals(parseRegtype("\x16abc"), "b")
    })

    it("should default to characterwise for unknown types", () => {
      assertEquals(parseRegtype("x"), "v")
      assertEquals(parseRegtype(""), "v")
      assertEquals(parseRegtype("unknown"), "v")
      assertEquals(parseRegtype("123"), "v")
    })

    it("should handle various edge cases", () => {
      // Mixed case should not match
      assertEquals(parseRegtype("v"), "v")
      assertEquals(parseRegtype("V"), "V")

      // Lowercase 'v' should be characterwise
      assertEquals(parseRegtype("v"), "v")

      // Any string starting with \x16 should be blockwise
      assertEquals(parseRegtype("\x16V"), "b")
      assertEquals(parseRegtype("\x16v"), "b")

      // Empty or null-like values default to characterwise
      assertEquals(parseRegtype(""), "v")
    })
  })
})
