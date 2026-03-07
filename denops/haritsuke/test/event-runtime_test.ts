import { assertEquals, assertSpyCall, assertSpyCalls, describe, it, spy } from "../deps/test.ts"
import { createRounder, type RounderManager } from "../core/rounder.ts"
import {
  clearHighlightWhenRounderInactive,
  getCurrentBufferRounder,
  skipIfApplyingHistory,
} from "../events/event-runtime.ts"
import { createMockDenops, createMockLogger } from "./test-helpers.ts"

describe("event-runtime", () => {
  describe("skipIfApplyingHistory", () => {
    it("returns true and logs skip when history application is active", async () => {
      const denops = createMockDenops({
        eval: (expr: string) => {
          if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
            return Promise.resolve(1)
          }
          return Promise.resolve(0)
        },
      })
      const logger = createMockLogger()

      const skipped = await skipIfApplyingHistory(denops, logger, {
        category: "cursor",
        handlerName: "onCursorMoved",
      })

      assertEquals(skipped, true)

      const logs = logger.getLogs()
      const skipLog = logs.find((log) =>
        log.category === "cursor" && log.message === "Skipping onCursorMoved - applying history"
      )
      assertEquals(!!skipLog, true)
    })

    it("returns false when history application is inactive", async () => {
      const denops = createMockDenops()
      const logger = createMockLogger()

      const skipped = await skipIfApplyingHistory(denops, logger, {
        category: "event",
        handlerName: "onStopRounder",
      })

      assertEquals(skipped, false)
      assertEquals(logger.getLogs().length, 0)
    })
  })

  describe("getCurrentBufferRounder", () => {
    it("resolves rounder with current buffer number", async () => {
      const denops = createMockDenops({
        call: (fn: string, ...args: unknown[]) => {
          if (fn === "bufnr" && args[0] === "%") {
            return Promise.resolve(7)
          }
          return Promise.resolve(undefined)
        },
      })
      const rounder = createRounder(null)
      const getRounderSpy = spy((_denops: unknown, _bufnr: number) => Promise.resolve(rounder))
      const rounderManager = {
        getRounder: getRounderSpy,
        deleteRounder: () => {},
        clear: () => {},
      } as RounderManager

      const resolved = await getCurrentBufferRounder(denops, rounderManager)

      assertEquals(resolved, rounder)
      assertSpyCall(getRounderSpy, 0, { args: [denops, 7] })
    })
  })

  describe("clearHighlightWhenRounderInactive", () => {
    it("clears highlight when rounder manager is missing", async () => {
      const denops = createMockDenops()
      const clearHighlightSpy = spy(() => Promise.resolve())

      await clearHighlightWhenRounderInactive(denops, null, clearHighlightSpy)

      assertSpyCalls(clearHighlightSpy, 1)
    })

    it("does not clear highlight while rounder is active", async () => {
      const denops = createMockDenops()
      const clearHighlightSpy = spy(() => Promise.resolve())
      const rounder = {
        isActive: () => true,
      }
      const rounderManager = {
        getRounder: spy(() => Promise.resolve(rounder)),
        deleteRounder: () => {},
        clear: () => {},
      } as unknown as RounderManager

      await clearHighlightWhenRounderInactive(denops, rounderManager, clearHighlightSpy)

      assertSpyCalls(clearHighlightSpy, 0)
    })

    it("clears highlight when rounder is inactive", async () => {
      const denops = createMockDenops()
      const clearHighlightSpy = spy(() => Promise.resolve())
      const rounder = {
        isActive: () => false,
      }
      const rounderManager = {
        getRounder: spy(() => Promise.resolve(rounder)),
        deleteRounder: () => {},
        clear: () => {},
      } as unknown as RounderManager

      await clearHighlightWhenRounderInactive(denops, rounderManager, clearHighlightSpy)

      assertSpyCalls(clearHighlightSpy, 1)
    })
  })
})
