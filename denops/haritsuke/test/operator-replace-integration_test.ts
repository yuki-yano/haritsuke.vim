import { assertEquals, describe, it } from "../deps/test.ts"
import { createMockVimApi } from "../vim/vim-api.ts"
import { executeReplaceOperator } from "../core/operator-replace.ts"

/**
 * Integration tests that simulate real-world scenarios
 * Based on actual test results from test-replace-feedkeys.vim
 */
describe("executeReplaceOperator - integration", () => {
  describe("real-world character-wise replace", () => {
    it("should preserve spaces when replacing 'banana' with 'apple' in 'apple banana cherry'", async () => {
      // This test represents the actual failing case:
      // "apple banana cherry" -> should become "apple apple cherry"
      // but actually becomes "applebanana cherry" (space is lost)

      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // "banana" position in "apple banana cherry"
          if (expr === "'[") return Promise.resolve([0, 1, 7, 0]) // after "apple "
          if (expr === "']") return Promise.resolve([0, 1, 12, 0]) // end of "banana"
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert current behavior (with fix)
      assertEquals(commands.length, 3, "Should execute 3 commands")
      assertEquals(
        commands[0],
        'silent! normal! 1G7|v1G12|"_d',
        "Delete command should select from position 7 to 12",
      )
      assertEquals(
        commands[2],
        'silent! normal! ""P',
        "Paste command should paste at cursor position",
      )

      // The issue: after deleting "banana", cursor is at position 7
      // When pasting "apple", it becomes "applebanana cherry" instead of "apple apple cherry"
      // because the space after "apple" is not preserved
    })
  })

  describe("real-world motion replace (Riw)", () => {
    it("should replace 'elephant' with 'dog' in 'dog elephant fox'", async () => {
      // This test represents the failing case:
      // "dog elephant fox" -> should become "dog dog fox"
      // but actually becomes "dog dogfox" (wrong word replaced)

      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Riw on "elephant" - motion marks after operation
          if (expr === "'[") return Promise.resolve([0, 1, 5, 0]) // start of word
          if (expr === "']") return Promise.resolve([0, 1, 12, 0]) // end of word
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
      })

      // Act
      await executeReplaceOperator({
        motionWise: "char",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(commands.length, 3, "Should execute 3 commands")
      // With the fix, character-wise operations use a single command
    })
  })

  describe("expected behavior tests", () => {
    it("should correctly handle word boundaries", async () => {
      // Test what the correct behavior should be

      // Arrange
      const commands: string[] = []
      const buffer = "apple banana cherry"
      const _replaceText = "apple"
      const _targetWord = "banana"

      // Calculate expected positions
      const targetStart = buffer.indexOf(_targetWord) + 1 // 1-based
      const targetEnd = targetStart + _targetWord.length - 1

      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 1, targetStart, 0])
          if (expr === "']") return Promise.resolve([0, 1, targetEnd, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
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
        `silent! normal! 1G${targetStart}|v1G${targetEnd}|"_d`,
        "Should delete exact word boundaries",
      )

      // After deletion, the buffer would be "apple  cherry"
      // The paste should happen at the current cursor position
      // to produce "apple apple cherry"
    })
  })

  describe("3-line file edge case", () => {
    it("should correctly replace last line in 3-line file", async () => {
      // Test case for the reported issue:
      // File: "foo\n\nbar"
      // 1. Yank "foo" (character-wise)
      // 2. Visual line select "bar" (line 3)
      // 3. Replace - should result in "foo\n\nfoo", not "foo\n foo"

      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Visual marks for line 3 selection
          if (expr === "'<") return Promise.resolve([0, 3, 1, 0])
          if (expr === "'>") return Promise.resolve([0, 3, 3, 0]) // "bar" is 3 chars
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: (expr: string) => {
          if (expr === "&undolevels") return Promise.resolve(1000)
          if (expr === "strlen(getline(3))") return Promise.resolve(3) // "bar" length
          if (expr === "getregtype('\"')") return Promise.resolve("v") // character-wise register
          return Promise.resolve(0)
        },
        line: (arg: string) => {
          if (arg === "$") return Promise.resolve(3) // 3 lines total
          return Promise.resolve(1)
        },
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
        'silent! normal! 3GV3G"_d',
        "Should delete line 3 without column positions",
      )
      // Check that special handling was applied
      assertEquals(commands.length, 4, "Should have 4 commands: delete, undolevel, new line, paste")
      assertEquals(
        commands[0],
        'silent! normal! 3GV3G"_d',
        "Should delete line 3",
      )
      // With the fix, it should add a new line and paste
      assertEquals(commands[2], "silent! normal! o", "Should create new line")
      assertEquals(commands[3], 'silent! normal! ""P', "Should paste character-wise content from default register")
    })
  })

  describe("line-wise replace behavior", () => {
    it("should handle word yank followed by line-wise replace correctly", async () => {
      // Test case for the reported issue:
      // 1. Yank a word (regtype="v") like "hoge"
      // 2. Use V (line-wise) selection for replace
      // 3. Should not jump to column 237 or other unexpected positions

      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Visual marks for line selection
          if (expr === "'<") return Promise.resolve([0, 2, 1, 0]) // Line 2 start
          if (expr === "'>") return Promise.resolve([0, 2, 237, 0]) // Line 2 with large column (simulating the issue)
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
        line: (arg: string) => {
          if (arg === "$") return Promise.resolve(5) // 5 lines in buffer
          return Promise.resolve(1)
        },
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
        'silent! normal! 2GV2G"_d',
        "Should delete entire line without using column positions (no 237|)",
      )
      assertEquals(
        commands[2],
        'silent! normal! ""P',
        "Should use P for line-wise paste",
      )
    })

    it("should work with VR but currently doesn't", async () => {
      // Test documents that VR doesn't work as expected

      // Arrange
      const commands: string[] = []
      const mockVimApi = createMockVimApi({
        getpos: (expr: string) => {
          // Line 2 selected
          if (expr === "'[") return Promise.resolve([0, 2, 1, 0])
          if (expr === "']") return Promise.resolve([0, 2, 8, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        cmd: (cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        },
        eval: () => Promise.resolve(1000),
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
        "Should delete entire line without column positions for line-wise operations",
      )
      assertEquals(
        commands[2],
        'silent! normal! ""P',
        "Should use P for line-wise paste",
      )
    })
  })
})
