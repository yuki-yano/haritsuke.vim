import { assertEquals } from "../deps/test.ts"
import { describe, it } from "../deps/test.ts"
import { parseTextYankEvent } from "../api/args.ts"

describe("parseTextYankEvent", () => {
  it("parses direct event payload", () => {
    const result = parseTextYankEvent([{
      operator: "y",
      regname: "a",
      regtype: "V",
      regcontents: ["alpha"],
    }])

    assertEquals(result, {
      operator: "y",
      regname: "a",
      regtype: "V",
      regcontents: ["alpha"],
    })
  })

  it("parses nested payload for backward compatibility", () => {
    const result = parseTextYankEvent([[{
      operator: "y",
      regname: "a",
      regtype: "V",
      regcontents: ["alpha"],
    }]])

    assertEquals(result, {
      operator: "y",
      regname: "a",
      regtype: "V",
      regcontents: ["alpha"],
    })
  })
})
