import assert from "node:assert/strict"
import path from "node:path"
import { describe, it } from "node:test"

import { defaultDbPath, defaultUserDbPath, isPackagedInstall } from "./runtime.js"

describe("local runtime paths", () => {
  it("detects packaged installs under node_modules", () => {
    assert.equal(isPackagedInstall("/tmp/proj"), false)
    assert.equal(isPackagedInstall("/tmp/node_modules/openport"), true)
    assert.equal(isPackagedInstall("/Users/x/.npm/_npx/abc/node_modules/openport"), true)
  })

  it("honors OPENPORT_DB over defaults", () => {
    const prev = process.env.OPENPORT_DB
    process.env.OPENPORT_DB = "/tmp/custom-openport.sqlite"
    try {
      assert.equal(defaultDbPath(), "/tmp/custom-openport.sqlite")
    } finally {
      if (prev === undefined) delete process.env.OPENPORT_DB
      else process.env.OPENPORT_DB = prev
    }
  })

  it("user db path is under ~/.openport", () => {
    assert.ok(defaultUserDbPath().endsWith(path.join(".openport", "openport.sqlite")))
  })
})
