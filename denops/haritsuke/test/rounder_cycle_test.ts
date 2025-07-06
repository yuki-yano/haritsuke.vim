/**
 * Detailed tests for rounder cycling behavior
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

describe("rounder", () => {
  it("detailed cycle test: can cycle through all entries", async () => {
  const rounder = createRounder(null) // No logger for tests

  // Create 5 entries (newest to oldest)
  const entries = [
    createTestEntry("5", "entry5 (newest)", 5000),
    createTestEntry("4", "entry4", 4000),
    createTestEntry("3", "entry3", 3000),
    createTestEntry("2", "entry2", 2000),
    createTestEntry("1", "entry1 (oldest)", 1000),
  ]

  console.log("\n=== Test: Cycle through all entries ===")
  console.log("Starting with 5 entries, always starts at newest (id=5, index=0)")

  // Always starts at newest entry
  await rounder.start(entries, { mode: "p", count: 1, register: '"' })
  assertEquals(rounder.getCurrentEntry()?.id, "5", "Should start at entry5 (newest)")

  // First cycle - C-p should go to older entries
  console.log("\n--- Testing C-p (previous) ---")

  const prev1 = await rounder.previous()
  console.log("C-p 1st time:", prev1?.entry.id, prev1?.entry.content)
  assertExists(prev1)
  assertEquals(prev1.entry.id, "4", "First C-p should go to entry4")

  const prev2 = await rounder.previous()
  console.log("C-p 2nd time:", prev2?.entry.id, prev2?.entry.content)
  assertExists(prev2)
  assertEquals(prev2.entry.id, "3", "Second C-p should go to entry3")

  const prev3 = await rounder.previous()
  console.log("C-p 3rd time:", prev3?.entry.id, prev3?.entry.content)
  assertExists(prev3)
  assertEquals(prev3.entry.id, "2", "Third C-p should go to entry2")

  const prev4 = await rounder.previous()
  console.log("C-p 4th time:", prev4?.entry.id, prev4?.entry.content)
  assertExists(prev4)
  assertEquals(prev4.entry.id, "1", "Fourth C-p should go to entry1 (oldest)")

  // Should not go past oldest
  const prev5 = await rounder.previous()
  console.log("C-p 5th time:", prev5)
  assertEquals(prev5, null, "Cannot go older than oldest")

  // Now test C-n to go back
  console.log("\n--- Testing C-n (next) ---")

  const next1 = await rounder.next()
  console.log("C-n 1st time:", next1?.entry.id, next1?.entry.content)
  assertExists(next1)
  assertEquals(next1.entry.id, "2", "First C-n should go back to entry2")

  const next2 = await rounder.next()
  console.log("C-n 2nd time:", next2?.entry.id, next2?.entry.content)
  assertExists(next2)
  assertEquals(next2.entry.id, "3", "Second C-n should go back to entry3")

  const next3 = await rounder.next()
  console.log("C-n 3rd time:", next3?.entry.id, next3?.entry.content)
  assertExists(next3)
  assertEquals(next3.entry.id, "4", "Third C-n should go to entry4")

  const next4 = await rounder.next()
  console.log("C-n 4th time:", next4?.entry.id, next4?.entry.content)
  assertExists(next4)
  assertEquals(next4.entry.id, "5", "Fourth C-n should go to entry5 (newest)")

  // Should not go past newest
  const next5 = await rounder.next()
  console.log("C-n 5th time:", next5)
  assertEquals(next5, null, "Cannot go newer than newest")
  })

  it("paste newest entry and cycle", async () => {
  const rounder = createRounder(null)

  const entries = [
    createTestEntry("5", "newest", 5000),
    createTestEntry("4", "entry4", 4000),
    createTestEntry("3", "entry3", 3000),
    createTestEntry("2", "entry2", 2000),
    createTestEntry("1", "oldest", 1000),
  ]

  // Paste the newest entry
  await rounder.start(entries, { mode: "p", count: 1, register: '"' })

  // Can't go newer on first cycle
  const next1 = await rounder.next()
  assertEquals(next1, null, "Cannot go newer than pasted entry on first cycle")

  // Can go older
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

  // Now go back
  const next2 = await rounder.next()
  assertExists(next2)
  assertEquals(next2.entry.id, "2")

  const next3 = await rounder.next()
  assertExists(next3)
  assertEquals(next3.entry.id, "3")

  const next4 = await rounder.next()
  assertExists(next4)
  assertEquals(next4.entry.id, "4")

  const next5 = await rounder.next()
  assertExists(next5)
  assertEquals(next5.entry.id, "5")

  // Still can't go newer
  const next6 = await rounder.next()
  assertEquals(next6, null)
  })

  it("verify entries are not cleared after start", async () => {
  const rounder = createRounder(null)

  const entries = [
    createTestEntry("3", "entry3", 3000),
    createTestEntry("2", "entry2", 2000),
    createTestEntry("1", "entry1", 1000),
  ]

  await rounder.start(entries, { mode: "p", count: 1, register: '"' })

  // Verify rounder is active and has entries
  assertEquals(rounder.isActive(), true, "Rounder should be active")
  assertEquals(rounder.getCurrentEntry()?.id, "3", "Should be at entry3 (newest)")

  // Try to cycle
  const prev = await rounder.previous()
  assertExists(prev, "Should be able to go to previous entry")
  assertEquals(prev.entry.id, "2", "Should go to entry2")

  const next = await rounder.next()
  assertExists(next, "Should be able to go to next entry")
  assertEquals(next.entry.id, "3", "Should go back to entry3")

  const next2 = await rounder.next()
  assertEquals(next2, null, "Should not be able to go newer than newest")
  })
})
