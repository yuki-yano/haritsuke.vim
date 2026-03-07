import { assertEquals, assertSpyCalls, describe, it, spy } from "../deps/test.ts"
import { createRegisterSyncManager } from "../data/register-sync-manager.ts"
import type { RegisterSnapshot, YankDatabase } from "../data/database.ts"
import type { VimApi } from "../vim/vim-api.ts"

const createMockDatabase = () => {
  const snapshots: RegisterSnapshot[] = []
  let dataVersion = 1
  const upsertRegisterSnapshotSpy = spy((snapshot: RegisterSnapshot) => {
    const index = snapshots.findIndex((entry) => entry.register === snapshot.register)
    if (index >= 0) {
      snapshots[index] = snapshot
    } else {
      snapshots.push(snapshot)
    }
    dataVersion += 1
    return Promise.resolve()
  })

  return {
    database: {
      init: () => Promise.resolve(),
      add: () => Promise.reject("not implemented"),
      getRecent: () => [],
      clear: () => Promise.resolve(),
      getSyncStatus: () => ({ lastTimestamp: 0, entryCount: 0 }),
      close: () => {},
      upsertRegisterSnapshot: upsertRegisterSnapshotSpy,
      getRegisterSnapshots: spy(() => snapshots.slice()),
      getDataVersion: spy(() => dataVersion),
    } as unknown as YankDatabase,
    snapshots,
    upsertRegisterSnapshotSpy,
    setDataVersion: (value: number) => {
      dataVersion = value
    },
  }
}

const createMockVimApi = (overrides: Partial<VimApi> = {}): VimApi => {
  return {
    bufnr: () => Promise.resolve(1),
    getreg: () => Promise.resolve(""),
    setreg: () => Promise.resolve(),
    getregtype: () => Promise.resolve("v"),
    getreginfo: () =>
      Promise.resolve({
        regcontents: ["value"],
        regtype: "v",
        isunnamed: false,
      }),
    setreginfo: () => Promise.resolve(),
    getpos: () => Promise.resolve([0, 1, 1, 0]),
    line: () => Promise.resolve(1),
    getline: () => Promise.resolve(""),
    undotree: () => Promise.resolve({}),
    cmd: () => Promise.resolve(),
    eval: () => Promise.resolve(undefined),
    setGlobalVar: () => Promise.resolve(),
    getGlobalVar: () => Promise.resolve(undefined),
    getwinvar: () => Promise.resolve(undefined),
    getbufvar: () => Promise.resolve(undefined),
    echo: () => Promise.resolve(),
    ...overrides,
  }
}

describe("createRegisterSyncManager", () => {
  it("captures affected registers for yank events", async () => {
    const { database, upsertRegisterSnapshotSpy } = createMockDatabase()
    const getreginfoSpy = spy((register: string) =>
      Promise.resolve({
        regcontents: [`value-${register}`],
        regtype: "v",
        isunnamed: register === '"',
      })
    )
    const vimApi = createMockVimApi({
      getreginfo: getreginfoSpy,
    })

    const manager = createRegisterSyncManager(
      database,
      vimApi,
      {
        enabled: true,
        registerKeys: "a",
        sourceInstanceId: "local-instance",
      },
      null,
    )

    await manager.captureFromYank({
      operator: "y",
      regname: "a",
    })

    assertSpyCalls(getreginfoSpy, 3)
    assertEquals(
      getreginfoSpy.calls.map((call) => call.args[0]),
      ['"', "0", "a"],
    )
    assertSpyCalls(upsertRegisterSnapshotSpy, 3)
  })

  it("ignores non-yank operators", async () => {
    const { database, upsertRegisterSnapshotSpy } = createMockDatabase()
    const getreginfoSpy = spy(() =>
      Promise.resolve({
        regcontents: ["value"],
        regtype: "v",
        isunnamed: false,
      })
    )
    const vimApi = createMockVimApi({
      getreginfo: getreginfoSpy,
    })

    const manager = createRegisterSyncManager(
      database,
      vimApi,
      {
        enabled: true,
        registerKeys: "a",
        sourceInstanceId: "local-instance",
      },
      null,
    )

    await manager.captureFromYank({
      operator: "d",
      regname: "a",
    })

    assertSpyCalls(getreginfoSpy, 0)
    assertSpyCalls(upsertRegisterSnapshotSpy, 0)
  })

  it("applies remote snapshots only when data version changes", async () => {
    const { database, snapshots, setDataVersion } = createMockDatabase()
    snapshots.push({
      register: "a",
      regcontents: ["remote-1"],
      regtype: "V",
      sourceInstanceId: "remote-instance",
      updatedAt: 100,
    })

    const setreginfoSpy = spy(() => Promise.resolve())
    const vimApi = createMockVimApi({
      setreginfo: setreginfoSpy,
    })

    const manager = createRegisterSyncManager(
      database,
      vimApi,
      {
        enabled: true,
        registerKeys: "a",
        sourceInstanceId: "local-instance",
      },
      null,
    )

    const firstSynced = await manager.syncIfNeeded()
    assertEquals(firstSynced, true)
    assertSpyCalls(setreginfoSpy, 1)

    const secondSynced = await manager.syncIfNeeded()
    assertEquals(secondSynced, false)
    assertSpyCalls(setreginfoSpy, 1)

    snapshots[0] = {
      ...snapshots[0],
      regcontents: ["remote-2"],
      updatedAt: 200,
    }
    setDataVersion(2)

    const thirdSynced = await manager.syncIfNeeded()
    assertEquals(thirdSynced, true)
    assertSpyCalls(setreginfoSpy, 2)
  })

  it("does not apply snapshots from the same instance", async () => {
    const { database, snapshots } = createMockDatabase()
    snapshots.push({
      register: "a",
      regcontents: ["local"],
      regtype: "v",
      sourceInstanceId: "local-instance",
      updatedAt: 100,
    })

    const setreginfoSpy = spy(() => Promise.resolve())
    const vimApi = createMockVimApi({
      setreginfo: setreginfoSpy,
    })

    const manager = createRegisterSyncManager(
      database,
      vimApi,
      {
        enabled: true,
        registerKeys: "a",
        sourceInstanceId: "local-instance",
      },
      null,
    )

    const synced = await manager.syncIfNeeded()
    assertEquals(synced, false)
    assertSpyCalls(setreginfoSpy, 0)
  })
})
