import type { YankCache } from "../data/cache.ts"
import type { RounderManager } from "../core/rounder.ts"
import type { PasteHandler } from "../core/paste-handler.ts"
import type { FileSystemApi, VimApi } from "../vim/vim-api.ts"
import type { PluginState } from "./plugin-state.ts"

export type RounderRuntimeState = {
  rounderManager: RounderManager
  vimApi: VimApi
}

export type RounderSessionRuntimeState = {
  cache: YankCache
  vimApi: VimApi
  fileSystemApi: FileSystemApi
}

export type PasteRuntimeState = RounderRuntimeState & RounderSessionRuntimeState & {
  pasteHandler: PasteHandler
}

export const getRounderRuntimeState = (state: PluginState): RounderRuntimeState | null => {
  if (!state.rounderManager || !state.vimApi) {
    return null
  }

  return {
    rounderManager: state.rounderManager,
    vimApi: state.vimApi,
  }
}

export const getPasteRuntimeState = (state: PluginState): PasteRuntimeState | null => {
  const rounderRuntime = getRounderRuntimeState(state)
  const rounderSessionRuntime = getRounderSessionRuntimeState(state)
  if (!rounderRuntime || !rounderSessionRuntime || !state.pasteHandler) {
    return null
  }

  return {
    ...rounderRuntime,
    ...rounderSessionRuntime,
    pasteHandler: state.pasteHandler,
  }
}

export const getRounderSessionRuntimeState = (state: PluginState): RounderSessionRuntimeState | null => {
  if (!state.cache || !state.vimApi || !state.fileSystemApi) {
    return null
  }

  return {
    cache: state.cache,
    vimApi: state.vimApi,
    fileSystemApi: state.fileSystemApi,
  }
}

export const requirePasteRuntimeState = (state: PluginState): PasteRuntimeState => {
  const runtime = getPasteRuntimeState(state)
  if (!runtime) {
    throw new Error("Paste runtime is not initialized")
  }
  return runtime
}

export const requireRounderSessionRuntimeState = (
  state: PluginState,
): RounderSessionRuntimeState => {
  const runtime = getRounderSessionRuntimeState(state)
  if (!runtime) {
    throw new Error("Rounder session runtime is not initialized")
  }
  return runtime
}
