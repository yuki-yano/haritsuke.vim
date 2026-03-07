import { assertEquals, assertSpyCalls, describe, it, spy } from "../deps/test.ts"
import type { Denops } from "../deps/denops.ts"
import type { Rounder } from "../core/rounder.ts"
import { createYankCache } from "../data/cache.ts"
import { createRounderSessionService } from "../core/rounder-session.ts"
import { createMockFileSystemApi, createMockVimApi } from "../vim/vim-api.ts"

const createMockDenops = (): Denops => {
  return {
    call: spy((fn: string) => {
      if (fn === "bufnr") {
        return Promise.resolve(1)
      }
      if (fn === "setbufvar") {
        return Promise.resolve()
      }
      return Promise.resolve()
    }),
    cmd: spy(() => Promise.resolve()),
    eval: spy(() => Promise.resolve()),
  } as unknown as Denops
}

describe("createRounderSessionService", () => {
  it("starts a new rounder session with filtered register entries", async () => {
    const cache = createYankCache(10)
    cache.add({ id: "1", content: "a-1", regtype: "v", timestamp: 1, register: "a" })
    cache.add({ id: "2", content: "default", regtype: "v", timestamp: 2, register: '"' })
    cache.add({ id: "3", content: "a-2", regtype: "V", timestamp: 3, register: "a" })

    const clearHighlightSpy = spy(() => Promise.resolve())
    const rounder = {
      isActive: spy(() => true),
      stop: spy(),
      start: spy(() => Promise.resolve()),
      setBeforePasteCursorPos: spy(),
    } as unknown as Rounder

    const service = createRounderSessionService({
      cache,
      vimApi: createMockVimApi({
        getpos: () => Promise.resolve([0, 9, 4, 0]),
      }),
      fileSystemApi: createMockFileSystemApi(),
      logger: null,
      shouldUseRegionHighlight: () => false,
      callbacks: {
        clearHighlight: clearHighlightSpy,
        applyHighlight: spy(() => Promise.resolve()),
      },
    })

    await service.startForPaste(
      createMockDenops(),
      rounder,
      { mode: "p", vmode: "n", count: 1, register: "a" },
    )

    assertSpyCalls(rounder.isActive as ReturnType<typeof spy>, 1)
    assertSpyCalls(rounder.stop as ReturnType<typeof spy>, 1)
    assertSpyCalls(clearHighlightSpy, 1)
    assertSpyCalls(rounder.start as ReturnType<typeof spy>, 1)
    assertEquals((rounder.start as ReturnType<typeof spy>).calls[0]?.args[0], [
      { id: "3", content: "a-2", regtype: "V", timestamp: 3, register: "a" },
      { id: "1", content: "a-1", regtype: "v", timestamp: 1, register: "a" },
    ])
    assertEquals((rounder.start as ReturnType<typeof spy>).calls[0]?.args[1], {
      mode: "p",
      count: 1,
      register: "a",
      visualMode: false,
      actualPasteCommand: "p",
    })
    assertEquals((rounder.setBeforePasteCursorPos as ReturnType<typeof spy>).calls[0]?.args[0], [0, 9, 4, 0])
  })

  it("completes a paste session and records highlight, marks, and undo file", async () => {
    const commands: string[] = []
    const applyHighlightSpy = spy(() => Promise.resolve())
    const rounder = {
      setCursorPos: spy(),
      setChangedTick: spy(),
      setPasteRange: spy(),
      setUndoSeq: spy(),
      setUndoFilePath: spy(),
      getCurrentEntry: () => ({ id: "1", content: "line\n", regtype: "V", timestamp: 1 }),
    } as unknown as Rounder

    const service = createRounderSessionService({
      cache: createYankCache(10),
      vimApi: createMockVimApi({
        getpos: (mark: string) => {
          if (mark === "'[") return Promise.resolve([0, 4, 1, 0])
          if (mark === "']") return Promise.resolve([0, 6, 3, 0])
          return Promise.resolve([0, 6, 3, 0])
        },
        eval: (expr: string) => {
          if (expr === "b:changedtick") return Promise.resolve(42)
          return Promise.resolve(undefined)
        },
        undotree: () => Promise.resolve({ seq_cur: 99 }),
        cmd: spy((command: string) => {
          commands.push(command)
          return Promise.resolve()
        }),
      }),
      fileSystemApi: createMockFileSystemApi(),
      logger: null,
      shouldUseRegionHighlight: () => true,
      callbacks: {
        clearHighlight: spy(() => Promise.resolve()),
        applyHighlight: applyHighlightSpy,
      },
    })

    await service.completePaste(
      createMockDenops(),
      rounder,
      { mode: "gp", vmode: "n", count: 1, register: '"', undoFilePath: "/tmp/session.undo" },
    )

    assertEquals((rounder.setChangedTick as ReturnType<typeof spy>).calls[0]?.args[0], 42)
    assertEquals((rounder.setPasteRange as ReturnType<typeof spy>).calls[0]?.args, [[0, 4, 1, 0], [0, 6, 3, 0]])
    assertEquals((rounder.setUndoSeq as ReturnType<typeof spy>).calls[0]?.args[0], 99)
    assertEquals((rounder.setUndoFilePath as ReturnType<typeof spy>).calls[0]?.args[0], "/tmp/session.undo")
    assertSpyCalls(applyHighlightSpy, 1)
    assertEquals(commands, ["normal! `]"])
  })

  it("stops a rounder session and moves the selected entry to the front", async () => {
    const cache = createYankCache(10)
    cache.add({ id: "1", content: "older", regtype: "v", timestamp: 1, register: '"' })
    cache.add({ id: "2", content: "newer", regtype: "v", timestamp: 2, register: '"' })

    const clearHighlightSpy = spy(() => Promise.resolve())
    const fileSystemRemoveSpy = spy(() => Promise.resolve())
    const rounder = {
      getUndoFilePath: () => "/tmp/undo-file",
      getCurrentEntry: () => ({ id: "1", content: "older", regtype: "v", timestamp: 1, register: '"' }),
      stop: spy(),
    } as unknown as Rounder

    const service = createRounderSessionService({
      cache,
      vimApi: createMockVimApi(),
      fileSystemApi: createMockFileSystemApi({
        remove: fileSystemRemoveSpy,
      }),
      logger: null,
      shouldUseRegionHighlight: () => false,
      callbacks: {
        clearHighlight: clearHighlightSpy,
        applyHighlight: spy(() => Promise.resolve()),
      },
    })

    await service.stop(createMockDenops(), rounder, "test stop")

    assertSpyCalls(fileSystemRemoveSpy, 1)
    assertSpyCalls(rounder.stop as ReturnType<typeof spy>, 1)
    assertSpyCalls(clearHighlightSpy, 1)
    assertEquals(cache.getAll().map((entry) => entry.id), ["1", "2"])
  })
})
