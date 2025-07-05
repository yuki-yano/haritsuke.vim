/**
 * Unified debug log management module
 */

export type DebugLogger = {
  log: (category: string, message: string, data?: unknown) => void
  error: (category: string, message: string, error: unknown) => void
  time: (label: string) => void
  timeEnd: (label: string) => void
}

/**
 * Create a function to manage debug logs
 */
export const createDebugLogger = (enabled: boolean): DebugLogger => {
  const timers = new Map<string, number>()

  return {
    log: (category: string, message: string, data?: unknown) => {
      if (!enabled) return

      const timestamp = new Date().toISOString()
      const prefix = `[haritsuke][${timestamp}][${category}]`

      if (data !== undefined) {
        console.log(`${prefix} ${message}`, data)
      } else {
        console.log(`${prefix} ${message}`)
      }
    },

    error: (category: string, message: string, error: unknown) => {
      // Always output error logs
      const timestamp = new Date().toISOString()
      const prefix = `[haritsuke][${timestamp}][${category}][ERROR]`

      console.error(`${prefix} ${message}`, error)
    },

    time: (label: string) => {
      if (!enabled) return
      timers.set(label, performance.now())
    },

    timeEnd: (label: string) => {
      if (!enabled) return

      const start = timers.get(label)
      if (start !== undefined) {
        const duration = performance.now() - start
        timers.delete(label)
        console.log(`[haritsuke][TIMER] ${label}: ${duration.toFixed(2)}ms`)
      }
    },
  }
}
