/**
 * Test for cache reordering behavior when selecting an entry
 */

import { assertEquals, describe, it } from "../deps/test.ts"
import { createYankCache } from "../data/cache.ts"
import type { YankEntry } from "../types.ts"

// Helper to create test entries
const createTestEntry = (id: string, content: string, timestamp?: number): YankEntry => ({
  id,
  content,
  regtype: "v",
  timestamp: timestamp || Date.now(),
})

describe("cache - reordering", () => {
  it("selected entry should move to front without removing the original newest", () => {
    const cache = createYankCache(10)

    // Add 5 entries
    const entry1 = createTestEntry("1", "oldest", 1000)
    const entry2 = createTestEntry("2", "second", 2000)
    const entry3 = createTestEntry("3", "middle", 3000)
    const entry4 = createTestEntry("4", "fourth", 4000)
    const entry5 = createTestEntry("5", "newest", 5000)

    cache.add(entry1)
    cache.add(entry2)
    cache.add(entry3)
    cache.add(entry4)
    cache.add(entry5)

    // Current order should be: 5, 4, 3, 2, 1 (newest to oldest)
    let entries = cache.getAll()
    assertEquals(entries.length, 5, "Should have 5 entries")
    assertEquals(entries[0].id, "5", "Newest should be first")
    assertEquals(entries[1].id, "4", "Fourth should be second")
    assertEquals(entries[2].id, "3", "Middle should be third")
    assertEquals(entries[3].id, "2", "Second should be fourth")
    assertEquals(entries[4].id, "1", "Oldest should be last")

    console.log("Before reordering:", entries.map((e) => ({ id: e.id, content: e.content })))

    // Now select entry3 (middle) - this simulates what happens when user cycles to it
    const moved = cache.moveToFront("3")
    assertEquals(moved, true, "Should successfully move entry3 to front")

    // Expected order after selecting entry3: 3, 5, 4, 2, 1
    // entry3 moves to front, others slide down
    entries = cache.getAll()
    console.log("After selecting entry3:", entries.map((e) => ({ id: e.id, content: e.content })))

    assertEquals(entries.length, 5, "Should still have 5 entries")
    assertEquals(entries[0].id, "3", "Selected entry3 should be first")
    assertEquals(entries[1].id, "5", "Original newest should be second")
    assertEquals(entries[2].id, "4", "Fourth should be third")
    assertEquals(entries[3].id, "2", "Second should be fourth")
    assertEquals(entries[4].id, "1", "Oldest should be last")
  })

  it("newest entry re-added should stay at front", () => {
    const cache = createYankCache(10)

    const entry1 = createTestEntry("1", "oldest", 1000)
    const entry2 = createTestEntry("2", "newest", 2000)

    cache.add(entry1)
    cache.add(entry2)

    // Order: 2, 1
    let entries = cache.getAll()
    assertEquals(entries.length, 2)
    assertEquals(entries[0].id, "2")
    assertEquals(entries[1].id, "1")

    // Move the newest entry to front (should stay at front)
    const moved = cache.moveToFront("2")
    assertEquals(moved, true, "Should return true even if already at front")

    // Should still be: 2, 1
    entries = cache.getAll()
    assertEquals(entries.length, 2, "Should still have 2 entries")
    assertEquals(entries[0].id, "2", "Newest should stay first")
    assertEquals(entries[1].id, "1", "Oldest should stay second")
  })

  it("duplicate entries are allowed and added as new", () => {
    const cache = createYankCache(10)

    const entry1 = createTestEntry("1", "content", 1000)
    const entry2 = createTestEntry("2", "content", 2000) // Same content
    const entry3 = createTestEntry("3", "content", 3000) // Same content

    cache.add(entry1)
    cache.add(entry2)
    cache.add(entry3)

    const entries = cache.getAll()
    assertEquals(entries.length, 3, "Should have 3 entries even with same content")
    assertEquals(entries[0].id, "3", "Newest should be first")
    assertEquals(entries[1].id, "2", "Second should be second")
    assertEquals(entries[2].id, "1", "Oldest should be third")
  })
})

describe("cache - moveToFront", () => {
  it("non-existent entry returns false", () => {
    const cache = createYankCache(10)

    const entry1 = createTestEntry("1", "content", 1000)
    cache.add(entry1)

    const moved = cache.moveToFront("999")
    assertEquals(moved, false, "Should return false for non-existent entry")

    const entries = cache.getAll()
    assertEquals(entries.length, 1, "Should still have 1 entry")
    assertEquals(entries[0].id, "1", "Original entry should remain")
  })
})
