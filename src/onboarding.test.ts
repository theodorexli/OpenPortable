import assert from "node:assert/strict"
import { describe, it } from "node:test"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { isSeedLocalBody, SEED_MARKER } from "./onboarding.js"

const deskSeed = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../seed/context/desk.md"),
  "utf8",
)

describe("onboarding detection", () => {
  it("treats empty and seed-marker bodies as seed", () => {
    assert.equal(isSeedLocalBody(""), true)
    assert.equal(isSeedLocalBody(`# Desk\n${SEED_MARKER}\n`), true)
    assert.equal(isSeedLocalBody(deskSeed), true)
  })

  it("treats personalized desk as ready", () => {
    assert.equal(
      isSeedLocalBody("# Desk\n\n## Operator prefs\n- Be terse\n\n## Open threads\n- Ship v0.3\n"),
      false,
    )
  })
})
