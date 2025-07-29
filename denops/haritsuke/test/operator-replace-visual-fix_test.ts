import { assertEquals } from "jsr:@std/assert"
import { describe, it } from "jsr:@std/testing/bdd"
import { executeReplaceOperator } from "../core/operator-replace.ts"
import { createMockVimApi } from "../vim/vim-api.ts"

describe("visual mode character-wise replace fix", () => {
  it("should correctly replace text inside parentheses", async () => {
    // This test validates the fix for visual mode replace operator
    // where text inside parentheses was being pasted after the closing parenthesis
    // instead of between the parentheses.

    // Setup: buffer contains "(aaa)", we want to replace "aaa" with "foo"
    // Expected: "(foo)"
    // Bug behavior was: "()foo"

    let bufferContent = "(aaa)"
    let deleted = false
    const commands: string[] = []

    const mockVimApi = createMockVimApi({
      getpos: (mark: string) => {
        if (mark === "'<") return Promise.resolve([0, 1, 2, 0]) // Start of "aaa"
        if (mark === "'>") return Promise.resolve([0, 1, 4, 0]) // End of "aaa"
        return Promise.resolve([0, 0, 0, 0])
      },
      cmd: (cmd: string) => {
        commands.push(cmd)

        // Simulate the deletion
        if (cmd.includes('"_d')) {
          bufferContent = "()"
          deleted = true
        }

        // Simulate the paste
        if (cmd.includes('""p')) {
          // p = paste after cursor
          bufferContent = "()foo"
        } else if (cmd.includes('""P')) {
          // P = paste before cursor
          bufferContent = "(foo)"
        }
        return Promise.resolve()
      },
      eval: (expr: string) => {
        if (expr === "&undolevels") return Promise.resolve(1000)

        // Return correct buffer length based on deletion state
        if (expr === "strlen(getline(1))") {
          return Promise.resolve(deleted ? 2 : 5) // "()" = 2, "(aaa)" = 5
        }

        if (expr === 'getregtype("\\"")') return Promise.resolve("v") // char-wise
        if (expr === 'getreg("\\"")') return Promise.resolve("foo")
        return Promise.resolve("")
      },
      line: (expr: string) => {
        if (expr === "$") return Promise.resolve(1) // single line buffer
        return Promise.resolve(1)
      },
      getline: () => Promise.resolve(bufferContent),
    })

    // Execute replace operation
    const pasteCmd = await executeReplaceOperator({
      motionWise: "char",
      register: '"',
      visualMode: true,
    }, mockVimApi)

    // Verify the fix: should use P (paste before) not p (paste after)
    assertEquals(pasteCmd, "P", "Should use P (paste before) command")
    assertEquals(bufferContent, "(foo)", "Should correctly replace 'aaa' with 'foo' inside parentheses")
  })

  it("should correctly replace text at beginning of line", async () => {
    // Test case: "hello world" -> replace "hello" with "hi"
    // Expected: "hi world"

    let bufferContent = "hello world"
    let deleted = false
    const commands: string[] = []

    const mockVimApi = createMockVimApi({
      getpos: (mark: string) => {
        if (mark === "'<") return Promise.resolve([0, 1, 1, 0]) // Start of "hello"
        if (mark === "'>") return Promise.resolve([0, 1, 5, 0]) // End of "hello"
        return Promise.resolve([0, 0, 0, 0])
      },
      cmd: (cmd: string) => {
        commands.push(cmd)

        if (cmd.includes('"_d')) {
          bufferContent = " world"
          deleted = true
        }

        if (cmd.includes('""p')) {
          bufferContent = " worldhi"
        } else if (cmd.includes('""P')) {
          bufferContent = "hi world"
        }
        return Promise.resolve()
      },
      eval: (expr: string) => {
        if (expr === "&undolevels") return Promise.resolve(1000)

        if (expr === "strlen(getline(1))") {
          return Promise.resolve(deleted ? 6 : 11) // " world" = 6, "hello world" = 11
        }

        if (expr === 'getregtype("\\"")') return Promise.resolve("v")
        if (expr === 'getreg("\\"")') return Promise.resolve("hi")
        return Promise.resolve("")
      },
      line: () => Promise.resolve(1),
      getline: () => Promise.resolve(bufferContent),
    })

    const pasteCmd = await executeReplaceOperator({
      motionWise: "char",
      register: '"',
      visualMode: true,
    }, mockVimApi)

    assertEquals(pasteCmd, "P", "Should use P for beginning of line")
    assertEquals(bufferContent, "hi world", "Should correctly replace at beginning")
  })
})
