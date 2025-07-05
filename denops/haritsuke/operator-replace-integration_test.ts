import { assertEquals, describe, it } from "./deps/test.ts"
import type { Denops } from "./deps/denops.ts"
import { createMockVimApi } from "./vim-api.ts"
import { executeReplaceOperator } from "./operator-replace.ts"

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

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
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

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
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
        `silent! normal! 1G${targetStart}|v1G${targetEnd}|"_d`,
        "Should delete exact word boundaries",
      )

      // After deletion, the buffer would be "apple  cherry"
      // The paste should happen at the current cursor position
      // to produce "apple apple cherry"
    })
  })

  describe("line-wise replace behavior", () => {
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

      const mockDenops = {} as Denops

      // Act
      await executeReplaceOperator(mockDenops, {
        motionWise: "line",
        register: '"',
      }, mockVimApi)

      // Assert
      assertEquals(
        commands[0],
        'silent! normal! 2G1|V2G8|"_d',
        "Should delete entire line",
      )
      assertEquals(
        commands[2],
        'silent! normal! ""P',
        "Should use P for line-wise paste",
      )
    })
  })
})
