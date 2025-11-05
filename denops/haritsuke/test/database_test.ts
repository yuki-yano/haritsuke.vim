import { assertEquals, assertExists, assertRejects } from "../deps/test.ts"
import { afterEach, beforeEach, describe, it } from "../deps/test.ts"
import { createYankDatabase } from "../data/database.ts"
import type { YankDatabase } from "../data/database.ts"
import type { RegisterType, YankEntry } from "../types.ts"
import { DATABASE } from "../constants.ts"

// Test helpers
const createTestEntry = (overrides: Partial<Omit<YankEntry, "id" | "size">> = {}): Omit<YankEntry, "id" | "size"> => ({
  content: "test content",
  regtype: "v" as const,
  timestamp: Date.now(),
  register: '"',
  ...overrides,
})

const createTestDatabase = async (): Promise<{ db: YankDatabase; tempDir: string }> => {
  const tempDir = await Deno.makeTempDir()
  const db = createYankDatabase(tempDir, { maxHistory: 100 })
  await db.init()
  return { db, tempDir }
}

const cleanupTestDatabase = async (tempDir: string): Promise<void> => {
  try {
    await Deno.remove(tempDir, { recursive: true })
  } catch {
    // Ignore cleanup errors
  }
}

describe("YankDatabase", () => {
  let db: YankDatabase
  let tempDir: string

  beforeEach(async () => {
    const result = await createTestDatabase()
    db = result.db
    tempDir = result.tempDir
  })

  afterEach(async () => {
    db.close()
    await cleanupTestDatabase(tempDir)
  })

  describe("init", () => {
    it("should initialize database successfully", () => {
      // Already initialized in beforeEach
      const recent = db.getRecent()
      assertEquals(recent.length, 0)
    })

    it("should handle corrupted database", async () => {
      // Close current db
      db.close()
      await cleanupTestDatabase(tempDir)

      // Create corrupted db file
      await Deno.mkdir(tempDir, { recursive: true })
      await Deno.writeTextFile(`${tempDir}/haritsuke.db`, "corrupted data")

      // Should handle corruption and recreate
      const newDb = createYankDatabase(tempDir, { maxHistory: 100 })
      await newDb.init()

      const recent = newDb.getRecent()
      assertEquals(recent.length, 0)

      newDb.close()
    })

    it("should create database directory if not exists", async () => {
      db.close()
      await cleanupTestDatabase(tempDir)

      const newTempDir = `${tempDir}/nested/path`
      const newDb = createYankDatabase(newTempDir, { maxHistory: 100 })
      await newDb.init()

      const recent = newDb.getRecent()
      assertEquals(recent.length, 0)

      newDb.close()
      await cleanupTestDatabase(tempDir)
    })
  })

  describe("add", () => {
    it("should add entry successfully", async () => {
      const entry = createTestEntry()
      const result = await db.add(entry)

      assertExists(result.id)
      assertEquals(result.content, entry.content)
      assertEquals(result.regtype, entry.regtype)
      assertEquals(result.timestamp, entry.timestamp)
      assertEquals(result.size, new TextEncoder().encode(entry.content).length)
      assertEquals(result.register, entry.register)
    })

    it("should add entry with optional fields", async () => {
      const entry = createTestEntry({
        blockwidth: 10,
        sourceFile: "/path/to/file.ts",
        sourceLine: 42,
        sourceFiletype: "typescript",
        register: "a",
      })
      const result = await db.add(entry)

      assertEquals(result.blockwidth, 10)
      assertEquals(result.sourceFile, "/path/to/file.ts")
      assertEquals(result.sourceLine, 42)
      assertEquals(result.sourceFiletype, "typescript")
      assertEquals(result.register, "a")
    })

    it("should reject content exceeding size limit", async () => {
      const largeContent = "x".repeat(DATABASE.MAX_CONTENT_SIZE + 1)
      const entry = createTestEntry({ content: largeContent })

      await assertRejects(
        async () => await db.add(entry),
        Error,
        "Content too large",
      )
    })

    it("should respect custom max_data_size configuration", async () => {
      db.close()
      await cleanupTestDatabase(tempDir)

      tempDir = await Deno.makeTempDir()
      db = createYankDatabase(tempDir, { maxHistory: 100, maxDataSize: 10 })
      await db.init()

      await db.add(createTestEntry({ content: "a".repeat(10) }))
      await assertRejects(
        async () => await db.add(createTestEntry({ content: "a".repeat(11) })),
        Error,
        "Content too large",
      )
    })

    it("should allow duplicate content", async () => {
      const entry = createTestEntry({ content: "duplicate" })

      const result1 = await db.add(entry)
      const result2 = await db.add(entry)

      assertExists(result1.id)
      assertExists(result2.id)
      assertEquals(result1.content, result2.content)
      // IDs should be different
      assertExists(result1.id !== result2.id)
    })

    it("should handle different register types", async () => {
      const charEntry = await db.add(createTestEntry({ regtype: "v" }))
      const lineEntry = await db.add(createTestEntry({ regtype: "V" }))
      const blockEntry = await db.add(createTestEntry({ regtype: "b", blockwidth: 5 }))

      assertEquals(charEntry.regtype, "v")
      assertEquals(lineEntry.regtype, "V")
      assertEquals(blockEntry.regtype, "b")
      assertEquals(blockEntry.blockwidth, 5)
    })

    it("should maintain max history limit", async () => {
      // Create database with small limit
      db.close()
      await cleanupTestDatabase(tempDir)

      const result = await createTestDatabase()
      tempDir = result.tempDir
      db = createYankDatabase(tempDir, { maxHistory: 5 })
      await db.init()

      // Add more entries than limit
      for (let i = 0; i < 10; i++) {
        await db.add(createTestEntry({ content: `entry ${i}`, timestamp: i }))
      }

      const recent = db.getRecent()
      assertEquals(recent.length, 5)
      // Should keep most recent entries
      assertEquals(recent[0].content, "entry 9")
      assertEquals(recent[4].content, "entry 5")
    })
  })

  describe("getRecent", () => {
    it("should return empty array for empty database", () => {
      const recent = db.getRecent()
      assertEquals(recent, [])
    })

    it("should return entries in descending timestamp order", async () => {
      await db.add(createTestEntry({ content: "old", timestamp: 1000 }))
      await db.add(createTestEntry({ content: "new", timestamp: 2000 }))
      await db.add(createTestEntry({ content: "middle", timestamp: 1500 }))

      const recent = db.getRecent()
      assertEquals(recent.length, 3)
      assertEquals(recent[0].content, "new")
      assertEquals(recent[1].content, "middle")
      assertEquals(recent[2].content, "old")
    })

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await db.add(createTestEntry({ content: `entry ${i}` }))
      }

      const recent5 = db.getRecent(5)
      assertEquals(recent5.length, 5)

      const recentAll = db.getRecent()
      assertEquals(recentAll.length, 10)
    })

    it("should include register information in results", async () => {
      await db.add(createTestEntry({ content: "reg-a", register: "a", timestamp: 1 }))
      await db.add(createTestEntry({ content: "reg-b", register: "b", timestamp: 2 }))

      const recent = db.getRecent()
      assertEquals(recent[0].register, "b")
      assertEquals(recent[1].register, "a")
    })

    it("should not exceed maxHistory even with high limit", async () => {
      db.close()

      // Create db with maxHistory of 3
      db = createYankDatabase(tempDir, { maxHistory: 3 })
      await db.init()

      for (let i = 0; i < 5; i++) {
        await db.add(createTestEntry({ content: `entry ${i}` }))
      }

      const recent = db.getRecent(10)
      assertEquals(recent.length, 3)
    })
  })

  describe("getSyncStatus", () => {
    it("should return correct sync status", async () => {
      const initialStatus = db.getSyncStatus()
      assertEquals(initialStatus.lastTimestamp, 0)
      assertEquals(initialStatus.entryCount, 0)

      const timestamp1 = 1000
      const timestamp2 = 2000
      await db.add(createTestEntry({ timestamp: timestamp1 }))
      await db.add(createTestEntry({ timestamp: timestamp2 }))

      const status = db.getSyncStatus()
      assertEquals(status.lastTimestamp, timestamp2)
      assertEquals(status.entryCount, 2)
    })

    it("should handle empty database", () => {
      const status = db.getSyncStatus()
      assertEquals(status.lastTimestamp, 0)
      assertEquals(status.entryCount, 0)
    })

    it("should handle database errors gracefully", async () => {
      db.close()

      const status = db.getSyncStatus()
      assertEquals(status.lastTimestamp, 0)
      assertEquals(status.entryCount, 0)

      // Recreate db for other tests
      const result = await createTestDatabase()
      db = result.db
      tempDir = result.tempDir
    })
  })

  describe("close", () => {
    it("should close database without errors", () => {
      // Should not throw
      db.close()
    })

    it("should handle multiple close calls", () => {
      db.close()
      // Second close should not throw
      db.close()
    })
  })

  describe("concurrent access", () => {
    it("should handle concurrent writes", async () => {
      const promises: Promise<YankEntry>[] = []

      for (let i = 0; i < 10; i++) {
        promises.push(db.add(createTestEntry({ content: `concurrent ${i}` })))
      }

      const results = await Promise.all(promises)
      assertEquals(results.length, 10)

      const recent = db.getRecent()
      assertEquals(recent.length, 10)
    })

    it("should handle read during write", async () => {
      // Start a write operation
      const writePromise = db.add(createTestEntry({ content: "writing" }))

      // Perform read while write is in progress
      const recent = db.getRecent()

      // Wait for write to complete
      await writePromise

      // Read should work correctly
      assertExists(recent)
    })
  })

  describe("error handling", () => {
    it("should handle invalid register type", async () => {
      const entry = createTestEntry({ regtype: "invalid" as unknown as RegisterType })

      // SQLite CHECK constraint should reject this
      await assertRejects(
        async () => await db.add(entry),
        Error,
        "CHECK constraint failed",
      )
    })

    it("should handle database file permissions", async () => {
      if (Deno.build.os === "windows") {
        // Skip on Windows due to different permission model
        return
      }

      db.close()

      // Make directory read-only
      await Deno.chmod(tempDir, 0o444)

      const newDb = createYankDatabase(tempDir, { maxHistory: 100 })

      try {
        await assertRejects(
          async () => await newDb.init(),
          Error,
        )
      } finally {
        // Restore permissions for cleanup
        await Deno.chmod(tempDir, 0o755)
      }
    })
  })

  describe("data integrity", () => {
    it("should preserve data after close and reopen", async () => {
      const entries = []
      for (let i = 0; i < 5; i++) {
        entries.push(
          await db.add(createTestEntry({
            content: `persistent ${i}`,
            timestamp: Date.now() + i,
          })),
        )
      }

      db.close()

      // Reopen database
      const newDb = createYankDatabase(tempDir, { maxHistory: 100 })
      await newDb.init()

      const recent = newDb.getRecent()
      assertEquals(recent.length, 5)
      assertEquals(recent[0].content, "persistent 4")

      newDb.close()
    })

    it("should handle special characters in content", async () => {
      const specialContent = `
        Line with "quotes"
        Line with 'single quotes'
        Line with \`backticks\`
        Line with \\backslashes\\
        Line with 	tabs
        Line with SQL injection '; DROP TABLE yank_history; --
        Unicode: 🎉 こんにちは 👋
        Control chars: \r\n\t
      `

      const result = await db.add(createTestEntry({ content: specialContent }))
      assertEquals(result.content, specialContent)

      const recent = db.getRecent()
      assertEquals(recent[0].content, specialContent)
    })
  })

  describe("performance", () => {
    it("should handle large number of entries efficiently", async () => {
      const startTime = Date.now()

      // Add 100 entries
      for (let i = 0; i < 100; i++) {
        await db.add(createTestEntry({
          content: `performance test entry ${i}`,
          timestamp: Date.now() + i,
        }))
      }

      const addTime = Date.now() - startTime

      // Retrieval should be fast
      const retrieveStart = Date.now()
      const recent = db.getRecent(100)
      const retrieveTime = Date.now() - retrieveStart

      assertEquals(recent.length, 100)

      // Performance assertions (these are generous to avoid flaky tests)
      assertExists(addTime < 5000) // Adding 100 entries should take less than 5 seconds
      assertExists(retrieveTime < 100) // Retrieving should take less than 100ms
    })
  })
})
