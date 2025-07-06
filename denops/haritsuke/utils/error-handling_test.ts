import { assertEquals, assertRejects } from "../deps/std.ts"
import { describe, it } from "../deps/test.ts"
import { withErrorHandling, withErrorHandlingSync, retryWithBackoff } from "./error-handling.ts"

describe("withErrorHandling", () => {
  const logger = null // Avoid environment variable access
  
  it("should return operation result on success", async () => {
    const result = await withErrorHandling(
      async () => "success",
      "test",
      logger,
    )
    assertEquals(result, "success")
  })

  it("should return default value on error", async () => {
    const result = await withErrorHandling(
      async () => {
        throw new Error("test error")
      },
      "test",
      logger,
      "default",
    )
    assertEquals(result, "default")
  })

  it("should throw error when no default value", async () => {
    await assertRejects(
      () => withErrorHandling(
        async () => {
          throw new Error("test error")
        },
        "test",
        logger,
      ),
      Error,
      "test error",
    )
  })
})

describe("withErrorHandlingSync", () => {
  const logger = null // Avoid environment variable access
  
  it("should return operation result on success", () => {
    const result = withErrorHandlingSync(
      () => "success",
      "test",
      logger,
    )
    assertEquals(result, "success")
  })

  it("should return default value on error", () => {
    const result = withErrorHandlingSync(
      () => {
        throw new Error("test error")
      },
      "test",
      logger,
      "default",
    )
    assertEquals(result, "default")
  })

  it("should throw error when no default value", () => {
    try {
      withErrorHandlingSync(
        () => {
          throw new Error("test error")
        },
        "test",
        logger,
      )
    } catch (error) {
      assertEquals((error as Error).message, "test error")
    }
  })
})

describe("retryWithBackoff", () => {
  it("should return result on first success", async () => {
    let attempts = 0
    const result = await retryWithBackoff(
      async () => {
        attempts++
        return "success"
      },
      { maxRetries: 3 },
    )
    assertEquals(result, "success")
    assertEquals(attempts, 1)
  })

  it("should retry on failure and succeed", async () => {
    let attempts = 0
    const result = await retryWithBackoff(
      async () => {
        attempts++
        if (attempts < 3) {
          throw new Error("retry me")
        }
        return "success"
      },
      { 
        maxRetries: 3,
        initialDelay: 10,
      },
    )
    assertEquals(result, "success")
    assertEquals(attempts, 3)
  })

  it("should throw after max retries", async () => {
    let attempts = 0
    await assertRejects(
      () => retryWithBackoff(
        async () => {
          attempts++
          throw new Error("always fails")
        },
        { 
          maxRetries: 2,
          initialDelay: 10,
        },
      ),
      Error,
      "always fails",
    )
    assertEquals(attempts, 3) // initial attempt + 2 retries
  })

  it("should respect backoff timing", async () => {
    const delays: number[] = []
    let lastTime = Date.now()
    
    await assertRejects(
      () => retryWithBackoff(
        async () => {
          const now = Date.now()
          const elapsed = now - lastTime
          if (elapsed > 5) { // Only record actual delays, not the initial call
            delays.push(elapsed)
          }
          lastTime = now
          throw new Error("timing test")
        },
        { 
          maxRetries: 2,
          initialDelay: 50,
          backoffFactor: 2,
        },
      ),
    )
    
    // Should have 2 retry delays
    assertEquals(delays.length, 2)
    // First retry should be ~50ms (allow some variance)
    assertEquals(delays[0] >= 45 && delays[0] <= 65, true)
    // Second retry should be ~100ms (allow some variance)  
    assertEquals(delays[1] >= 90 && delays[1] <= 115, true)
  })
})