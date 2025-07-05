/**
 * Comprehensive tests for rounder.ts
 * Testing history cycling logic with detailed scenarios
 */

import { assertEquals, assertExists } from "../deps/test.ts"
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

Deno.test("rounder - basic structure and initialization", async () => {
  const rounder = createRounder(null)
  const entries = createTestData()

  // Start with newest entry
  await rounder.start(entries, { mode: "p", count: 1, register: '"' })

  assertEquals(rounder.isActive(), true)
  assertEquals(rounder.getCurrentEntry()?.id, "5")
})

Deno.test("rounder - paste newest entry and cycle", async () => {
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

Deno.test("rounder - always starts at newest entry", async () => {
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

Deno.test("rounder - always starts at newest even with different paste", async () => {
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

Deno.test("rounder - entry not found defaults to newest", async () => {
  const rounder = createRounder(null)
  const entries = createTestData()

  // Start with non-existent entry ID
  await rounder.start(entries, { mode: "p", count: 1, register: '"' })

  // Should default to index 0 (newest)
  assertEquals(rounder.getCurrentEntry()?.id, "5")
})

Deno.test("rounder - empty entries", async () => {
  const rounder = createRounder(null)

  await rounder.start([], { mode: "p", count: 1, register: '"' })

  assertEquals(rounder.isActive(), true)
  assertEquals(rounder.getCurrentEntry(), null)

  const prev = await rounder.previous()
  assertEquals(prev, null)

  const next = await rounder.next()
  assertEquals(next, null)
})

Deno.test("rounder - single entry", async () => {
  const rounder = createRounder(null)
  const entries = [createTestEntry("1", "only entry")]

  await rounder.start(entries, { mode: "p", count: 1, register: '"' })

  // Cannot go anywhere
  const prev = await rounder.previous()
  assertEquals(prev, null)

  const next = await rounder.next()
  assertEquals(next, null)
})

Deno.test("rounder - stop functionality", async () => {
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

Deno.test("rounder - detailed first cycle behavior", async () => {
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

Deno.test("rounder - real world scenario: paste and cycle through history", async () => {
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

Deno.test("rounder - no wrapping at boundaries", async () => {
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
