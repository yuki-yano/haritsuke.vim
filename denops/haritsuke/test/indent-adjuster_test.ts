import { assertEquals, describe, it } from "../deps/test.ts"
import { adjustContentIndentSmart, adjustIndent, detectMinIndent, getIndentText } from "../utils/indent-adjuster.ts"
import { createMockVimApi } from "../vim/vim-api.ts"

describe("indent-adjuster", () => {
  describe("detectMinIndent", () => {
    it("should detect minimum indent from lines", () => {
      const lines = [
        "    function test() {",
        "      const a = 1;",
        "      if (a) {",
        "        console.log(a);",
        "      }",
        "    }",
      ]
      assertEquals(detectMinIndent(lines), "    ")
    })

    it("should ignore empty lines", () => {
      const lines = [
        "    function test() {",
        "",
        "      const a = 1;",
        "",
        "    }",
      ]
      assertEquals(detectMinIndent(lines), "    ")
    })

    it("should return empty string when no indent", () => {
      const lines = [
        "function test() {",
        "const a = 1;",
        "}",
      ]
      assertEquals(detectMinIndent(lines), "")
    })

    it("should handle mixed tabs and spaces", () => {
      const lines = [
        "\t\tfunction test() {",
        "\t\t\tconst a = 1;",
        "\t\t}",
      ]
      assertEquals(detectMinIndent(lines), "\t\t")
    })
  })

  describe("getIndentText", () => {
    it("should generate indent text with spaces", () => {
      assertEquals(getIndentText(2, 4, false), "        ")
    })

    it("should generate indent text with tabs", () => {
      assertEquals(getIndentText(2, 4, true), "\t\t")
    })

    it("should handle zero indent", () => {
      assertEquals(getIndentText(0, 4, false), "")
    })
  })

  describe("adjustIndent", () => {
    it("should adjust indent for pasted lines", () => {
      const lines = [
        "    function test() {",
        "      const a = 1;",
        "      return a;",
        "    }",
      ]
      const baseIndent = "  "
      const result = adjustIndent(lines, baseIndent)
      assertEquals(result, [
        "  function test() {",
        "    const a = 1;",
        "    return a;",
        "  }",
      ])
    })

    it("should preserve relative indentation", () => {
      const lines = [
        "  if (condition) {",
        "    doSomething();",
        "      .then(() => {",
        "        console.log('done');",
        "      });",
        "  }",
      ]
      const baseIndent = "    "
      const result = adjustIndent(lines, baseIndent)
      assertEquals(result, [
        "    if (condition) {",
        "      doSomething();",
        "        .then(() => {",
        "          console.log('done');",
        "        });",
        "    }",
      ])
    })

    it("should handle empty lines correctly", () => {
      const lines = [
        "    function test() {",
        "",
        "      const a = 1;",
        "",
        "    }",
      ]
      const baseIndent = ""
      const result = adjustIndent(lines, baseIndent)
      assertEquals(result, [
        "function test() {",
        "",
        "  const a = 1;",
        "",
        "}",
      ])
    })

    it("should handle lines with no initial indent", () => {
      const lines = [
        "function test() {",
        "  const a = 1;",
        "}",
      ]
      const baseIndent = "  "
      const result = adjustIndent(lines, baseIndent)
      assertEquals(result, [
        "  function test() {",
        "    const a = 1;",
        "  }",
      ])
    })
  })

  describe("adjustContentIndentSmart", () => {
    it("should adjust content based on current line indent", async () => {
      const mockVimApi = createMockVimApi({
        getline: () => Promise.resolve("  const result = "),
        line: () => Promise.resolve(10),
      })

      const content = "function test() {\n  return 42;\n}"
      const pasteInfo = { mode: "p" as const, count: 1, register: '"' }

      const result = await adjustContentIndentSmart(content, pasteInfo, mockVimApi)

      assertEquals(result, "  function test() {\n    return 42;\n  }")
    })

    it("should calculate indent when current line has no indent and mode is p", async () => {
      const mockVimApi = createMockVimApi({
        getline: () => Promise.resolve(""), // No indent on current line
        line: () => Promise.resolve(10),
        getwinvar: (_, name: string) => {
          if (name === "&shiftwidth") return Promise.resolve(2)
          if (name === "&expandtab") return Promise.resolve(1)
          return Promise.resolve(0)
        },
        getbufvar: (_, name: string) => {
          if (name === "&indentexpr") return Promise.resolve("") // No indentexpr
          return Promise.resolve(0)
        },
        cmd: () => Promise.resolve(),
        eval: () => Promise.resolve(0),
      })

      const content = "function test() {\n  return 42;\n}"
      const pasteInfo = { mode: "p" as const, count: 1, register: '"' }

      const result = await adjustContentIndentSmart(content, pasteInfo, mockVimApi)

      // Should keep original content when no indent is calculated
      assertEquals(result, "function test() {\n  return 42;\n}")
    })

    it("should use indentexpr when available", async () => {
      const mockVimApi = createMockVimApi({
        getline: () => Promise.resolve(""), // No indent on current line
        line: () => Promise.resolve(10),
        getwinvar: (_, name: string) => {
          if (name === "&shiftwidth") return Promise.resolve(4)
          if (name === "&expandtab") return Promise.resolve(1)
          return Promise.resolve(0)
        },
        getbufvar: (_, name: string) => {
          if (name === "&indentexpr") return Promise.resolve("GetVimIndent()")
          return Promise.resolve(0)
        },
        cmd: () => Promise.resolve(),
        eval: (expr: string) => {
          if (expr.includes("indent(")) return Promise.resolve(8) // 2 levels * 4 spaces
          return Promise.resolve(0)
        },
      })

      const content = "function test() {\n  return 42;\n}"
      const pasteInfo = { mode: "p" as const, count: 1, register: '"' }

      const result = await adjustContentIndentSmart(content, pasteInfo, mockVimApi)

      assertEquals(result, "        function test() {\n          return 42;\n        }")
    })

    it("should use tabs when expandtab is off", async () => {
      const mockVimApi = createMockVimApi({
        getline: () => Promise.resolve(""), // No indent on current line
        line: () => Promise.resolve(10),
        getwinvar: (_, name: string) => {
          if (name === "&shiftwidth") return Promise.resolve(4)
          if (name === "&expandtab") return Promise.resolve(0) // Use tabs
          return Promise.resolve(0)
        },
        getbufvar: (_, name: string) => {
          if (name === "&indentexpr") return Promise.resolve("GetVimIndent()")
          return Promise.resolve(0)
        },
        cmd: () => Promise.resolve(),
        eval: (expr: string) => {
          if (expr.includes("indent(")) return Promise.resolve(8) // 2 levels
          return Promise.resolve(0)
        },
      })

      const content = "function test() {\n  return 42;\n}"
      const pasteInfo = { mode: "p" as const, count: 1, register: '"' }

      const result = await adjustContentIndentSmart(content, pasteInfo, mockVimApi)

      assertEquals(result, "\t\tfunction test() {\n\t\t  return 42;\n\t\t}")
    })

    it("should return original content on error", async () => {
      const mockVimApi = createMockVimApi({
        getline: () => Promise.reject(new Error("Test error")),
      })

      const content = "function test() {\n  return 42;\n}"
      const pasteInfo = { mode: "p" as const, count: 1, register: '"' }

      const result = await adjustContentIndentSmart(content, pasteInfo, mockVimApi)

      // Should return original content on error
      assertEquals(result, content)
    })

    it("should not adjust when mode is not p and current line has no indent", async () => {
      const mockVimApi = createMockVimApi({
        getline: () => Promise.resolve(""), // No indent on current line
        line: () => Promise.resolve(10),
      })

      const content = "function test() {\n  return 42;\n}"
      const pasteInfo = { mode: "P" as const, count: 1, register: '"' } // Mode is P, not p

      const result = await adjustContentIndentSmart(content, pasteInfo, mockVimApi)

      // Should adjust based on empty indent (remove all indent)
      assertEquals(result, "function test() {\n  return 42;\n}")
    })
  })
})
