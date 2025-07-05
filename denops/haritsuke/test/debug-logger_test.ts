/**
 * Tests for debug-logger.ts
 * Testing debug logging functionality
 */

import { assertEquals, spy } from "../deps/test.ts"
import { createDebugLogger } from "../utils/debug-logger.ts"

// Intercept console methods for testing
const interceptConsole = () => {
  const originalLog = console.log
  const originalError = console.error

  const logSpy = spy()
  const errorSpy = spy()

  console.log = logSpy
  console.error = errorSpy

  const restore = () => {
    console.log = originalLog
    console.error = originalError
  }

  return { logSpy, errorSpy, restore }
}

Deno.test("createDebugLogger - logs when enabled", () => {
  const { logSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(true)
    logger.log("test", "Test message")

    assertEquals(logSpy.calls.length, 1)
    const logCall = logSpy.calls[0].args[0] as string
    assertEquals(logCall.includes("[haritsuke]"), true)
    assertEquals(logCall.includes("[test]"), true)
    assertEquals(logCall.includes("Test message"), true)
  } finally {
    restore()
  }
})

Deno.test("createDebugLogger - does not log when disabled", () => {
  const { logSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(false)
    logger.log("test", "Test message")

    assertEquals(logSpy.calls.length, 0)
  } finally {
    restore()
  }
})

Deno.test("createDebugLogger - logs with data", () => {
  const { logSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(true)
    const testData = { foo: "bar", count: 42 }
    logger.log("test", "Test message with data", testData)

    assertEquals(logSpy.calls.length, 1)
    assertEquals(logSpy.calls[0].args[1], testData)
  } finally {
    restore()
  }
})

Deno.test("createDebugLogger - error logs always output", () => {
  const { errorSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(false) // Even when disabled
    const error = new Error("Test error")
    logger.error("test", "Error occurred", error)

    assertEquals(errorSpy.calls.length, 1)
    const errorCall = errorSpy.calls[0].args[0] as string
    assertEquals(errorCall.includes("[haritsuke]"), true)
    assertEquals(errorCall.includes("[test]"), true)
    assertEquals(errorCall.includes("[ERROR]"), true)
    assertEquals(errorCall.includes("Error occurred"), true)
    assertEquals(errorSpy.calls[0].args[1], error)
  } finally {
    restore()
  }
})

Deno.test("createDebugLogger - time and timeEnd measure duration", async () => {
  const { logSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(true)

    logger.time("test-timer")
    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 50))
    logger.timeEnd("test-timer")

    assertEquals(logSpy.calls.length, 1)
    const timerCall = logSpy.calls[0].args[0] as string
    assertEquals(timerCall.includes("[haritsuke][TIMER]"), true)
    assertEquals(timerCall.includes("test-timer:"), true)
    assertEquals(timerCall.includes("ms"), true)

    // Extract duration and verify it's reasonable
    const match = timerCall.match(/(\d+\.\d+)ms/)
    if (match) {
      const duration = parseFloat(match[1])
      assertEquals(duration >= 40, true) // At least 40ms
      assertEquals(duration < 100, true) // Less than 100ms
    }
  } finally {
    restore()
  }
})

Deno.test("createDebugLogger - timer does not log when disabled", () => {
  const { logSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(false)

    logger.time("test-timer")
    logger.timeEnd("test-timer")

    assertEquals(logSpy.calls.length, 0)
  } finally {
    restore()
  }
})

Deno.test("createDebugLogger - timeEnd without time does nothing", () => {
  const { logSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(true)

    // Call timeEnd without calling time first
    logger.timeEnd("non-existent-timer")

    assertEquals(logSpy.calls.length, 0)
  } finally {
    restore()
  }
})

Deno.test("createDebugLogger - multiple timers work independently", async () => {
  const { logSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(true)

    logger.time("timer1")
    logger.time("timer2")

    await new Promise((resolve) => setTimeout(resolve, 30))
    logger.timeEnd("timer1")

    await new Promise((resolve) => setTimeout(resolve, 20))
    logger.timeEnd("timer2")

    assertEquals(logSpy.calls.length, 2)

    // Both should have logged
    const timer1Call = logSpy.calls[0].args[0] as string
    const timer2Call = logSpy.calls[1].args[0] as string

    assertEquals(timer1Call.includes("timer1:"), true)
    assertEquals(timer2Call.includes("timer2:"), true)
  } finally {
    restore()
  }
})

Deno.test("createDebugLogger - log includes ISO timestamp", () => {
  const { logSpy, restore } = interceptConsole()

  try {
    const logger = createDebugLogger(true)
    logger.log("test", "Test message")

    const logCall = logSpy.calls[0].args[0] as string
    // Check for ISO date pattern
    const isoDatePattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
    assertEquals(isoDatePattern.test(logCall), true)
  } finally {
    restore()
  }
})
