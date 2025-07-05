/**
 * Test for paste command logic in operator-replace
 */

import { assertEquals, describe, it } from "./deps/test.ts"
import type { VimApi } from "./vim-api.ts"

// Mock VimApi for testing
const createMockVimApi = (
  bufferEndLine: number,
  bufferEndCol: number,
  motionEndLineLength: number,
): VimApi => {
  return {
    line: (arg: string) => {
      if (arg === "$") return bufferEndLine
      throw new Error(`Unexpected line arg: ${arg}`)
    },
    eval: (expr: string) => {
      if (expr === `strlen(getline(${bufferEndLine}))`) {
        return bufferEndCol
      }
      // For motion end line length
      const match = expr.match(/strlen\(getline\((\d+)\)\)/)
      if (match) {
        return motionEndLineLength
      }
      throw new Error(`Unexpected eval expr: ${expr}`)
    },
  } as unknown as VimApi
}

// Copy the logic from operator-replace.ts for testing
const deletionMovesTheCursor = async (
  motionWise: string,
  motionEndPos: number[],
  vimApi: VimApi,
): Promise<boolean> => {
  const bufferEndLine = await vimApi.line("$")
  const bufferEndCol = await vimApi.eval(`strlen(getline(${bufferEndLine}))`) as number

  const motionEndLine = motionEndPos[1]
  const motionEndCol = motionEndPos[2]

  if (motionWise === "char") {
    const motionEndLastCol = await vimApi.eval(`strlen(getline(${motionEndLine}))`) as number

    return (motionEndCol === motionEndLastCol) ||
      (bufferEndLine === motionEndLine && bufferEndCol <= motionEndCol)
  } else if (motionWise === "line") {
    return bufferEndLine === motionEndLine
  } else {
    return false
  }
}

const getPasteCommand = async (
  motionWise: string,
  _visualMode: boolean,
  endPos: number[],
  vimApi: VimApi,
): Promise<string> => {
  // Use vim-operator-replace logic for both visual and normal modes
  const movesCursor = await deletionMovesTheCursor(motionWise, endPos, vimApi)
  return movesCursor ? "p" : "P"
}

describe("operator-replace paste logic", () => {
  describe("char-wise operations", () => {
    it("should use P for word deletion in middle", async () => {
      const vimApi = createMockVimApi(10, 20, 30) // buffer: 10 lines, last line 20 chars
      const endPos = [0, 5, 10, 0] // line 5, col 10

      const result = await getPasteCommand("char", false, endPos, vimApi)
      assertEquals(result, "P")
    })

    it("should use p when deleting to end of line", async () => {
      const vimApi = createMockVimApi(10, 20, 30) // buffer: 10 lines, last line 20 chars
      const endPos = [0, 5, 30, 0] // line 5, col 30 (end of line)

      const result = await getPasteCommand("char", false, endPos, vimApi)
      assertEquals(result, "p")
    })

    it("should use p when deleting to end of buffer", async () => {
      const vimApi = createMockVimApi(10, 20, 20) // buffer: 10 lines, last line 20 chars
      const endPos = [0, 10, 20, 0] // line 10 (last line), col 20 (end)

      const result = await getPasteCommand("char", false, endPos, vimApi)
      assertEquals(result, "p")
    })
  })

  describe("line-wise operations", () => {
    it("should use P for line deletion in middle", async () => {
      const vimApi = createMockVimApi(10, 20, 30) // buffer: 10 lines
      const endPos = [0, 5, 1, 0] // line 5

      const result = await getPasteCommand("line", false, endPos, vimApi)
      assertEquals(result, "P")
    })

    it("should use p when deleting to last line", async () => {
      const vimApi = createMockVimApi(10, 20, 30) // buffer: 10 lines
      const endPos = [0, 10, 1, 0] // line 10 (last line)

      const result = await getPasteCommand("line", false, endPos, vimApi)
      assertEquals(result, "p")
    })

    describe("reported issue: line-wise to last line", () => {
      it("should use p when deleting lines 3-5 where line 5 is last line", async () => {
        // Simulate a buffer with 5 lines
        const vimApi = createMockVimApi(5, 10, 10)

        // Test deleting lines 3-5 (to the last line)
        const endPos = [0, 5, 1, 0] // line 5 (last line)

        const result = await getPasteCommand("line", false, endPos, vimApi)
        assertEquals(result, "p")

        // Explanation:
        // 1. Before delete: lines 1,2,3,4,5 (cursor at line 3)
        // 2. After delete: lines 1,2 (cursor moves to line 2, the new last line)
        // 3. Using 'p' pastes AFTER line 2, which becomes line 3
        // 4. Result: content is pasted at the original line 3 position
      })

      it("should use P when NOT deleting to last line", async () => {
        // Simulate a buffer with 10 lines
        const vimApi = createMockVimApi(10, 10, 10)

        // Test deleting lines 3-5 (NOT to the last line)
        const endPos = [0, 5, 1, 0] // line 5 (not last line)

        const result = await getPasteCommand("line", false, endPos, vimApi)
        assertEquals(result, "P")

        // This means: after deleting lines 3-5, cursor is at line 3
        // Using 'P' will paste AT line 3
        // This maintains the position correctly
      })
    })
  })

  describe("block-wise operations", () => {
    it("should always use P for block-wise", async () => {
      const vimApi = createMockVimApi(10, 20, 30)
      const endPos = [0, 5, 10, 0]

      const result = await getPasteCommand("block", false, endPos, vimApi)
      assertEquals(result, "P")
    })
  })

  describe("visual mode", () => {
    it("should use vim-operator-replace logic in visual mode", async () => {
      const vimApi = createMockVimApi(10, 20, 30)

      // Visual mode now uses the same logic as normal mode
      const endPos = [0, 10, 1, 0] // last line
      const result = await getPasteCommand("line", true, endPos, vimApi)
      assertEquals(result, "p") // Should use p when deleting to last line
    })

    it("should use P in visual mode when not deleting to last line", async () => {
      const vimApi = createMockVimApi(10, 20, 30)

      const endPos = [0, 5, 1, 0] // not last line
      const result = await getPasteCommand("line", true, endPos, vimApi)
      assertEquals(result, "P")
    })
  })
})
