import { assertEquals, describe, it, spy } from "../deps/test.ts"
import { createReplaceSessionService } from "../core/replace-session.ts"
import { createMockVimApi } from "../vim/vim-api.ts"

describe("createReplaceSessionService", () => {
  it("replays a single-undo replace by undoing and deleting the original range again", async () => {
    const commands: string[] = []
    const service = createReplaceSessionService(
      createMockVimApi({
        cmd: spy((command: string) => {
          commands.push(command)
          return Promise.resolve()
        }),
      }),
    )

    await service.prepareReplay({
      replaceInfo: {
        isReplace: true,
        singleUndo: true,
        motionWise: "line",
        deletedRange: {
          start: [0, 10, 1, 0],
          end: [0, 12, 8, 0],
        },
      },
    })

    assertEquals(commands, [
      "silent! undo",
      'silent! normal! 10GV12G"_d',
    ])
  })

  it("replays a normal history cycle by restoring the undo file", async () => {
    const commands: string[] = []
    const service = createReplaceSessionService(
      createMockVimApi({
        cmd: spy((command: string) => {
          commands.push(command)
          return Promise.resolve()
        }),
      }),
    )

    await service.prepareReplay({
      undoFilePath: "/tmp/history.undo",
      replaceInfo: null,
    })

    assertEquals(commands, [
      "silent! undo",
      "silent! rundo /tmp/history.undo",
    ])
  })

  it("builds the correct replay paste command for visual and char-wise cycles", () => {
    const service = createReplaceSessionService(createMockVimApi())

    assertEquals(
      service.buildReplayPasteCommand(
        { mode: "p", count: 1, register: '"', visualMode: true },
        { regtype: "v" },
      ),
      'silent! normal! 1""P',
    )

    assertEquals(
      service.buildReplayPasteCommand(
        { mode: "gp", count: 2, register: "a", visualMode: false },
        { regtype: "V" },
      ),
      'silent! normal! 2"agp',
    )
  })
})
