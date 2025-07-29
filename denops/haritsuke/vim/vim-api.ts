/**
 * Vim API abstraction layer
 * Provides interfaces for testable Vim operations
 */

import type { Denops } from "../deps/denops.ts"
import { fn, helpers, vars } from "../deps/denops.ts"

/**
 * Vim API interface for dependency injection
 */
export type VimApi = {
  // Buffer operations
  bufnr: (buf: string) => Promise<number>

  // Register operations
  getreg: (register: string) => Promise<string | string[]>
  setreg: (register: string, content: string, regtype: string) => Promise<void>
  getregtype: (register: string) => Promise<string>

  // Position operations
  getpos: (expr: string) => Promise<number[]>
  line: (expr: string) => Promise<number>

  // Line operations
  getline: (lnum: number | string) => Promise<string>

  // Undo operations
  undotree: () => Promise<unknown>

  // Command execution
  cmd: (command: string) => Promise<void>

  // Expression evaluation
  eval: (expr: string) => Promise<unknown>

  // Variable operations
  setGlobalVar: (name: string, value: unknown) => Promise<void>
  getGlobalVar: (name: string) => Promise<unknown>
  getwinvar: (winnr: number, varname: string) => Promise<unknown>
  getbufvar: (bufnr: number, varname: string) => Promise<unknown>

  // Echo operations
  echo: (message: string) => Promise<void>
}

/**
 * File system operations interface
 */
export type FileSystemApi = {
  makeTempFile: (options?: { prefix?: string; suffix?: string }) => Promise<string>
  remove: (path: string) => Promise<void>
}

/**
 * Create real Vim API implementation using denops
 */
export const createVimApi = (denops: Denops): VimApi => {
  return {
    bufnr: async (buf: string) => {
      return await fn.bufnr(denops, buf) as number
    },

    getreg: async (register: string) => {
      return await fn.getreg(denops, register) as string | string[]
    },

    setreg: async (register: string, content: string, regtype: string) => {
      await fn.setreg(denops, register, content, regtype)
    },

    getregtype: async (register: string) => {
      return await fn.getregtype(denops, register)
    },

    getpos: async (expr: string) => {
      return await fn.getpos(denops, expr) as number[]
    },

    line: async (expr: string) => {
      return await fn.line(denops, expr) as number
    },

    getline: async (lnum: number | string) => {
      return await fn.getline(denops, lnum) as string
    },

    undotree: async () => {
      return await fn.undotree(denops)
    },

    cmd: async (command: string) => {
      await denops.cmd(command)
    },

    eval: async (expr: string) => {
      return await denops.eval(expr)
    },

    setGlobalVar: async (name: string, value: unknown) => {
      await vars.g.set(denops, name, value)
    },

    getGlobalVar: async (name: string) => {
      return await vars.g.get(denops, name)
    },

    getwinvar: async (winnr: number, varname: string) => {
      return await fn.getwinvar(denops, winnr, varname)
    },

    getbufvar: async (bufnr: number, varname: string) => {
      return await fn.getbufvar(denops, bufnr, varname)
    },

    echo: async (message: string) => {
      await helpers.echo(denops, message)
    },
  }
}

/**
 * Create real file system implementation
 */
export const createFileSystemApi = (): FileSystemApi => {
  return {
    makeTempFile: async (options) => {
      return await Deno.makeTempFile(options)
    },

    remove: async (path: string) => {
      await Deno.remove(path)
    },
  }
}

/**
 * Create mock Vim API for testing
 */
export const createMockVimApi = (overrides: Partial<VimApi> = {}): VimApi => {
  return {
    bufnr: () => Promise.resolve(1),
    getreg: () => Promise.resolve(""),
    setreg: () => Promise.resolve(),
    getregtype: () => Promise.resolve("v"),
    getpos: () => Promise.resolve([0, 1, 1, 0]),
    line: () => Promise.resolve(1),
    getline: () => Promise.resolve(""),
    undotree: () => Promise.resolve({ seq_cur: 0 }),
    cmd: () => Promise.resolve(),
    eval: (expr: string) => {
      // Default eval handling for common expressions
      if (typeof expr === "string" && expr.startsWith("getregtype(")) return Promise.resolve("v")
      return Promise.resolve(undefined)
    },
    setGlobalVar: () => Promise.resolve(),
    getGlobalVar: () => Promise.resolve(undefined),
    getwinvar: () => Promise.resolve(0),
    getbufvar: () => Promise.resolve(""),
    echo: () => Promise.resolve(),
    ...overrides,
  }
}

/**
 * Create mock file system for testing
 */
export const createMockFileSystemApi = (overrides: Partial<FileSystemApi> = {}): FileSystemApi => {
  return {
    makeTempFile: () => Promise.resolve("/tmp/test-file"),
    remove: () => Promise.resolve(),
    ...overrides,
  }
}
