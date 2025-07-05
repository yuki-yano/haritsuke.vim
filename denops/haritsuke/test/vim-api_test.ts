/**
 * Tests for vim-api.ts
 * Testing Vim API abstraction layer
 */

import { assertEquals, assertExists } from "../deps/test.ts"
import { createMockFileSystemApi, createMockVimApi } from "../vim/vim-api.ts"

Deno.test("createMockVimApi - provides default implementations", async () => {
  const mockApi = createMockVimApi()

  // Test default values
  assertEquals(await mockApi.bufnr("%"), 1)
  assertEquals(await mockApi.getreg('"'), "")
  assertEquals(await mockApi.getregtype('"'), "v")
  assertEquals(await mockApi.getpos("."), [0, 1, 1, 0])
  assertEquals(await mockApi.line("."), 1)
  assertEquals(await mockApi.getline(1), "")
  assertExists(await mockApi.undotree())
  assertEquals(await mockApi.getGlobalVar("test"), undefined)

  // Test that methods don't throw
  await mockApi.setreg('"', "test", "v")
  await mockApi.cmd("echo 'test'")
  await mockApi.eval("1 + 1")
  await mockApi.setGlobalVar("test", 123)
})

Deno.test("createMockVimApi - accepts overrides", async () => {
  const customRegisterContent = ["line1", "line2"]
  const mockApi = createMockVimApi({
    bufnr: () => Promise.resolve(42),
    getreg: () => Promise.resolve(customRegisterContent),
    getregtype: () => Promise.resolve("V"),
    line: () => Promise.resolve(100),
  })

  // Test overridden values
  assertEquals(await mockApi.bufnr("%"), 42)
  assertEquals(await mockApi.getreg('"'), customRegisterContent)
  assertEquals(await mockApi.getregtype('"'), "V")
  assertEquals(await mockApi.line("."), 100)

  // Test non-overridden values still work
  assertEquals(await mockApi.getline(1), "")
  assertEquals(await mockApi.getpos("."), [0, 1, 1, 0])
})

Deno.test("createMockFileSystemApi - provides default implementations", async () => {
  const mockFsApi = createMockFileSystemApi()

  // Test default values
  assertEquals(await mockFsApi.makeTempFile(), "/tmp/test-file")

  // Test remove doesn't throw
  await mockFsApi.remove("/tmp/test-file")
})

Deno.test("createMockFileSystemApi - accepts overrides", async () => {
  const customTempPath = "/custom/temp/file.txt"
  let removedPath = ""

  const mockFsApi = createMockFileSystemApi({
    makeTempFile: () => Promise.resolve(customTempPath),
    remove: (path) => {
      removedPath = path
      return Promise.resolve()
    },
  })

  // Test overridden value
  assertEquals(await mockFsApi.makeTempFile(), customTempPath)

  // Test remove override
  await mockFsApi.remove(customTempPath)
  assertEquals(removedPath, customTempPath)
})

Deno.test("VimApi mock - complex register operations", async () => {
  let storedRegister = { content: "", type: "" }

  const mockApi = createMockVimApi({
    setreg: (_register, content, regtype) => {
      storedRegister = { content, type: regtype }
      return Promise.resolve()
    },
    getreg: () => Promise.resolve(storedRegister.content),
    getregtype: () => Promise.resolve(storedRegister.type),
  })

  // Simulate register operations
  await mockApi.setreg('"', "test content", "V")
  assertEquals(await mockApi.getreg('"'), "test content")
  assertEquals(await mockApi.getregtype('"'), "V")
})

Deno.test("VimApi mock - position tracking", async () => {
  const currentPos = [0, 1, 1, 0]

  const mockApi = createMockVimApi({
    getpos: () => Promise.resolve(currentPos),
    cmd: (command) => {
      // Simulate cursor movement
      if (command.includes("normal! j")) {
        currentPos[1]++ // Move down one line
      }
      return Promise.resolve()
    },
  })

  // Test initial position
  assertEquals(await mockApi.getpos("."), [0, 1, 1, 0])

  // Simulate movement
  await mockApi.cmd("normal! j")
  assertEquals(await mockApi.getpos("."), [0, 2, 1, 0])
})
