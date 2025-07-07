/**
 * Comprehensive tests for rounder.ts
 * Testing history cycling logic with detailed scenarios
 */

import { assertEquals, assertExists, describe, it } from "../deps/test.ts"
import { createRounder } from "../core/rounder.ts"
import type { YankEntry } from "../types.ts"

// Helper to create test entries
const createTestEntry = (id: string, content: string, timestamp?: number): YankEntry => ({
  id,
  content,
  regtype: "v",
  timestamp: timestamp || Date.now(),
})

// Create test data with clear order
const createTestData = () => {
  // Entries are ordered from newest to oldest
  // Index 0 = newest, Index N = oldest
  return [
    createTestEntry("5", "fifth (newest)", 5000),
    createTestEntry("4", "fourth", 4000),
    createTestEntry("3", "third", 3000),
    createTestEntry("2", "second", 2000),
    createTestEntry("1", "first (oldest)", 1000),
  ]
}

describe("rounder", () => {
  describe("basic structure and initialization", () => {
    it("should initialize with newest entry", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      // Start with newest entry
      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      assertEquals(rounder.isActive(), true)
      assertEquals(rounder.getCurrentEntry()?.id, "5")
    })
  })

  describe("paste newest entry and cycle", () => {
    it("should cycle through entries correctly", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      // Paste the newest entry (id=5)
      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      // First previous should go to older entry (id=4)
      const prev1 = await rounder.previous()
      assertExists(prev1)
      assertEquals(prev1.entry.id, "4")
      assertEquals(prev1.entry.content, "fourth")

      // Second previous should go to even older (id=3)
      const prev2 = await rounder.previous()
      assertExists(prev2)
      assertEquals(prev2.entry.id, "3")

      // Continue to oldest
      const prev3 = await rounder.previous()
      assertExists(prev3)
      assertEquals(prev3.entry.id, "2")

      const prev4 = await rounder.previous()
      assertExists(prev4)
      assertEquals(prev4.entry.id, "1")
      assertEquals(prev4.entry.content, "first (oldest)")

      // Should not go past oldest
      const prev5 = await rounder.previous()
      assertEquals(prev5, null)

      // Now go back with next
      const next1 = await rounder.next()
      assertExists(next1)
      assertEquals(next1.entry.id, "2")

      const next2 = await rounder.next()
      assertExists(next2)
      assertEquals(next2.entry.id, "3")

      const next3 = await rounder.next()
      assertExists(next3)
      assertEquals(next3.entry.id, "4")

      const next4 = await rounder.next()
      assertExists(next4)
      assertEquals(next4.entry.id, "5")
      assertEquals(next4.entry.content, "fifth (newest)")

      // Should not go past newest
      const next5 = await rounder.next()
      assertEquals(next5, null)
    })
  })

  describe("always starts at newest entry", () => {
    it("should start at newest and prevent next on first cycle", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      // Always starts at newest entry (id=5, index=0)
      await rounder.start(entries, { mode: "p", count: 1, register: '"' })
      assertEquals(rounder.getCurrentEntry()?.id, "5")

      // First cycle behavior - next should not work on first cycle
      const nextFirst = await rounder.next()
      assertEquals(nextFirst, null, "next should return null on first cycle")

      // Previous should go to older entry (id=4)
      const prev1 = await rounder.previous()
      assertExists(prev1)
      assertEquals(prev1.entry.id, "4")

      // Continue going older
      const prev2 = await rounder.previous()
      assertExists(prev2)
      assertEquals(prev2.entry.id, "3")

      // Now go newer
      const next1 = await rounder.next()
      assertExists(next1)
      assertEquals(next1.entry.id, "4")

      const next2 = await rounder.next()
      assertExists(next2)
      assertEquals(next2.entry.id, "5")

      // Should not go past newest
      const next3 = await rounder.next()
      assertEquals(next3, null)
    })
  })

  it("always starts at newest even with different paste", async () => {
    const rounder = createRounder(null)
    const entries = createTestData()

    // Always starts at newest entry (id=5, index=0)
    await rounder.start(entries, { mode: "p", count: 1, register: '"' })
    assertEquals(rounder.getCurrentEntry()?.id, "5")

    // Can cycle through all entries
    const prev1 = await rounder.previous()
    assertExists(prev1)
    assertEquals(prev1.entry.id, "4")

    const prev2 = await rounder.previous()
    assertExists(prev2)
    assertEquals(prev2.entry.id, "3")

    const prev3 = await rounder.previous()
    assertExists(prev3)
    assertEquals(prev3.entry.id, "2")

    const prev4 = await rounder.previous()
    assertExists(prev4)
    assertEquals(prev4.entry.id, "1")

    // Can't go older than oldest
    const prev5 = await rounder.previous()
    assertEquals(prev5, null)
  })

  it("entry not found defaults to newest", async () => {
    const rounder = createRounder(null)
    const entries = createTestData()

    // Start with non-existent entry ID
    await rounder.start(entries, { mode: "p", count: 1, register: '"' })

    // Should default to index 0 (newest)
    assertEquals(rounder.getCurrentEntry()?.id, "5")
  })

  describe("edge cases", () => {
    it("handles empty entries", async () => {
      const rounder = createRounder(null)

      await rounder.start([], { mode: "p", count: 1, register: '"' })

      assertEquals(rounder.isActive(), true)
      assertEquals(rounder.getCurrentEntry(), null)

      const prev = await rounder.previous()
      assertEquals(prev, null)

      const next = await rounder.next()
      assertEquals(next, null)
    })

    it("handles single entry", async () => {
      const rounder = createRounder(null)
      const entries = [createTestEntry("1", "only entry")]

      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      // Cannot go anywhere
      const prev = await rounder.previous()
      assertEquals(prev, null)

      const next = await rounder.next()
      assertEquals(next, null)
    })
  })

  describe("stop functionality", () => {
    it("should stop and prevent navigation", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      await rounder.start(entries, { mode: "p", count: 1, register: '"' })
      assertEquals(rounder.isActive(), true)

      rounder.stop()
      assertEquals(rounder.isActive(), false)

      // After stop, previous/next should not work
      const prev = await rounder.previous()
      assertEquals(prev, null)

      const next = await rounder.next()
      assertEquals(next, null)
    })
  })

  describe("detailed first cycle behavior", () => {
    it("should prevent next during first cycle", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      console.log("\n=== Test: First Cycle Behavior ===")
      console.log("Entries order: [5(newest), 4, 3, 2, 1(oldest)]")

      // Always starts at index 0 (id=5)
      await rounder.start(entries, { mode: "p", count: 1, register: '"' })
      console.log("Started at id=5 (index=0)")

      // During first cycle, next() should not allow going to newer entries
      console.log("\nTrying next() during first cycle...")
      const next1 = await rounder.next()
      console.log("Result:", next1 ? `id=${next1.entry.id}` : "null")
      assertEquals(next1, null, "Should not be able to go newer during first cycle")

      // Previous should work and go to older entry
      console.log("\nTrying previous()...")
      const prev1 = await rounder.previous()
      console.log("Result:", prev1 ? `id=${prev1.entry.id}` : "null")
      assertExists(prev1)
      assertEquals(prev1.entry.id, "4", "Should go to older entry")

      // Now first cycle is over, next should work
      console.log("\nFirst cycle over, trying next()...")
      const next2 = await rounder.next()
      console.log("Result:", next2 ? `id=${next2.entry.id}` : "null")
      assertExists(next2)
      assertEquals(next2.entry.id, "5", "Should be able to go newer after first cycle")
    })
  })

  describe("real world scenario", () => {
    it("paste and cycle through history", async () => {
      const rounder = createRounder(null)

      // Simulate real yank history (newest first)
      const entries = [
        createTestEntry("10", "const x = 10", 10000),
        createTestEntry("9", "function test() {}", 9000),
        createTestEntry("8", "import { foo }", 8000),
        createTestEntry("7", "// comment", 7000),
        createTestEntry("6", "console.log()", 6000),
      ]

      // Always starts at the most recent entry
      await rounder.start(entries, { mode: "p", count: 1, register: '"' })
      assertEquals(rounder.getCurrentEntry()?.content, "const x = 10")

      // User presses <C-p> to go to older entry
      const older1 = await rounder.previous()
      assertExists(older1)
      assertEquals(older1.entry.content, "function test() {}")

      // User presses <C-p> again
      const older2 = await rounder.previous()
      assertExists(older2)
      assertEquals(older2.entry.content, "import { foo }")

      // User presses <C-p> once more
      const older3 = await rounder.previous()
      assertExists(older3)
      assertEquals(older3.entry.content, "// comment")

      // User realizes they want a newer one, presses <C-n>
      const newer1 = await rounder.next()
      assertExists(newer1)
      assertEquals(newer1.entry.content, "import { foo }")

      // User presses <C-n> again
      const newer2 = await rounder.next()
      assertExists(newer2)
      assertEquals(newer2.entry.content, "function test() {}")

      // User presses <C-n> to get back to newest
      const newer3 = await rounder.next()
      assertExists(newer3)
      assertEquals(newer3.entry.content, "const x = 10")

      // Cannot go newer than newest
      const newer4 = await rounder.next()
      assertEquals(newer4, null)
    })
  })

  describe("no wrapping at boundaries", () => {
    it("should not wrap around at oldest or newest", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      // Start at newest
      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      // Go to oldest
      let current
      for (let i = 0; i < 10; i++) { // More than entries count
        current = await rounder.previous()
        if (!current) break
      }

      // Should be at oldest now
      assertEquals(rounder.getCurrentEntry()?.id, "1")

      // Should not wrap around
      const shouldBeNull = await rounder.previous()
      assertEquals(shouldBeNull, null)

      // Go back to newest
      for (let i = 0; i < 10; i++) {
        current = await rounder.next()
        if (!current) break
      }

      // Should be at newest now
      assertEquals(rounder.getCurrentEntry()?.id, "5")

      // Should not wrap around
      const shouldAlsoBeNull = await rounder.next()
      assertEquals(shouldAlsoBeNull, null)
    })
  })

  describe("temporary smart indent settings", () => {
    it("should store and retrieve temporary smart indent setting", () => {
      const rounder = createRounder(null)

      // Initial state should be null
      assertEquals(rounder.getTemporarySmartIndent(), null)

      // Set to false
      rounder.setTemporarySmartIndent(false)
      assertEquals(rounder.getTemporarySmartIndent(), false)

      // Set to true
      rounder.setTemporarySmartIndent(true)
      assertEquals(rounder.getTemporarySmartIndent(), true)

      // Set back to null
      rounder.setTemporarySmartIndent(null)
      assertEquals(rounder.getTemporarySmartIndent(), null)
    })

    it("should clear temporary smart indent on stop", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      // Set temporary smart indent
      rounder.setTemporarySmartIndent(true)
      assertEquals(rounder.getTemporarySmartIndent(), true)

      // Stop should clear it
      rounder.stop()
      assertEquals(rounder.getTemporarySmartIndent(), null)
    })
  })

  describe("base indent settings", () => {
    it("should store and retrieve base indent", () => {
      const rounder = createRounder(null)

      // Initial state should be null
      assertEquals(rounder.getBaseIndent(), null)

      // Set base indent
      rounder.setBaseIndent("  ")
      assertEquals(rounder.getBaseIndent(), "  ")

      // Update base indent
      rounder.setBaseIndent("    ")
      assertEquals(rounder.getBaseIndent(), "    ")

      // Set to empty string
      rounder.setBaseIndent("")
      assertEquals(rounder.getBaseIndent(), "")

      // Set to tab
      rounder.setBaseIndent("\t")
      assertEquals(rounder.getBaseIndent(), "\t")
    })

    it("should clear base indent on stop", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      // Set base indent
      rounder.setBaseIndent("    ")
      assertEquals(rounder.getBaseIndent(), "    ")

      // Stop should clear it
      rounder.stop()
      assertEquals(rounder.getBaseIndent(), null)
    })

    it("should preserve base indent across navigation", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      // Set base indent
      rounder.setBaseIndent("  ")

      // Navigate through history
      await rounder.previous()
      assertEquals(rounder.getBaseIndent(), "  ")

      await rounder.previous()
      assertEquals(rounder.getBaseIndent(), "  ")

      await rounder.next()
      assertEquals(rounder.getBaseIndent(), "  ")

      // Base indent should still be preserved
      assertEquals(rounder.getBaseIndent(), "  ")
    })
  })

  describe("temporary settings interaction", () => {
    it("should maintain both temporary smart indent and base indent independently", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      // Set both settings
      rounder.setTemporarySmartIndent(true)
      rounder.setBaseIndent("    ")

      // Both should be independently retrievable
      assertEquals(rounder.getTemporarySmartIndent(), true)
      assertEquals(rounder.getBaseIndent(), "    ")

      // Change one shouldn't affect the other
      rounder.setTemporarySmartIndent(false)
      assertEquals(rounder.getTemporarySmartIndent(), false)
      assertEquals(rounder.getBaseIndent(), "    ")

      // Change the other
      rounder.setBaseIndent("  ")
      assertEquals(rounder.getTemporarySmartIndent(), false)
      assertEquals(rounder.getBaseIndent(), "  ")
    })
  })

  describe("replace operation info", () => {
    it("should store and retrieve replace info", () => {
      const rounder = createRounder(null)

      // Initial state should be null
      assertEquals(rounder.getReplaceInfo(), null)

      // Set replace info with minimal data
      const minimalInfo = {
        isReplace: true,
        singleUndo: false,
      }
      rounder.setReplaceInfo(minimalInfo)
      assertEquals(rounder.getReplaceInfo(), minimalInfo)

      // Set replace info with full data
      const fullInfo = {
        isReplace: true,
        singleUndo: true,
        motionWise: "char",
        deletedRange: {
          start: [0, 10, 5, 0],
          end: [0, 10, 15, 0],
        },
      }
      rounder.setReplaceInfo(fullInfo)
      assertEquals(rounder.getReplaceInfo(), fullInfo)
    })

    it("should handle line-wise replace info", () => {
      const rounder = createRounder(null)

      const lineInfo = {
        isReplace: true,
        singleUndo: true,
        motionWise: "line",
        deletedRange: {
          start: [0, 5, 1, 0],
          end: [0, 8, 20, 0],
        },
      }
      rounder.setReplaceInfo(lineInfo)
      
      const retrieved = rounder.getReplaceInfo()
      assertExists(retrieved)
      assertEquals(retrieved.motionWise, "line")
      assertEquals(retrieved.deletedRange?.start[1], 5)
      assertEquals(retrieved.deletedRange?.end[1], 8)
    })

    it("should handle block-wise replace info", () => {
      const rounder = createRounder(null)

      const blockInfo = {
        isReplace: true,
        singleUndo: true,
        motionWise: "block",
        deletedRange: {
          start: [0, 1, 10, 0],
          end: [0, 5, 15, 0],
        },
      }
      rounder.setReplaceInfo(blockInfo)
      
      const retrieved = rounder.getReplaceInfo()
      assertExists(retrieved)
      assertEquals(retrieved.motionWise, "block")
      assertEquals(retrieved.deletedRange?.start[2], 10)
      assertEquals(retrieved.deletedRange?.end[2], 15)
    })

    it("should clear replace info on stop", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      await rounder.start(entries, { mode: "p", count: 1, register: '"' })

      // Set replace info
      rounder.setReplaceInfo({
        isReplace: true,
        singleUndo: true,
        motionWise: "char",
      })
      assertExists(rounder.getReplaceInfo())

      // Stop should clear it
      rounder.stop()
      assertEquals(rounder.getReplaceInfo(), null)
    })

    it("should persist replace info across cycles", async () => {
      const rounder = createRounder(null)
      const entries = createTestData()

      await rounder.start(entries, { mode: "P", count: 1, register: '"' })

      // Set replace info
      const replaceInfo = {
        isReplace: true,
        singleUndo: true,
        motionWise: "char",
        deletedRange: {
          start: [0, 1, 1, 0],
          end: [0, 1, 5, 0],
        },
      }
      rounder.setReplaceInfo(replaceInfo)

      // Cycle through entries
      await rounder.previous()
      await rounder.previous()
      await rounder.next()

      // Replace info should still be available
      assertEquals(rounder.getReplaceInfo(), replaceInfo)
    })
  })
})
