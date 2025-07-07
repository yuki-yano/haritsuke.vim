import type { DebugLogger } from "./debug-logger.ts"

/**
 * Execute an async operation with error handling
 * @param operation - The async operation to execute
 * @param context - Context string for logging
 * @param logger - Optional debug logger
 * @param defaultValue - Optional default value to return on error
 * @returns The result of the operation or default value
 * @throws Error if no default value is provided and operation fails
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  logger: DebugLogger | null,
  defaultValue?: T,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    logger?.error(context, "Operation failed", error)

    if (defaultValue !== undefined) {
      return defaultValue
    }

    throw error
  }
}

/**
 * Execute a sync operation with error handling
 * @param operation - The sync operation to execute
 * @param context - Context string for logging
 * @param logger - Optional debug logger
 * @param defaultValue - Optional default value to return on error
 * @returns The result of the operation or default value
 * @throws Error if no default value is provided and operation fails
 */
export function withErrorHandlingSync<T>(
  operation: () => T,
  context: string,
  logger: DebugLogger | null,
  defaultValue?: T,
): T {
  try {
    return operation()
  } catch (error) {
    logger?.error(context, "Operation failed", error)

    if (defaultValue !== undefined) {
      return defaultValue
    }

    throw error
  }
}

/**
 * Retry an async operation with exponential backoff
 * @param operation - The async operation to execute
 * @param options - Retry options
 * @returns The result of the operation
 * @throws Error if all retries fail
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    backoffFactor?: number
    logger?: DebugLogger | null
    context?: string
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 5000,
    backoffFactor = 2,
    logger = null,
    context = "retryWithBackoff",
  } = options

  let lastError: Error
  let delay = initialDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries) {
        logger?.log(context, `Attempt ${attempt + 1} failed, retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay = Math.min(delay * backoffFactor, maxDelay)
      }
    }
  }

  logger?.error(context, `All ${maxRetries + 1} attempts failed`, lastError!)
  throw lastError!
}
