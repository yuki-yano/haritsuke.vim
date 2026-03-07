import { assertEquals, describe, it } from "../deps/test.ts"
import { getBufferDebugState, logBufferDebugState } from "../utils/buffer-debug.ts"
import { createMockLogger } from "./test-helpers.ts"

describe("buffer-debug", () => {
  describe("getBufferDebugState", () => {
    it("collects the current buffer snapshot", async () => {
      const state = await getBufferDebugState({
        line: (expr: string) => {
          if (expr === "$") {
            return Promise.resolve(12)
          }
          return Promise.resolve(4)
        },
        getpos: () => Promise.resolve([0, 4, 8, 0]),
        getline: () => Promise.resolve("current line"),
      })

      assertEquals(state, {
        totalLines: 12,
        currentLine: 4,
        cursorPos: [0, 4, 8, 0],
        lineContent: "current line",
      })
    })
  })

  describe("logBufferDebugState", () => {
    it("logs buffer snapshot with extra debug fields", async () => {
      const logger = createMockLogger()

      await logBufferDebugState(
        logger,
        "paste",
        "Buffer state at preparePaste",
        {
          line: (expr: string) => {
            if (expr === "$") {
              return Promise.resolve(3)
            }
            return Promise.resolve(1)
          },
          getpos: () => Promise.resolve([0, 1, 1, 0]),
          getline: () => Promise.resolve("line"),
        },
        {
          visualMarks: {
            start: [0, 1, 1, 0],
            end: [0, 1, 4, 0],
          },
        },
      )

      assertEquals(logger.getLogs(), [
        {
          category: "paste",
          message: "Buffer state at preparePaste",
          data: {
            totalLines: 3,
            currentLine: 1,
            cursorPos: [0, 1, 1, 0],
            lineContent: "line",
            visualMarks: {
              start: [0, 1, 1, 0],
              end: [0, 1, 4, 0],
            },
          },
        },
      ])
    })

    it("does nothing when logger is null", async () => {
      await logBufferDebugState(
        null,
        "apply",
        "Before undo",
        {
          line: () => Promise.resolve(1),
          getpos: () => Promise.resolve([0, 1, 1, 0]),
          getline: () => Promise.resolve("line"),
        },
      )
    })
  })
})
