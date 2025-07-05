import { assertEquals, describe, it } from "./deps/test.ts"
import type { Denops } from "./deps/denops.ts"
import { createMockVimApi } from "./vim-api.ts"
import { executeReplaceOperator } from "./operator-replace.ts"

describe("executeReplaceOperator", () => {
  describe("character-wise replace", () => {
    it("should delete selected text and paste from register", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Simulating "banana" selection in "apple banana cherry"
          if (expr === "'[") return Promise.resolve([0, 1, 7, 0]) // start of "banana"
          if (expr === "']") return Promise.resolve([0, 1, 12, 0]) // end of "banana"
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getreg(")) return Promise.resolve("test content")
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x164") // block type with width 4
          if (expr === "getline('.')") return Promise.resolve("test line")
          if (expr === "col('.')") return Promise.resolve(5)
          return Promise.resolve("")
        },
      })

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(
        commands[0],
        'silent! normal! 1G7|v1G12|"_d',
        "Should delete region",
      )
      assertEquals(commands[1], "set undolevels=1000", "Should reset undolevels")
      assertEquals(commands[2], 'silent! normal! ""p', "Should paste")
    })

    it("should handle single character replace", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Single character selection
          if (expr === "'[") return Promise.resolve([0, 1, 5, 0])
          if (expr === "']") return Promise.resolve([0, 1, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getreg(")) return Promise.resolve("test content")
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x164")
          if (expr === "getline('.')") return Promise.resolve("test line")
          if (expr === "col('.')") return Promise.resolve(5)
          return Promise.resolve("")
        },
      })

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(
        commands[0],
        'silent! normal! 1G5|v1G5|"_d',
        "Should delete single character",
      )
      assertEquals(commands[1], "set undolevels=1000", "Should reset undolevels")
      assertEquals(commands[2], 'silent! normal! ""p', "Should paste single character")
    })

    it("should use named register", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 1, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getreg(")) return Promise.resolve("test content")
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x164")
          if (expr === "getline('.')") return Promise.resolve("test line")
          if (expr === "col('.')") return Promise.resolve(5)
          return Promise.resolve("")
        },
      })

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
        motionWise: "char",
        register: "a",
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(commands[0], 'silent! normal! 1G1|v1G5|"_d', "Should delete with black hole register")
      assertEquals(commands[1], "set undolevels=1000", "Should reset undolevels")
      assertEquals(commands[2], 'silent! normal! "ap', "Should select and paste from register a")
    })
  })

  describe("line-wise replace", () => {
    it("should delete lines and paste with P", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
          if (expr === "']") return Promise.resolve([0, 4, 10, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getreg(")) return Promise.resolve("test content")
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x164")
          if (expr === "getline('.')") return Promise.resolve("test line")
          if (expr === "col('.')") return Promise.resolve(5)
          return Promise.resolve("")
        },
      })

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(
        commands[0],
        'silent! normal! 2G1|V4G10|"_d',
        "Should delete lines",
      )
      assertEquals(commands[1], "set undolevels=1000", "Should reset undolevels")
      assertEquals(commands[2], 'silent! normal! ""P', "Should paste with P")
    })

    it("should handle single line replace", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Single line
          if (expr === "'[") return Promise.resolve([0, 3, 1, 0])
          if (expr === "']") return Promise.resolve([0, 3, 20, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getreg(")) return Promise.resolve("test content")
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x164")
          if (expr === "getline('.')") return Promise.resolve("test line")
          if (expr === "col('.')") return Promise.resolve(5)
          return Promise.resolve("")
        },
      })

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(
        commands[0],
        'silent! normal! 3G1|V3G20|"_d',
        "Should delete single line",
      )
      assertEquals(commands[1], "set undolevels=1000", "Should reset undolevels")
      assertEquals(commands[2], 'silent! normal! ""P', "Should paste line")
    })
  })

  describe("block-wise replace", () => {
    it("should delete block and paste", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 3, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getreg(")) return Promise.resolve("test content")
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x164")
          if (expr === "getline('.')") return Promise.resolve("test line")
          if (expr === "col('.')") return Promise.resolve(5)
          return Promise.resolve("")
        },
        getreg: () => Promise.resolve("abc\njkl\nstu"),
        setreg: () => Promise.resolve(),
      })

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
        motionWise: "block",
        register: '"',
      }, mockVimApi)

      // Assert
      // For block mode: delete, undolevels, paste = 3 commands
      assertEquals(commands.length, 3, "Should execute 3 commands for block mode")
      assertEquals(
        commands[0],
        'silent! normal! 1G1|\x163G5|"_d',
        "Should delete block with black hole register",
      )
      assertEquals(commands[1], "set undolevels=1000", "Should reset undolevels")
      assertEquals(commands[2], 'silent! normal! ""P', "Should paste with P")
    })
  })

  describe("edge cases", () => {
    it("should handle empty region gracefully", async () => {
      // Arrange
      let commandExecuted = false
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Empty region: '[ is after ']
          if (expr === "'[") return Promise.resolve([0, 1, 5, 0])
          if (expr === "']") return Promise.resolve([0, 1, 3, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: () => {
          commandExecuted = true
          return Promise.resolve()
        },
      })

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commandExecuted, false, "Should not execute any command for empty region")
    })

    it("should handle different register types", async () => {
      // Test with different register types and see how they are pasted
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 1, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getreg(")) return Promise.resolve("test content")
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x164")
          if (expr === "getline('.')") return Promise.resolve("test line")
          if (expr === "col('.')") return Promise.resolve(5)
          return Promise.resolve("")
        },
      })

      const mockDenops = {} as Denops

      // Act with special registers
      await executeReplaceOperator(mockDenops, {
        motionWise: "char",
        register: "+", // clipboard register
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(commands[0], 'silent! normal! 1G1|v1G5|"_d', "Should delete with black hole register")
      assertEquals(commands[1], "set undolevels=1000", "Should reset undolevels")
      assertEquals(commands[2], 'silent! normal! "+p', "Should handle special registers")
    })
  })
})
