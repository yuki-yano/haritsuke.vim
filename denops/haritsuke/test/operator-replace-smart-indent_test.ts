/**
 * Tests for operator-replace with smart indent
 * Testing smart indent functionality for replace operator
 */

import { assertEquals, describe, it } from "../deps/test.ts"
import type { VimApi } from "../vim/vim-api.ts"
import { createMockVimApi } from "../vim/vim-api.ts"
import { executeReplaceOperator } from "../core/operator-replace.ts"

describe("operator-replace with smart indent", () => {
  describe("line-wise replace with smart indent", () => {
    it("should adjust indent when replacing line with different indentation", async () => {
      // Simulate replacing a line at indent level 2 with content from indent level 4
      const commands: string[] = []
      const setregCalls: Array<{ register: string; content: string; regtype: string }> = []

      const mockVimApi: VimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0]) // start of line 2
          if (expr === "']") return Promise.resolve([0, 2, 20, 0]) // end of line 2
          if (expr === ".") return Promise.resolve([0, 2, 1, 0]) // cursor position
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "line('$')") return Promise.resolve(10)
          if (expr === "strlen(getline(10))") return Promise.resolve(20)
          if (expr === "strlen(getline(2))") return Promise.resolve(20)
          if (expr.startsWith("getreg(")) {
            // Register contains deeply indented code
            return Promise.resolve("        function deep() {\n          return true;\n        }")
          }
          if (expr.startsWith("getregtype(")) {
            return Promise.resolve("V") // line-wise
          }
          return Promise.resolve("")
        },
        getline: (line: number | string) => {
          if (line === ".") {
            return Promise.resolve("  const x = 10;") // current line has 2 spaces indent
          }
          return Promise.resolve("")
        },
        setreg: (register: string, content: string, regtype?: string) => {
          setregCalls.push({ register, content, regtype: regtype || "" })
          return Promise.resolve()
        },
      })

      // Act - with smart indent enabled
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
        smartIndent: true,
      }, mockVimApi)

      // Assert
      // Should set temporary register with adjusted indent
      const tempRegisterCall = setregCalls.find((call) => call.register !== '"')
      assertEquals(tempRegisterCall !== undefined, true, "Should use temporary register for smart indent")

      if (tempRegisterCall) {
        // Content should be adjusted from 8 spaces to 2 spaces (matching current line)
        const expectedContent = "  function deep() {\n    return true;\n  }"
        assertEquals(tempRegisterCall.content, expectedContent, "Should adjust indent to match current line")
        assertEquals(tempRegisterCall.regtype, "V", "Should maintain line-wise regtype")
      }
    })

    it("should not adjust indent when smart indent is disabled", async () => {
      const commands: string[] = []
      const setregCalls: Array<{ register: string; content: string; regtype?: string }> = []

      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
          if (expr === "']") return Promise.resolve([0, 2, 20, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "line('$')") return Promise.resolve(10)
          if (expr === "strlen(getline(10))") return Promise.resolve(20)
          if (expr === "strlen(getline(2))") return Promise.resolve(20)
          if (expr.startsWith("getreg(")) {
            return Promise.resolve("        function deep() {\n          return true;\n        }")
          }
          if (expr.startsWith("getregtype(")) {
            return Promise.resolve("V")
          }
          return Promise.resolve("")
        },
        setreg: (register: string, content: string, regtype?: string) => {
          setregCalls.push({ register, content, regtype })
          return Promise.resolve()
        },
      })

      // Act - with smart indent disabled
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
        smartIndent: false,
      }, mockVimApi)

      // Assert
      // Should not use temporary register when smart indent is disabled
      assertEquals(setregCalls.length, 0, "Should not modify any register when smart indent is disabled")
    })

    it("should not adjust indent for non-line-wise operations", async () => {
      const commands: string[] = []
      const setregCalls: Array<{ register: string; content: string; regtype?: string }> = []

      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 1, 5, 0])
          if (expr === "']") return Promise.resolve([0, 1, 10, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "line('$')") return Promise.resolve(10)
          if (expr === "strlen(getline(10))") return Promise.resolve(20)
          if (expr === "strlen(getline(1))") return Promise.resolve(20)
          if (expr.startsWith("getreg(")) {
            return Promise.resolve("test")
          }
          if (expr.startsWith("getregtype(")) {
            return Promise.resolve("v") // character-wise
          }
          return Promise.resolve("")
        },
        setreg: (register: string, content: string, regtype?: string) => {
          setregCalls.push({ register, content, regtype })
          return Promise.resolve()
        },
      })

      // Act - character-wise operation
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
        smartIndent: true,
      }, mockVimApi)

      // Assert
      // Should not use temporary register for non-line-wise operations
      assertEquals(setregCalls.length, 0, "Should not modify register for character-wise operations")
    })

    it("should handle multi-line content with mixed indentation", async () => {
      const commands: string[] = []
      const setregCalls: Array<{ register: string; content: string; regtype?: string }> = []

      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 3, 1, 0])
          if (expr === "']") return Promise.resolve([0, 3, 30, 0])
          if (expr === ".") return Promise.resolve([0, 3, 1, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "line('$')") return Promise.resolve(10)
          if (expr === "strlen(getline(10))") return Promise.resolve(20)
          if (expr === "strlen(getline(3))") return Promise.resolve(30)
          if (expr.startsWith("getreg(")) {
            // Multi-line content with varying indentation
            return Promise.resolve(
              "    if (true) {\n" +
                "      console.log('hello');\n" +
                "        // Extra indented comment\n" +
                "      return false;\n" +
                "    }",
            )
          }
          if (expr.startsWith("getregtype(")) {
            return Promise.resolve("V")
          }
          return Promise.resolve("")
        },
        getline: (line: number | string) => {
          if (line === ".") {
            return Promise.resolve("      const result = {};") // current line has 6 spaces
          }
          return Promise.resolve("")
        },
        setreg: (register: string, content: string, regtype?: string) => {
          setregCalls.push({ register, content, regtype: regtype || "" })
          return Promise.resolve()
        },
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
        smartIndent: true,
      }, mockVimApi)

      // Assert
      const tempRegisterCall = setregCalls.find((call) => call.register !== '"')
      assertEquals(tempRegisterCall !== undefined, true, "Should use temporary register")

      if (tempRegisterCall) {
        // Should adjust all lines by +2 spaces (from base 4 to 6)
        const expectedContent = "      if (true) {\n" +
          "        console.log('hello');\n" +
          "          // Extra indented comment\n" +
          "        return false;\n" +
          "      }"
        assertEquals(tempRegisterCall.content, expectedContent, "Should adjust all lines proportionally")
      }
    })

    it("should handle empty lines correctly", async () => {
      const commands: string[] = []
      const setregCalls: Array<{ register: string; content: string; regtype?: string }> = []

      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
          if (expr === "']") return Promise.resolve([0, 2, 20, 0])
          if (expr === ".") return Promise.resolve([0, 2, 1, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "line('$')") return Promise.resolve(10)
          if (expr === "strlen(getline(10))") return Promise.resolve(20)
          if (expr === "strlen(getline(2))") return Promise.resolve(20)
          if (expr.startsWith("getreg(")) {
            // Content with empty lines
            return Promise.resolve(
              "    function test() {\n" +
                "\n" + // empty line
                "      return 42;\n" +
                "    }",
            )
          }
          if (expr.startsWith("getregtype(")) {
            return Promise.resolve("V")
          }
          return Promise.resolve("")
        },
        getline: (line: number | string) => {
          if (line === ".") {
            return Promise.resolve("  // comment") // 2 spaces indent
          }
          return Promise.resolve("")
        },
        setreg: (register: string, content: string, regtype?: string) => {
          setregCalls.push({ register, content, regtype: regtype || "" })
          return Promise.resolve()
        },
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
        smartIndent: true,
      }, mockVimApi)

      // Assert
      const tempRegisterCall = setregCalls.find((call) => call.register !== '"')
      assertEquals(tempRegisterCall !== undefined, true, "Should use temporary register")

      if (tempRegisterCall) {
        // Empty lines should remain empty (no spaces added)
        const expectedContent = "  function test() {\n" +
          "\n" +
          "    return 42;\n" +
          "  }"
        assertEquals(tempRegisterCall.content, expectedContent, "Should preserve empty lines")
      }
    })
  })
})
