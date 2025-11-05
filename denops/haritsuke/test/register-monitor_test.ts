/**
 * Tests for register-monitor.ts
 * Testing register monitoring functionality with dependency injection
 */

import { assertEquals, assertSpyCall, assertSpyCalls, describe, it, spy } from "../deps/test.ts"
import type { Denops } from "../deps/denops.ts"
import { createRegisterMonitor } from "../events/register-monitor.ts"
import { createYankCache } from "../data/cache.ts"
import { createRounder } from "../core/rounder.ts"
import type { YankEntry } from "../types.ts"
import type { VimApi } from "../vim/vim-api.ts"
import { createMockFileSystemApi, createMockVimApi } from "../vim/vim-api.ts"
import type { RounderManager } from "../core/rounder.ts"
import type { RegisterMonitorCallbacks } from "../events/register-monitor.ts"

// Mock RounderManager
const createMockRounderManager = (): RounderManager => {
  const rounder = createRounder(null)
  return {
    getRounder: () => Promise.resolve(rounder),
    deleteRounder: () => {},
    clear: () => {},
  }
}

// Mock YankDatabase
const createMockDatabase = () => {
  const entries: YankEntry[] = []
  return {
    init: () => Promise.resolve(),
    add: (entry: Omit<YankEntry, "id" | "size">) => {
      const newEntry: YankEntry = {
        ...entry,
        id: String(entries.length + 1),
        size: entry.content.length,
      }
      entries.push(newEntry)
      return Promise.resolve(newEntry)
    },
    getRecent: () => entries,
    getSyncStatus: () => ({ lastTimestamp: Date.now(), entryCount: entries.length }),
    clear: () => {
      entries.length = 0
      return Promise.resolve()
    },
    close: () => {},
  }
}

