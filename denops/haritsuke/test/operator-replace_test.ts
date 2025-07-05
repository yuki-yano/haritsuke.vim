import { assertEquals, describe, it } from "../deps/test.ts"
import { createMockVimApi } from "../vim/vim-api.ts"
import { executeReplaceOperator } from "../core/operator-replace.ts"

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

      // Act
      await executeReplaceOperator({
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

      // Act
      await executeReplaceOperator({
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

      // Act
      await executeReplaceOperator({
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

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(
        commands[0],
        'silent! normal! 2GV4G"_d',
        "Should delete lines without column positions for line-wise operations",
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

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(
        commands[0],
        'silent! normal! 3GV3G"_d',
        "Should delete single line without column positions for line-wise operations",
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

      // Act
      await executeReplaceOperator({
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

  describe("getPasteCommand behavior (via executeReplaceOperator)", () => {
    describe("character-wise deletion at end of line", () => {
      it("should use 'p' when deleting to end of line (like d$)", async () => {
        // Arrange
        const commands: string[] = []
        const mockVimApi = createMockVimApi({
          getpos: (expr: string) => {
            // Deleting from middle to end of line
            if (expr === "'[") return Promise.resolve([0, 1, 5, 0])
            if (expr === "']") return Promise.resolve([0, 1, 10, 0]) // end of line
            return Promise.resolve([0, 0, 0, 0])
          },
          cmd: (cmd: string) => {
            commands.push(cmd)
            return Promise.resolve()
          },
          eval: (expr: string) => {
            if (expr === "&undolevels") return Promise.resolve(1000)
            if (expr === "strlen(getline(1))") return Promise.resolve(10) // line length
            if (expr.startsWith("getregtype(")) return Promise.resolve("v") // char-wise
            return Promise.resolve("")
          },
          line: (arg: string) => {
            if (arg === "$") return Promise.resolve(5) // total lines
            return Promise.resolve(1)
          },
        })

        // Act
        await executeReplaceOperator({
          motionWise: "char",
          register: '"',
        }, mockVimApi)

        // Assert
        assertEquals(commands[2], 'silent! normal! ""p', "Should use 'p' when deleting to end of line")
      })

      it("should use 'P' when not deleting to end of line", async () => {
        // Arrange
        const commands: string[] = []
        const mockVimApi = createMockVimApi({
          getpos: (expr: string) => {
            // Deleting middle portion, not to end
            if (expr === "'[") return Promise.resolve([0, 1, 5, 0])
            if (expr === "']") return Promise.resolve([0, 1, 8, 0]) // not end of line
            return Promise.resolve([0, 0, 0, 0])
          },
          cmd: (cmd: string) => {
            commands.push(cmd)
            return Promise.resolve()
          },
          eval: (expr: string) => {
            if (expr === "&undolevels") return Promise.resolve(1000)
            if (expr === "strlen(getline(1))") return Promise.resolve(15) // line continues after deletion
            if (expr.startsWith("getregtype(")) return Promise.resolve("v")
            return Promise.resolve("")
          },
          line: (arg: string) => {
            if (arg === "$") return Promise.resolve(5)
            return Promise.resolve(1)
          },
        })

        // Act
        await executeReplaceOperator({
          motionWise: "char",
          register: '"',
        }, mockVimApi)

        // Assert
        assertEquals(commands[2], 'silent! normal! ""P', "Should use 'P' when not deleting to end of line")
      })
    })

    describe("deletion at buffer end", () => {
      it("should use 'p' when deleting at buffer end (char-wise)", async () => {
        // Arrange
        const commands: string[] = []
        const mockVimApi = createMockVimApi({
          getpos: (expr: string) => {
            // Last line, deleting to end
            if (expr === "'[") return Promise.resolve([0, 3, 5, 0])
            if (expr === "']") return Promise.resolve([0, 3, 10, 0])
            return Promise.resolve([0, 0, 0, 0])
          },
          cmd: (cmd: string) => {
            commands.push(cmd)
            return Promise.resolve()
          },
          eval: (expr: string) => {
            if (expr === "&undolevels") return Promise.resolve(1000)
            if (expr === "strlen(getline(3))") return Promise.resolve(10) // last line length
            if (expr.startsWith("getregtype(")) return Promise.resolve("v")
            return Promise.resolve("")
          },
          line: (arg: string) => {
            if (arg === "$") return Promise.resolve(3) // only 3 lines, we're on last
            return Promise.resolve(1)
          },
        })

        // Act
        await executeReplaceOperator({
          motionWise: "char",
          register: '"',
        }, mockVimApi)

        // Assert
        assertEquals(commands[2], 'silent! normal! ""p', "Should use 'p' at buffer end")
      })

      it("should use 'p' when deleting last line (line-wise)", async () => {
        // Arrange
        const commands: string[] = []
        const mockVimApi = createMockVimApi({
          getpos: (expr: string) => {
            // Deleting last line
            if (expr === "'[") return Promise.resolve([0, 5, 1, 0])
            if (expr === "']") return Promise.resolve([0, 5, 20, 0])
            return Promise.resolve([0, 0, 0, 0])
          },
          cmd: (cmd: string) => {
            commands.push(cmd)
            return Promise.resolve()
          },
          eval: (expr: string) => {
            if (expr === "&undolevels") return Promise.resolve(1000)
            if (expr.startsWith("getregtype(")) return Promise.resolve("V") // line-wise
            return Promise.resolve("")
          },
          line: (arg: string) => {
            if (arg === "$") return Promise.resolve(5) // we're deleting line 5 of 5
            return Promise.resolve(1)
          },
        })

        // Act
        await executeReplaceOperator({
          motionWise: "line",
          register: '"',
        }, mockVimApi)

        // Assert
        assertEquals(commands[2], 'silent! normal! ""p', "Should use 'p' when deleting last line")
      })
    })

    describe("empty line handling", () => {
      it("should handle deletion on empty line", async () => {
        // Arrange
        const commands: string[] = []
        const mockVimApi = createMockVimApi({
          getpos: (expr: string) => {
            // Empty line
            if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
            if (expr === "']") return Promise.resolve([0, 2, 1, 0])
            return Promise.resolve([0, 0, 0, 0])
          },
          cmd: (cmd: string) => {
            commands.push(cmd)
            return Promise.resolve()
          },
          eval: (expr: string) => {
            if (expr === "&undolevels") return Promise.resolve(1000)
            if (expr === "strlen(getline(2))") return Promise.resolve(0) // empty line
            if (expr.startsWith("getregtype(")) return Promise.resolve("v")
            return Promise.resolve("")
          },
          line: (arg: string) => {
            if (arg === "$") return Promise.resolve(5)
            return Promise.resolve(1)
          },
        })

        // Act
        await executeReplaceOperator({
          motionWise: "char",
          register: '"',
        }, mockVimApi)

        // Assert
        assertEquals(commands[2], 'silent! normal! ""P', "Should use 'P' on empty line")
      })
    })

    describe("block-wise never moves cursor", () => {
      it("should always use 'P' for block-wise operations", async () => {
        // Arrange
        const commands: string[] = []
        const mockVimApi = createMockVimApi({
          getpos: (expr: string) => {
            // Block at end of buffer
            if (expr === "'[") return Promise.resolve([0, 3, 5, 0])
            if (expr === "']") return Promise.resolve([0, 5, 10, 0]) // last line
            return Promise.resolve([0, 0, 0, 0])
          },
          cmd: (cmd: string) => {
            commands.push(cmd)
            return Promise.resolve()
          },
          eval: (expr: string) => {
            if (expr === "&undolevels") return Promise.resolve(1000)
            if (expr.startsWith("getregtype(")) return Promise.resolve("\x165") // block-wise
            return Promise.resolve("")
          },
          line: (arg: string) => {
            if (arg === "$") return Promise.resolve(5)
            return Promise.resolve(1)
          },
        })

        // Act
        await executeReplaceOperator({
          motionWise: "block",
          register: '"',
        }, mockVimApi)

        // Assert
        assertEquals(commands[2], 'silent! normal! ""P', "Block-wise should always use 'P'")
      })
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

      // Act
      await executeReplaceOperator({
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

      // Act with special registers
      await executeReplaceOperator({
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

  describe("mixed register type operations", () => {
    it("should handle line-wise deletion with character-wise paste correctly", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Line-wise selection
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
          if (expr === "']") return Promise.resolve([0, 3, 15, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v") // character-wise register
          return Promise.resolve("")
        },
        line: (arg: string) => {
          if (arg === "$") return Promise.resolve(3) // deleting last line
          return Promise.resolve(1)
        },
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      // Should handle special case for line deletion + char paste
      assertEquals(commands.length, 4, "Should have 4 commands for special handling")
      assertEquals(commands[0], 'silent! normal! 2GV3G"_d', "Delete lines")
      assertEquals(commands[2], "silent! normal! o", "Create new line")
      assertEquals(commands[3], 'silent! normal! ""P', "Paste character-wise content")
    })

    it("should handle line-wise deletion with block-wise paste", async () => {
      // Arrange
      const commands: string[] = []
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
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x165") // block-wise register
          return Promise.resolve("")
        },
        line: (arg: string) => {
          if (arg === "$") return Promise.resolve(5)
          return Promise.resolve(1)
        },
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 2GV2G"_d', "Delete line")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste block-wise content")
    })

    it("should handle character-wise deletion with line-wise paste", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Character selection
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
          if (expr.startsWith("getregtype(")) return Promise.resolve("V") // line-wise register
          if (expr === "strlen(getline(1))") return Promise.resolve(20)
          return Promise.resolve("")
        },
        line: (arg: string) => {
          if (arg === "$") return Promise.resolve(5)
          return Promise.resolve(1)
        },
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G5|v1G10|"_d', "Delete characters")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste line-wise content")
    })

    it("should handle block-wise deletion with line-wise paste", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 1, 5, 0])
          if (expr === "']") return Promise.resolve([0, 3, 10, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("V") // line-wise register
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "block",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G5|\x163G10|"_d', "Delete block")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste line-wise content")
    })

    it("should handle block-wise register with different widths", async () => {
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
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x1610") // block-wise with width 10
          if (expr === "strlen(getline(1))") return Promise.resolve(20)
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G1|v1G5|"_d', "Delete chars")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste wider block")
    })
  })

  describe("boundary value tests", () => {
    it("should handle operation at first character of file", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // First character
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 1, 1, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(1))") return Promise.resolve(10)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(1), // single line file
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G1|v1G1|"_d', "Delete first char")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste at beginning")
    })

    it("should handle operation on single character file", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Entire file is single char
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 1, 1, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(1))") return Promise.resolve(1) // single character
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(1),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G1|v1G1|"_d', "Delete single char")
      assertEquals(commands[2], 'silent! normal! ""p', "Should use 'p' when deleting entire content")
    })

    it("should handle operation on last character of last line", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Last char of last line
          if (expr === "'[") return Promise.resolve([0, 3, 15, 0])
          if (expr === "']") return Promise.resolve([0, 3, 15, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(3))") return Promise.resolve(15)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(3),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 3G15|v3G15|"_d', "Delete last char")
      assertEquals(commands[2], 'silent! normal! ""p', "Use 'p' at buffer end")
    })

    it("should handle line-wise operation on single line file", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Entire single line
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 1, 20, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("V")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(1), // single line file
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1GV1G"_d', "Delete single line")
      assertEquals(commands[2], 'silent! normal! ""p', "Use 'p' when deleting all content")
    })

    it("should handle block operation spanning entire file", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Block from start to end
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 3, 20, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x165")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(3),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "block",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G1|\x163G20|"_d', "Delete entire block")
      assertEquals(commands[2], 'silent! normal! ""P', "Block always uses 'P'")
    })

    it("should handle zero-width selection (cursor position)", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Same start and end position
          if (expr === "'[") return Promise.resolve([0, 2, 5, 0])
          if (expr === "']") return Promise.resolve([0, 2, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(2))") return Promise.resolve(10)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 2G5|v2G5|"_d', "Delete at cursor")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste at cursor")
    })
  })

  describe("multi-byte character handling", () => {
    it("should handle Japanese characters", async () => {
      // Note: Column position for multi-byte chars may vary based on encoding
      // This test assumes Japanese chars count as 2 columns each
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Selecting "こんにちは" (5 chars, 10 columns)
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 1, 10, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(1))") return Promise.resolve(30) // byte length
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(3),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G1|v1G10|"_d', "Delete Japanese text")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste Japanese text")
    })

    it("should handle emoji characters", async () => {
      // Emojis can have complex column width calculations
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Selecting emoji "👍" (may be 2 columns)
          if (expr === "'[") return Promise.resolve([0, 1, 5, 0])
          if (expr === "']") return Promise.resolve([0, 1, 6, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(1))") return Promise.resolve(20)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(1),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G5|v1G6|"_d', "Delete emoji")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste emoji")
    })

    it("should handle mixed ASCII and multi-byte text", async () => {
      // Mixed content: "Hello こんにちは World"
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Selecting "こんにちは" part
          if (expr === "'[") return Promise.resolve([0, 1, 7, 0]) // after "Hello "
          if (expr === "']") return Promise.resolve([0, 1, 16, 0]) // before " World"
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(1))") return Promise.resolve(35)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(1),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G7|v1G16|"_d', "Delete mixed text selection")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste mixed text")
    })

    it("should handle line-wise operations with multi-byte content", async () => {
      // Line containing multi-byte characters
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Entire line with Japanese text
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
          if (expr === "']") return Promise.resolve([0, 2, 50, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("V")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(
        commands[0],
        'silent! normal! 2GV2G"_d',
        "Line-wise operations ignore column positions for multi-byte chars",
      )
    })

    it("should handle block operations with multi-byte characters", async () => {
      // Block selection with multi-byte chars
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Block from column 3 to 8 over 3 lines
          if (expr === "'[") return Promise.resolve([0, 1, 3, 0])
          if (expr === "']") return Promise.resolve([0, 3, 8, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x165")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "block",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(
        commands[0],
        'silent! normal! 1G3|\x163G8|"_d',
        "Block selection with multi-byte chars",
      )
      assertEquals(commands[2], 'silent! normal! ""P', "Block paste always uses 'P'")
    })
  })

  describe("visual mode operations", () => {
    it("should use visual marks ('< and '>) when visualMode is true", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Visual mode uses '< and '> marks
          if (expr === "'<") return Promise.resolve([0, 2, 5, 0])
          if (expr === "'>") return Promise.resolve([0, 2, 15, 0])
          // Should not be called with '[ or ']
          if (expr === "'[" || expr === "']") {
            throw new Error("Should not use motion marks in visual mode")
          }
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(2))") return Promise.resolve(20)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
        visualMode: true,
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 2G5|v2G15|"_d', "Use visual marks for deletion")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste after visual delete")
    })

    it("should handle visual line mode", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Visual line mode selection
          if (expr === "'<") return Promise.resolve([0, 2, 1, 0])
          if (expr === "'>") return Promise.resolve([0, 4, 999, 0]) // Large column for line mode
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("V")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(10),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
        visualMode: true,
      }, mockVimApi)

      // Assert
      assertEquals(
        commands[0],
        'silent! normal! 2GV4G"_d',
        "Visual line mode ignores column positions",
      )
    })

    it("should handle visual block mode", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Visual block selection
          if (expr === "'<") return Promise.resolve([0, 1, 5, 0])
          if (expr === "'>") return Promise.resolve([0, 3, 10, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("\x168") // block with width
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "block",
        register: '"',
        visualMode: true,
      }, mockVimApi)

      // Assert
      assertEquals(
        commands[0],
        'silent! normal! 1G5|\x163G10|"_d',
        "Visual block mode uses Ctrl-V",
      )
    })

    it("should handle empty visual selection", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Empty visual selection (cursor didn't move)
          if (expr === "'<") return Promise.resolve([0, 2, 10, 0])
          if (expr === "'>") return Promise.resolve([0, 2, 8, 0]) // end before start
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
        line: () => Promise.resolve(5),
      })

      // Act
      const result = await executeReplaceOperator({
        motionWise: "char",
        register: '"',
        visualMode: true,
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 0, "Should not execute commands for empty selection")
      assertEquals(result, "p", "Return default paste command")
    })

    it("should handle visual mode with different register types", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'<") return Promise.resolve([0, 1, 1, 0])
          if (expr === "'>") return Promise.resolve([0, 1, 10, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(1))") return Promise.resolve(20)
          if (expr.startsWith("getregtype(")) return Promise.resolve("V") // line-wise register
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act with system clipboard register
      await executeReplaceOperator({
        motionWise: "char",
        register: "*",
        visualMode: true,
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 1G1|v1G10|"_d', "Delete visual selection")
      assertEquals(commands[2], 'silent! normal! "*P', "Paste from system clipboard")
    })

    it("should handle visual char to line-wise paste correctly", async () => {
      // Visual char selection but pasting line-wise content
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'<") return Promise.resolve([0, 2, 5, 0])
          if (expr === "'>") return Promise.resolve([0, 2, 10, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(2))") return Promise.resolve(15)
          if (expr.startsWith("getregtype(")) return Promise.resolve("V") // line-wise content
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
        visualMode: true,
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 2G5|v2G10|"_d', "Delete char selection")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste line-wise content")
    })
  })

  describe("error handling and robustness", () => {
    it("should handle getpos returning invalid values", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Return invalid position data
          if (expr === "'[") return Promise.resolve([0, 0, 0, 0]) // invalid line 0
          if (expr === "']") return Promise.resolve([0, -1, -1, 0]) // negative values
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
        line: () => Promise.resolve(5),
      })

      // Act - should handle gracefully
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert - might execute with invalid positions or skip
      // The important thing is it doesn't throw
      assertEquals(typeof commands.length, "number", "Should handle invalid positions")
    })

    it("should handle eval returning unexpected types", async () => {
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
          if (expr === "&undolevels") return Promise.resolve(null) // unexpected null
          if (expr === "strlen(getline(1))") return Promise.resolve("not a number") // string instead of number
          if (expr.startsWith("getregtype(")) return Promise.resolve(123) // number instead of string
          return Promise.resolve(undefined)
        },
        line: () => Promise.resolve(5),
      })

      // Act - should handle type mismatches
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert - should proceed with defaults or handle gracefully
      assertEquals(commands.length > 0, true, "Should attempt to execute commands")
    })

    it("should handle cmd throwing errors", async () => {
      // Arrange
      let errorThrown = false
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 1, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          if (cmd.includes("undolevels")) {
            throw new Error("Permission denied")
          }
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
        line: () => Promise.resolve(5),
      })

      // Act
      try {
        await executeReplaceOperator({
          motionWise: "char",
          register: '"',
        }, mockVimApi)
      } catch (_e) {
        errorThrown = true
      }

      // Assert - error should propagate
      assertEquals(errorThrown, true, "Should propagate cmd errors")
    })

    it("should handle special characters in register names", async () => {
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
          if (expr === "strlen(getline(1))") return Promise.resolve(10)
          // Handle special register query
          if (expr.startsWith("getregtype('=')")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act with expression register
      await executeReplaceOperator({
        motionWise: "char",
        register: "=", // expression register
      }, mockVimApi)

      // Assert
      assertEquals(commands[2], 'silent! normal! "=P', "Handle expression register")
    })

    it("should handle very large position values", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Very large line/column numbers
          if (expr === "'[") return Promise.resolve([0, 999999, 1, 0])
          if (expr === "']") return Promise.resolve([0, 999999, 999999, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(999999))") return Promise.resolve(0) // non-existent line
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(1000000), // very large file
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(
        commands[0].includes("999999"),
        true,
        "Should handle large line numbers",
      )
    })

    it("should handle getregtype returning unexpected format", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
          if (expr === "']") return Promise.resolve([0, 3, 20, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("unknown") // unexpected regtype
          return Promise.resolve("")
        },
        line: (arg: string) => {
          if (arg === "$") return Promise.resolve(3) // buffer has 3 lines total
          return Promise.resolve(1)
        },
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert - should still execute with defaults
      // Note: "unknown" is not recognized as line-wise, so it's treated as character-wise
      // This triggers special handling for line-wise deletion + char-wise paste
      assertEquals(commands.length, 4, "Should handle unknown register type with special case")
      assertEquals(commands[2], "silent! normal! o", "Should create new line for char paste after line delete")
      assertEquals(commands[3], 'silent! normal! ""P', "Should paste after creating new line")
    })
  })

  describe("register content edge cases", () => {
    it("should handle empty register", async () => {
      // Arrange
      const commands: string[] = []
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
          if (expr === "strlen(getline(1))") return Promise.resolve(20)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          if (expr.startsWith("getreg(")) return Promise.resolve("") // empty register
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert - should still execute all commands even with empty register
      assertEquals(commands.length, 3, "Should execute all commands")
      assertEquals(commands[0], 'silent! normal! 1G5|v1G10|"_d', "Delete selected text")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste empty content")
    })

    it("should handle register with only newlines", async () => {
      // Arrange
      const commands: string[] = []
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
          if (expr.startsWith("getregtype(")) return Promise.resolve("V") // line-wise
          if (expr.startsWith("getreg(")) return Promise.resolve("\n\n\n") // only newlines
          return Promise.resolve("")
        },
        line: () => Promise.resolve(10),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands[0], 'silent! normal! 2GV2G"_d', "Delete line")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste newlines")
    })

    it("should handle register with control characters", async () => {
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
          if (expr === "strlen(getline(1))") return Promise.resolve(10)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          if (expr.startsWith("getreg(")) return Promise.resolve("\x01\x02\x03\t\r") // control chars
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should handle control characters")
      assertEquals(commands[2], 'silent! normal! ""P', "Paste control characters")
    })
  })

  describe("isEmptyRegion additional edge cases", () => {
    it("should handle same position (line and column)", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Exact same position for start and end
          if (expr === "'[") return Promise.resolve([0, 2, 5, 0])
          if (expr === "']") return Promise.resolve([0, 2, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should handle same position")
      assertEquals(commands[0], 'silent! normal! 2G5|v2G5|"_d', "Delete at single position")
    })

    it("should detect empty region when end column equals start column minus 1", async () => {
      // Arrange
      let commandExecuted = false
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Edge case: same line, end column = start column - 1
          if (expr === "'[") return Promise.resolve([0, 3, 10, 0])
          if (expr === "']") return Promise.resolve([0, 3, 9, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: () => {
          commandExecuted = true
          return Promise.resolve()
        },
        line: () => Promise.resolve(5),
      })

      // Act
      const result = await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commandExecuted, false, "Should not execute for empty region")
      assertEquals(result, "p", "Should return default paste command")
    })
  })

  describe("getVisualCommand edge cases", () => {
    it("should use default 'v' for unexpected motionWise value", async () => {
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
          if (expr === "strlen(getline(1))") return Promise.resolve(10)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act with unexpected motionWise value
      await executeReplaceOperator({
        motionWise: "unexpected" as unknown as "char" | "line" | "block",
        register: '"',
      }, mockVimApi)

      // Assert - should default to 'v' (character-wise)
      assertEquals(
        commands[0],
        'silent! normal! 1G1|v1G5|"_d',
        "Should use 'v' for unexpected motionWise",
      )
    })
  })

  describe("multi-line character-wise operations", () => {
    it("should handle character-wise selection spanning multiple lines", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Selection from middle of line 2 to middle of line 4
          if (expr === "'[") return Promise.resolve([0, 2, 10, 0])
          if (expr === "']") return Promise.resolve([0, 4, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(4))") return Promise.resolve(20)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(10),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(
        commands[0],
        'silent! normal! 2G10|v4G5|"_d',
        "Should handle multi-line char selection",
      )
      assertEquals(commands[2], 'silent! normal! ""P', "Paste after multi-line delete")
    })

    it("should handle character-wise from end of line to start of next line", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // From end of line 1 to start of line 2
          if (expr === "'[") return Promise.resolve([0, 1, 20, 0])
          if (expr === "']") return Promise.resolve([0, 2, 1, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(1))") return Promise.resolve(20) // end of line 1
          if (expr === "strlen(getline(2))") return Promise.resolve(15)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(
        commands[0],
        'silent! normal! 1G20|v2G1|"_d',
        "Should handle end-to-start line transition",
      )
      assertEquals(commands[2], 'silent! normal! ""P', "Should use 'P' for cross-line selection")
    })
  })

  describe("complex paste command decision scenarios", () => {
    it("should use P for line deletion when not at buffer end", async () => {
      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Delete line 2 (not last line)
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
          if (expr === "']") return Promise.resolve([0, 2, 30, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr.startsWith("getregtype(")) return Promise.resolve("v") // char-wise content
          return Promise.resolve("")
        },
        line: (arg: string) => {
          if (arg === "$") return Promise.resolve(5) // buffer has 5 lines
          return Promise.resolve(1)
        },
      })

      // Act
      await executeReplaceOperator({
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should use normal paste for non-last line")
      assertEquals(commands[0], 'silent! normal! 2GV2G"_d', "Delete line 2")
      assertEquals(commands[2], 'silent! normal! ""P', "Use P when not at buffer end")
    })
  })

  describe("special register handling", () => {
    it("should handle numeric registers (0-9)", async () => {
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
          if (expr === "strlen(getline(1))") return Promise.resolve(10)
          if (expr.startsWith("getregtype('3')")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act with numeric register
      await executeReplaceOperator({
        motionWise: "char",
        register: "3",
      }, mockVimApi)

      // Assert
      assertEquals(commands[2], 'silent! normal! "3P', "Handle numeric register")
    })

    it("should handle read-only registers like '%' (current file)", async () => {
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
          if (expr === "strlen(getline(1))") return Promise.resolve(10)
          if (expr.startsWith("getregtype('%')")) return Promise.resolve("v")
          return Promise.resolve("")
        },
        line: () => Promise.resolve(5),
      })

      // Act with read-only register
      await executeReplaceOperator({
        motionWise: "char",
        register: "%",
      }, mockVimApi)

      // Assert
      assertEquals(commands[2], 'silent! normal! "%P', "Handle read-only register")
    })
  })
})
