import { assertEquals, describe, it } from "./deps/test.ts"
import type { Denops } from "./deps/denops.ts"
import { createApi } from "./api.ts"
import { createMockVimApi } from "./vim-api.ts"
import type { PluginState } from "./plugin-state.ts"

describe("createApi - doReplaceOperator", () => {
  it("should execute replace operator with correct parameters", async () => {
    // Arrange
    let executedWithMotionWise: string | null = null
    let executedWithRegister: string | null = null

    const mockState: PluginState = {
      config: {
        persist_path: "",
        max_entries: 100,
        max_data_size: 1048576,
        register_keys: "",
        debug: false,
        use_region_hl: false,
        region_hl_groupname: "HaritsukePasteRegion",
      },
      database: null,
      cache: null,
      rounderManager: null,
      syncManager: null,
      pasteHandler: null,
      registerMonitor: null,
      logger: null,
      highlightManager: null,
      vimApi: createMockVimApi({
        getpos: (expr: string) => {
          if (expr === "'[") return Promise.resolve([0, 1, 1, 0])
          if (expr === "']") return Promise.resolve([0, 1, 5, 0])
          return Promise.resolve([0, 0, 0, 0])
        },
        getreg: () => Promise.resolve("replaced"),
        cmd: (cmd: string) => {
          // Parse command to extract motion wise and register
          if (cmd.includes("v")) executedWithMotionWise = "char"
          else if (cmd.includes("V")) executedWithMotionWise = "line"
          else if (cmd.includes("\x16")) executedWithMotionWise = "block"

          const registerMatch = cmd.match(/"(\w+)[pP]/)
          if (registerMatch) {
            executedWithRegister = registerMatch[1]
          }
          return Promise.resolve()
        },
      }),
      fileSystemApi: {
        remove: () => Promise.resolve(),
        makeTempFile: () => Promise.resolve("temp-file"),
      },
      isInitialized: () => false,
      reset: () => {},
    }

    const mockDenops = {
      dispatcher: {},
    } as unknown as Denops

    const api = createApi(mockDenops, mockState)

    // Act
    await api.doReplaceOperator([{ motionWise: "char", register: "a" }])

    // Assert
    assertEquals(executedWithMotionWise, "char", "Should execute with char motion")
    assertEquals(executedWithRegister, "a", "Should use register a")
  })

  it("should default to unnamed register when not specified", async () => {
    // Arrange
    let executedWithRegister: string | null = null

    const mockState: PluginState = {
      config: {
        persist_path: "",
        max_entries: 100,
        max_data_size: 1048576,
        register_keys: "",
        debug: false,
        use_region_hl: false,
        region_hl_groupname: "HaritsukePasteRegion",
      },
      database: null,
      cache: null,
      rounderManager: null,
      syncManager: null,
      pasteHandler: null,
      registerMonitor: null,
      logger: null,
      highlightManager: null,
      vimApi: createMockVimApi({
        cmd: (cmd: string) => {
          const registerMatch = cmd.match(/"([^"]*)[pP]/)
          if (registerMatch) {
            executedWithRegister = registerMatch[1] || '"'
          }
          return Promise.resolve()
        },
      }),
      fileSystemApi: {
        remove: () => Promise.resolve(),
        makeTempFile: () => Promise.resolve("temp-file"),
      },
      isInitialized: () => false,
      reset: () => {},
    }

    const mockDenops = {} as Denops
    const api = createApi(mockDenops, mockState)

    // Act
    await api.doReplaceOperator([{ motionWise: "line", register: '"' }])

    // Assert
    assertEquals(executedWithRegister, '"', "Should default to unnamed register")
  })
})