describe("createRegisterMonitor", () => {
  it("detects register content changes", async () => {
    const database = createMockDatabase()
    const cache = createYankCache()
    const rounderManager = createMockRounderManager()

    // Mock VimApi
    let registerContent = "initial content"
    const mockVimApi: VimApi = createMockVimApi({
      bufnr: () => Promise.resolve(1),
      getreg: () => Promise.resolve(registerContent),
      getregtype: () => Promise.resolve("v"),
    })

    const mockFileSystemApi = createMockFileSystemApi()
    const mockCallbacks: RegisterMonitorCallbacks = {
      clearHighlight: spy(() => Promise.resolve()),
    }

    const registerMonitor = createRegisterMonitor(
      database,
      cache,
      rounderManager,
      null, // no logger
      { stopCachingVariable: "_haritsuke_stop_caching" },
      mockVimApi,
      mockFileSystemApi,
      mockCallbacks,
    )

    // First check - should initialize with current content
    await registerMonitor.checkChanges({} as Denops)

    // Verify no entry was added on initialization
    assertEquals(cache.size, 0)

    // Change register content
    registerContent = "new content"

    // Second check - should detect change
    await registerMonitor.checkChanges({} as Denops)

    // Verify new entry was added
    assertEquals(cache.size, 1)
    const newEntries = cache.getAll()
    assertEquals(newEntries[0].content, "new content")
    assertEquals(newEntries[0].register, '"')

    // Same content check - should not add duplicate
    await registerMonitor.checkChanges({} as Denops)
    assertEquals(cache.size, 1) // No new entry
  })

  it("does not add duplicate when content unchanged", async () => {
    const database = createMockDatabase()
    const cache = createYankCache()
    const rounderManager = createMockRounderManager()

    const mockVimApi = createMockVimApi({
      bufnr: () => Promise.resolve(1),
      getreg: () => Promise.resolve("test content"),
      getregtype: () => Promise.resolve("v"),
    })

    const mockFileSystemApi = createMockFileSystemApi()
    const mockCallbacks: RegisterMonitorCallbacks = {
      clearHighlight: spy(() => Promise.resolve()),
    }

    const registerMonitor = createRegisterMonitor(
      database,
      cache,
      rounderManager,
      null,
      { stopCachingVariable: "_haritsuke_stop_caching" },
      mockVimApi,
      mockFileSystemApi,
      mockCallbacks,
    )

    // First check - initializes with content
    await registerMonitor.checkChanges({} as Denops)
    assertEquals(cache.size, 0) // No entry added on initialization

    // Second check with same content - should not add duplicate
    await registerMonitor.checkChanges({} as Denops)
    assertEquals(cache.size, 0) // Still 0, no entry added
  })

  it("stops active rounder when new yank detected", async () => {
    const database = createMockDatabase()
    const cache = createYankCache()
    const rounderManager = createMockRounderManager()

    // Mock register content
    let registerContent = "old content"
    const mockVimApi = createMockVimApi({
      bufnr: () => Promise.resolve(1),
      getreg: () => Promise.resolve(registerContent),
      getregtype: () => Promise.resolve("v"),
    })

    const removeSpy = spy(() => Promise.resolve())
    const mockFileSystemApi = createMockFileSystemApi({
      remove: removeSpy,
    })

    const mockCallbacks: RegisterMonitorCallbacks = {
      clearHighlight: spy(() => Promise.resolve()),
    }

    const registerMonitor = createRegisterMonitor(
      database,
      cache,
      rounderManager,
      null,
      { stopCachingVariable: "_haritsuke_stop_caching" },
      mockVimApi,
      mockFileSystemApi,
      mockCallbacks,
    )

    // First check - initialize
    await registerMonitor.checkChanges({} as Denops)
    assertEquals(cache.size, 0) // No entry on initialization

    // Change content to add first entry
    registerContent = "initial yank"
    await registerMonitor.checkChanges({} as Denops)
    assertEquals(cache.size, 1)
    assertEquals(cache.getAll()[0].content, "initial yank")

    // Start rounder with the initial entry
    const rounder = await rounderManager.getRounder({} as Denops, 1)
    await rounder.start(cache.getAll(), { mode: "p", count: 1, register: '"' })
    rounder.setUndoFilePath("/tmp/undo.txt")

    // Verify rounder is active
    assertEquals(rounder.isActive(), true)

    // Change register content - simulate new yank during history cycling
    registerContent = "new yanked content"

    // Check again - should detect new yank and stop rounder
    await registerMonitor.checkChanges({} as Denops)

    // Verify new content was detected and added
    assertEquals(cache.size, 2)
    const entries = cache.getAll()
    assertEquals(entries[0].content, "new yanked content")

    // Verify rounder was stopped
    assertEquals(rounder.isActive(), false)

    // Verify undo file deletion was attempted
    assertSpyCalls(removeSpy, 1)
    assertSpyCall(removeSpy, 0, {
      args: ["/tmp/undo.txt"],
    })

    // Verify highlight was cleared
    assertSpyCalls(mockCallbacks.clearHighlight as ReturnType<typeof spy>, 1)
  })

  it("tracks configured registers independently", async () => {
    const database = createMockDatabase()
    const cache = createYankCache()
    const rounderManager = createMockRounderManager()

    const registerContent: Record<string, string | string[]> = {
      '"': "",
      a: "",
      b: "",
    }

    let currentRegister = '"'

    const mockVimApi = createMockVimApi({
      bufnr: () => Promise.resolve(1),
      getreg: (reg: string) => Promise.resolve(registerContent[reg] || ""),
      getregtype: () => Promise.resolve("v"),
      eval: (expr: string) => {
        if (expr === "get(v:event, 'regname', '\"')") {
          return Promise.resolve(currentRegister)
        }
        return Promise.resolve(undefined)
      },
    })

    const mockFileSystemApi = createMockFileSystemApi()
    const mockCallbacks: RegisterMonitorCallbacks = {
      clearHighlight: spy(() => Promise.resolve()),
    }

    const registerMonitor = createRegisterMonitor(
      database,
      cache,
      rounderManager,
      null,
      {
        stopCachingVariable: "_haritsuke_stop_caching",
        registerKeys: '"ab',
      },
      mockVimApi,
      mockFileSystemApi,
      mockCallbacks,
    )

    // Initialize unnamed register
    await registerMonitor.checkChanges({} as Denops)

    currentRegister = "a"
    registerContent.a = "alpha"
    await registerMonitor.checkChanges({} as Denops, true)

    currentRegister = "b"
    registerContent.b = "bravo"
    await registerMonitor.checkChanges({} as Denops, true)

    const entries = cache.getAll()
    assertEquals(entries.length, 2)
    assertEquals(entries[0].register, "b")
    assertEquals(entries[0].content, "bravo")
    assertEquals(entries[1].register, "a")
    assertEquals(entries[1].content, "alpha")
  })

  it("handles array register content", async () => {
    const database = createMockDatabase()
    const cache = createYankCache()
    const rounderManager = createMockRounderManager()

    // Mock VimApi returning array (linewise yank)
    const mockVimApi = createMockVimApi({
      bufnr: () => Promise.resolve(1),
      getreg: () => Promise.resolve(["line 1", "line 2", "line 3"]),
      getregtype: () => Promise.resolve("V"),
    })

    const mockFileSystemApi = createMockFileSystemApi()
    const mockCallbacks: RegisterMonitorCallbacks = {
      clearHighlight: spy(() => Promise.resolve()),
    }

    const registerMonitor = createRegisterMonitor(
      database,
      cache,
      rounderManager,
      null,
      { stopCachingVariable: "_haritsuke_stop_caching" },
      mockVimApi,
      mockFileSystemApi,
      mockCallbacks,
    )

    // First check - initialize
    await registerMonitor.checkChanges({} as Denops)
    assertEquals(cache.size, 0) // No entry on initialization

    // Update mock to return different content
    const lines = ["different", "content"]
    // @ts-ignore: Reassigning spy for test purposes
    mockVimApi.getreg = () => Promise.resolve(lines)

    // Second check with different content (array)
    await registerMonitor.checkChanges({} as Denops)

    // Verify entry was added with joined content
    assertEquals(cache.size, 1)
    const entries = cache.getAll()
    assertEquals(entries[0].content, "different\ncontent")
    assertEquals(entries[0].regtype, "V")
    assertEquals(entries[0].register, '"')
  })

  it("reset clears last content", () => {
    const database = createMockDatabase()
    const cache = createYankCache()
    const rounderManager = createMockRounderManager()

    const mockVimApi = createMockVimApi()
    const mockFileSystemApi = createMockFileSystemApi()
    const mockCallbacks: RegisterMonitorCallbacks = {
      clearHighlight: spy(() => Promise.resolve()),
    }

    const registerMonitor = createRegisterMonitor(
      database,
      cache,
      rounderManager,
      null,
      { stopCachingVariable: "_haritsuke_stop_caching" },
      mockVimApi,
      mockFileSystemApi,
      mockCallbacks,
    )

    // Set some content
    registerMonitor.getLastContent() // Initialize

    // Reset
    registerMonitor.reset()

    // Verify content was cleared
    assertEquals(registerMonitor.getLastContent(), "")
  })
})
