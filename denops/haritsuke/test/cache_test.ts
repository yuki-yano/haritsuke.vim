import { assertEquals, describe, it } from "../deps/test.ts"
import { createYankCache } from "../data/cache.ts"
import type { YankEntry } from "../types.ts"

describe("YankCache", () => {
  describe("basic operations", () => {
    it("should initialize with empty cache", () => {
      const cache = createYankCache()
      assertEquals(cache.size, 0)
      assertEquals(cache.getAll(), [])
    })

    it("should add entries to the cache", () => {
      const cache = createYankCache()
      const entry: YankEntry = {
        id: "test1",
        content: "test content",
        regtype: "v",
        timestamp: Date.now(),
        size: 12,
      }

      cache.add(entry)
      assertEquals(cache.size, 1)
      assertEquals(cache.get(0), entry)
    })

    it("should add entries to the front", () => {
      const cache = createYankCache()
      const entry1: YankEntry = {
        id: "test1",
        content: "first",
        regtype: "v",
        timestamp: Date.now(),
      }
      const entry2: YankEntry = {
        id: "test2",
        content: "second",
        regtype: "v",
        timestamp: Date.now() + 1,
      }

      cache.add(entry1)
      cache.add(entry2)

      assertEquals(cache.size, 2)
      assertEquals(cache.get(0), entry2) // Most recent entry
      assertEquals(cache.get(1), entry1)
    })

    it("should respect max size limit", () => {
      const cache = createYankCache(3) // Max size 3

      for (let i = 0; i < 5; i++) {
        cache.add({
          id: `test${i}`,
          content: `content ${i}`,
          regtype: "v",
          timestamp: Date.now() + i,
        })
      }

      assertEquals(cache.size, 3)
      assertEquals(cache.get(0)?.id, "test4") // Most recent
      assertEquals(cache.get(1)?.id, "test3")
      assertEquals(cache.get(2)?.id, "test2")
      assertEquals(cache.get(3), undefined) // Should not exist
    })
  })

  describe("setAll", () => {
    it("should replace all entries", () => {
      const cache = createYankCache()
      const entries: YankEntry[] = [
        { id: "1", content: "one", regtype: "v", timestamp: 1 },
        { id: "2", content: "two", regtype: "V", timestamp: 2 },
        { id: "3", content: "three", regtype: "b", timestamp: 3 },
      ]

      cache.setAll(entries)
      assertEquals(cache.size, 3)
      assertEquals(cache.getAll(), entries)
    })

    it("should respect max size when setting all", () => {
      const cache = createYankCache(2)
      const entries: YankEntry[] = [
        { id: "1", content: "one", regtype: "v", timestamp: 1 },
        { id: "2", content: "two", regtype: "V", timestamp: 2 },
        { id: "3", content: "three", regtype: "b", timestamp: 3 },
      ]

      cache.setAll(entries)
      assertEquals(cache.size, 2)
      assertEquals(cache.getAll(), entries.slice(0, 2))
    })
  })

  describe("getRecent", () => {
    it("should return recent entries up to limit", () => {
      const cache = createYankCache()
      const entries: YankEntry[] = [
        { id: "1", content: "one", regtype: "v", timestamp: 1 },
        { id: "2", content: "two", regtype: "V", timestamp: 2 },
        { id: "3", content: "three", regtype: "b", timestamp: 3 },
      ]

      entries.forEach((e) => cache.add(e))

      const recent = cache.getRecent(2)
      assertEquals(recent.length, 2)
      assertEquals(recent[0].id, "3") // Most recent
      assertEquals(recent[1].id, "2")
    })

    it("should return all entries if limit exceeds cache size", () => {
      const cache = createYankCache()
      cache.add({ id: "1", content: "test", regtype: "v", timestamp: 1 })

      const recent = cache.getRecent(10)
      assertEquals(recent.length, 1)
    })
  })

  describe("clear", () => {
    it("should remove all entries", () => {
      const cache = createYankCache()
      cache.add({ id: "1", content: "test", regtype: "v", timestamp: 1 })
      cache.add({ id: "2", content: "test2", regtype: "V", timestamp: 2 })

      assertEquals(cache.size, 2)
      cache.clear()
      assertEquals(cache.size, 0)
      assertEquals(cache.getAll(), [])
    })
  })

  describe("search", () => {
    it("should find entries by partial content match", () => {
      const cache = createYankCache()
      cache.add({ id: "1", content: "hello world", regtype: "v", timestamp: 1 })
      cache.add({ id: "2", content: "goodbye world", regtype: "v", timestamp: 2 })
      cache.add({ id: "3", content: "hello again", regtype: "v", timestamp: 3 })

      const results = cache.search("hello")
      assertEquals(results.length, 2)
      assertEquals(results[0].id, "3") // Most recent match first
      assertEquals(results[1].id, "1")
    })

    it("should be case-insensitive", () => {
      const cache = createYankCache()
      cache.add({ id: "1", content: "Hello World", regtype: "v", timestamp: 1 })
      cache.add({ id: "2", content: "HELLO world", regtype: "v", timestamp: 2 })

      const results = cache.search("hello")
      assertEquals(results.length, 2)
    })

    it("should respect limit parameter", () => {
      const cache = createYankCache()
      for (let i = 0; i < 10; i++) {
        cache.add({ id: `${i}`, content: "test content", regtype: "v", timestamp: i })
      }

      const results = cache.search("test", 3)
      assertEquals(results.length, 3)
    })
  })

  describe("filterByFiletype", () => {
    it("should filter entries by filetype", () => {
      const cache = createYankCache()
      cache.add({ id: "1", content: "test", regtype: "v", timestamp: 1, sourceFiletype: "typescript" })
      cache.add({ id: "2", content: "test", regtype: "v", timestamp: 2, sourceFiletype: "vim" })
      cache.add({ id: "3", content: "test", regtype: "v", timestamp: 3, sourceFiletype: "typescript" })
      cache.add({ id: "4", content: "test", regtype: "v", timestamp: 4 }) // No filetype

      const results = cache.filterByFiletype("typescript")
      assertEquals(results.length, 2)
      assertEquals(results[0].id, "3") // Most recent first
      assertEquals(results[1].id, "1")
    })
  })

  describe("moveToFront", () => {
    it("should move existing entry to front", () => {
      const cache = createYankCache()
      const entries: YankEntry[] = [
        { id: "1", content: "one", regtype: "v", timestamp: 1 },
        { id: "2", content: "two", regtype: "v", timestamp: 2 },
        { id: "3", content: "three", regtype: "v", timestamp: 3 },
      ]
      entries.forEach((e) => cache.add(e))

      const result = cache.moveToFront("1")
      assertEquals(result, true)
      assertEquals(cache.get(0)?.id, "1")
      assertEquals(cache.get(1)?.id, "3")
      assertEquals(cache.get(2)?.id, "2")
      assertEquals(cache.size, 3) // Size should not change
    })

    it("should return true if entry is already at front", () => {
      const cache = createYankCache()
      cache.add({ id: "1", content: "test", regtype: "v", timestamp: 1 })
      cache.add({ id: "2", content: "test2", regtype: "v", timestamp: 2 })

      const result = cache.moveToFront("2")
      assertEquals(result, true)
      assertEquals(cache.get(0)?.id, "2") // Should remain at front
    })

    it("should return false if entry does not exist", () => {
      const cache = createYankCache()
      cache.add({ id: "1", content: "test", regtype: "v", timestamp: 1 })

      const result = cache.moveToFront("nonexistent")
      assertEquals(result, false)
      assertEquals(cache.get(0)?.id, "1") // Cache should remain unchanged
    })
  })
})
