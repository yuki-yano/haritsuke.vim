/**
 * Common utility functions
 */

/**
 * Parse register type
 */
export const parseRegtype = (regtype: string): "v" | "V" | "b" => {
  if (regtype === "V" || regtype === "\x56") {
    return "V"
  } else if (regtype.startsWith("\x16") || regtype === "b") {
    return "b"
  } else {
    return "v"
  }
}
