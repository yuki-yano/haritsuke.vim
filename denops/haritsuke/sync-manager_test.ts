/**
 * Tests for sync-manager.ts
 * Testing synchronization management functionality
 */

import { assertEquals, spy } from "./deps/test.ts"
import { createSyncManager } from "./sync-manager.ts"
import type { SyncStatus, YankDatabase } from "./database.ts"
import type { YankCache } from "./cache.ts"
import type { YankEntry } from "./types.ts"

// Mock database
const createMockDatabase = (
  status: SyncStatus = { lastTimestamp: 0, entryCount: 0 },
  entries: YankEntry[] = [],
): YankDatabase => {
  const getSyncStatusSpy = spy(() => status)
  const getRecentSpy = spy((limit?: number) => entries.slice(0, limit))

  return {
    init: () => Promise.resolve(),
    add: () => Promise.reject("Not implemented"),
    getRecent: getRecentSpy,
    getStats: () => ({ totalCount: entries.length, maxHistory: 100 }),
    getSyncStatus: getSyncStatusSpy,
    close: () => {},
  }
}

// Mock cache
const createMockCache = (): YankCache => {
  const setAllSpy = spy(() => {})

  return {
    add: () => {},
    getAll: () => [],
    getRecent: () => [],
    get: () => undefined,
    size: 0,
    clear: () => {},
    search: () => [],
    filterByFiletype: () => [],
    setAll: setAllSpy,
    moveToFront: () => false,
    getStats: () => ({
      totalSize: 0,
      totalBytes: 0,
      byFiletype: {},
      byRegtype: {},
    }),
  }
}

Deno.test("createSyncManager - no sync needed when status unchanged", async () => {
  const status: SyncStatus = { lastTimestamp: 1000, entryCount: 5 }
  const mockDb = createMockDatabase(status)
  const mockCache = createMockCache()

  const syncManager = createSyncManager(mockDb, mockCache, { maxEntries: 100 })

  // Initialize status
  syncManager.updateStatus()

  // Try sync - should not sync since status is unchanged
  const synced = await syncManager.syncIfNeeded()
  assertEquals(synced, false)

  // Verify cache.setAll was not called
  assertEquals((mockCache.setAll as ReturnType<typeof spy>).calls.length, 0)
})

Deno.test("createSyncManager - syncs when timestamp changes", async () => {
  const initialStatus: SyncStatus = { lastTimestamp: 1000, entryCount: 5 }
  const newStatus: SyncStatus = { lastTimestamp: 2000, entryCount: 5 }
  const entries: YankEntry[] = [
    { id: "1", content: "test1", regtype: "v", timestamp: 1000 },
    { id: "2", content: "test2", regtype: "V", timestamp: 2000 },
  ]

  let currentStatus = initialStatus
  const mockDb = createMockDatabase(initialStatus, entries)
  // Override getSyncStatus to return different values
  mockDb.getSyncStatus = spy(() => currentStatus)

  const mockCache = createMockCache()
  const syncManager = createSyncManager(mockDb, mockCache, { maxEntries: 100 })

  // Initialize with initial status
  syncManager.updateStatus()

  // Change status
  currentStatus = newStatus

  // Try sync - should sync since timestamp changed
  const synced = await syncManager.syncIfNeeded()
  assertEquals(synced, true)

  // Verify cache.setAll was called with entries
  const setAllCalls = (mockCache.setAll as ReturnType<typeof spy>).calls
  assertEquals(setAllCalls.length, 1)
  assertEquals(setAllCalls[0].args[0], entries)
})

Deno.test("createSyncManager - syncs when entry count changes", async () => {
  const initialStatus: SyncStatus = { lastTimestamp: 1000, entryCount: 5 }
  const newStatus: SyncStatus = { lastTimestamp: 1000, entryCount: 6 }

  let currentStatus = initialStatus
  const mockDb = createMockDatabase()
  mockDb.getSyncStatus = spy(() => currentStatus)

  const mockCache = createMockCache()
  const syncManager = createSyncManager(mockDb, mockCache, { maxEntries: 100 })

  // Initialize
  syncManager.updateStatus()

  // Change entry count
  currentStatus = newStatus

  const synced = await syncManager.syncIfNeeded()
  assertEquals(synced, true)
})

Deno.test("createSyncManager - respects maxEntries limit", async () => {
  const entries: YankEntry[] = Array.from({ length: 200 }, (_, i) => ({
    id: `${i}`,
    content: `test${i}`,
    regtype: "v" as const,
    timestamp: i,
  }))

  const mockDb = createMockDatabase(
    { lastTimestamp: 1000, entryCount: 200 },
    entries,
  )
  const mockCache = createMockCache()
  const syncManager = createSyncManager(mockDb, mockCache, { maxEntries: 50 })

  await syncManager.syncIfNeeded()

  // Verify getRecent was called with maxEntries limit
  const getRecentCalls = (mockDb.getRecent as ReturnType<typeof spy>).calls
  assertEquals(getRecentCalls.length, 1)
  assertEquals(getRecentCalls[0].args[0], 50)
})

Deno.test("createSyncManager - getLastStatus returns null initially", () => {
  const mockDb = createMockDatabase()
  const mockCache = createMockCache()
  const syncManager = createSyncManager(mockDb, mockCache, { maxEntries: 100 })

  assertEquals(syncManager.getLastStatus(), null)
})

Deno.test("createSyncManager - getLastStatus returns status after updateStatus", () => {
  const status: SyncStatus = { lastTimestamp: 3000, entryCount: 10 }
  const mockDb = createMockDatabase(status)
  const mockCache = createMockCache()
  const syncManager = createSyncManager(mockDb, mockCache, { maxEntries: 100 })

  syncManager.updateStatus()
  assertEquals(syncManager.getLastStatus(), status)
})

Deno.test("createSyncManager - getLastStatus returns status after sync", async () => {
  const status: SyncStatus = { lastTimestamp: 4000, entryCount: 15 }
  const mockDb = createMockDatabase(status)
  const mockCache = createMockCache()
  const syncManager = createSyncManager(mockDb, mockCache, { maxEntries: 100 })

  await syncManager.syncIfNeeded()
  assertEquals(syncManager.getLastStatus(), status)
})

Deno.test("createSyncManager - logs sync operations with logger", async () => {
  const mockLogger = {
    log: spy((..._args: unknown[]) => {}),
    error: spy((..._args: unknown[]) => {}),
    time: spy(() => {}),
    timeEnd: spy(() => {}),
  }

  const initialStatus: SyncStatus = { lastTimestamp: 1000, entryCount: 5 }
  const newStatus: SyncStatus = { lastTimestamp: 2000, entryCount: 6 }

  let currentStatus = initialStatus
  const mockDb = createMockDatabase()
  mockDb.getSyncStatus = spy(() => currentStatus)

  const mockCache = createMockCache()
  const syncManager = createSyncManager(
    mockDb,
    mockCache,
    { maxEntries: 100 },
    mockLogger,
  )

  // Update status
  syncManager.updateStatus()
  assertEquals(mockLogger.log.calls.length, 1)
  assertEquals(mockLogger.log.calls[0].args[1], "Status updated")

  // No sync needed
  await syncManager.syncIfNeeded()
  assertEquals(mockLogger.log.calls[1].args[1], "No changes detected")

  // Sync needed
  currentStatus = newStatus
  await syncManager.syncIfNeeded()
  assertEquals(mockLogger.log.calls[2].args[1], "Changes detected, syncing...")
  assertEquals(mockLogger.log.calls[3].args[1], "Synced 0 entries")
})
