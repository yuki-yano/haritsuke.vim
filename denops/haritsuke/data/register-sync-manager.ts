import type { RegisterSnapshot, YankDatabase } from "./database.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import type { RegisterInfo, VimApi } from "../vim/vim-api.ts"
import { withErrorHandling } from "../utils/error-handling.ts"
import { SPECIAL_REGISTERS } from "../constants.ts"

export type RegisterSyncEvent = {
  operator?: string
  regname?: string
}

export type RegisterSyncConfig = {
  enabled: boolean
  registerKeys: string
  sourceInstanceId: string
}

export type RegisterSyncManager = {
  captureFromYank: (event: RegisterSyncEvent | null | undefined) => Promise<void>
  syncIfNeeded: () => Promise<boolean>
  reset: () => void
}

const normalizeRegister = (register: string): string => {
  return /^[a-z]$/i.test(register) ? register.toLowerCase() : register
}

const createSyncableRegisters = (registerKeys: string): Set<string> => {
  const syncable = new Set<string>([SPECIAL_REGISTERS.UNNAMED, "0"])

  for (const key of Array.from(registerKeys)) {
    if (/^[a-z]$/i.test(key)) {
      syncable.add(key.toLowerCase())
      continue
    }

    if (key === SPECIAL_REGISTERS.UNNAMED || key === "+" || key === "*" || key === "0") {
      syncable.add(key)
    }
  }

  return syncable
}

const serializeSnapshot = (snapshot: RegisterSnapshot): string => {
  return JSON.stringify(snapshot)
}

const isRegisterInfo = (value: RegisterInfo | null | undefined): value is RegisterInfo => {
  return !!value && Array.isArray(value.regcontents) && typeof value.regtype === "string" && value.regtype.length > 0
}

const getAffectedRegisters = (
  event: RegisterSyncEvent | null | undefined,
  syncableRegisters: Set<string>,
): string[] => {
  if (event?.operator !== "y") {
    return []
  }

  const affected = new Set<string>([SPECIAL_REGISTERS.UNNAMED, "0"])
  const explicitRegister = typeof event.regname === "string" && event.regname.length === 1
    ? normalizeRegister(event.regname)
    : SPECIAL_REGISTERS.UNNAMED

  if (explicitRegister !== SPECIAL_REGISTERS.UNNAMED) {
    affected.add(explicitRegister)
  }

  return Array.from(affected).filter((register) => syncableRegisters.has(register))
}

export const createRegisterSyncManager = (
  database: YankDatabase,
  vimApi: VimApi,
  config: RegisterSyncConfig,
  logger: DebugLogger | null = null,
): RegisterSyncManager => {
  const syncableRegisters = createSyncableRegisters(config.registerKeys)
  const appliedSnapshots = new Map<string, string>()
  let lastDataVersion: number | null = null

  return {
    captureFromYank: async (event): Promise<void> => {
      if (!config.enabled) {
        return
      }

      await withErrorHandling(
        async () => {
          const registers = getAffectedRegisters(event, syncableRegisters)
          if (registers.length === 0) {
            return
          }

          const updatedAt = Date.now()
          for (const register of registers) {
            const info = await vimApi.getreginfo(register)
            if (!isRegisterInfo(info)) {
              continue
            }

            const snapshot: RegisterSnapshot = {
              register,
              regcontents: info.regcontents.map((content) => String(content)),
              regtype: info.regtype,
              updatedAt,
              sourceInstanceId: config.sourceInstanceId,
            }

            await database.upsertRegisterSnapshot(snapshot)
            appliedSnapshots.set(register, serializeSnapshot(snapshot))
          }
        },
        "register sync captureFromYank",
        logger,
      )
    },

    syncIfNeeded: async (): Promise<boolean> => {
      if (!config.enabled) {
        return false
      }

      return await withErrorHandling(
        async () => {
          const currentDataVersion = database.getDataVersion()
          if (lastDataVersion !== null && currentDataVersion === lastDataVersion) {
            return false
          }

          lastDataVersion = currentDataVersion
          const snapshots = database.getRegisterSnapshots()
          let synced = false

          for (const snapshot of snapshots) {
            if (!syncableRegisters.has(snapshot.register)) {
              continue
            }

            const serialized = serializeSnapshot(snapshot)
            if (appliedSnapshots.get(snapshot.register) === serialized) {
              continue
            }

            appliedSnapshots.set(snapshot.register, serialized)

            if (snapshot.sourceInstanceId === config.sourceInstanceId) {
              continue
            }

            await vimApi.setreginfo(snapshot.register, {
              regcontents: snapshot.regcontents,
              regtype: snapshot.regtype,
              isunnamed: snapshot.register === SPECIAL_REGISTERS.UNNAMED,
            })
            synced = true
          }

          return synced
        },
        "register sync syncIfNeeded",
        logger,
        false,
      )
    },

    reset: (): void => {
      appliedSnapshots.clear()
      lastDataVersion = null
    },
  }
}
