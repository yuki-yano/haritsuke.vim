/**
 * Common utility functions
 */

import { REGISTER_TYPE, VISUAL_MODE } from "../constants.ts"

/**
 * Parse register type
 */
export const parseRegtype = (regtype: string): "v" | "V" | "b" => {
  if (regtype === REGISTER_TYPE.LINE || regtype === "\x56") {
    return REGISTER_TYPE.LINE
  } else if (regtype.startsWith(VISUAL_MODE.BLOCK) || regtype === REGISTER_TYPE.BLOCK) {
    return REGISTER_TYPE.BLOCK
  } else {
    return REGISTER_TYPE.CHAR
  }
}
