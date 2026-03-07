import { assertEquals, describe, it } from "../deps/test.ts"
import { mapYankHistoryRowToEntry, toInsertParams } from "../data/database-records.ts"

describe("database-records", () => {
  describe("mapYankHistoryRowToEntry", () => {
    it("falls back to unnamed register when the row has no register", () => {
      const entry = mapYankHistoryRowToEntry({
        id: 10,
        content: "hello",
        regtype: "v",
        blockwidth: null,
        timestamp: 123,
        size: 5,
        source_file: null,
        source_line: null,
        source_filetype: null,
        register: null,
      })

      assertEquals(entry, {
        id: "10",
        content: "hello",
        regtype: "v",
        blockwidth: undefined,
        timestamp: 123,
        size: 5,
        sourceFile: undefined,
        sourceLine: undefined,
        sourceFiletype: undefined,
        register: '"',
      })
    })
  })

  describe("toInsertParams", () => {
    it("normalizes optional yank entry fields for prepared statements", () => {
      const params = toInsertParams({
        content: "line",
        regtype: "V",
        timestamp: 100,
        register: "a",
      }, 4)

      assertEquals(params, [
        "line",
        "V",
        null,
        100,
        4,
        null,
        null,
        null,
        "a",
      ])
    })
  })
})
