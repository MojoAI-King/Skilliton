#!/usr/bin/env node
// fork-redact.test.mjs: a credential typed as the user name of `company init --marketplace-repo` is not printed (N37).
//
// validateRepo in lib/fork.mjs quoted the refused value verbatim. It now passes it through redact() from
// lib/preflight.mjs, after taking out whatever comes before an "@". The refusal comes before any file is read or
// written, so the command runs against this checkout. The value below is made up and matches no real credential.
//
//   node --test scripts/fork-redact.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = "FAKEVALUE0123456789";

function companyInit(marketplaceRepo) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "skilliton.mjs"), "company", "init", "--name", "acme", "--marketplace-repo", marketplaceRepo, "--repo", ROOT], { cwd: ROOT, encoding: "utf8" });
  return { status: r.status, all: `${r.stdout}${r.stderr}` };
}

test("N37: company init refuses a token typed as a user name without printing it", () => {
  for (const value of [`${FAKE}@github.com/o/r`, `someone:${FAKE}@github.com/o/r`, `https://${FAKE}@github.com/o/r`, `${FAKE}@github.com:o/r`]) {
    const { status, all } = companyInit(value);
    assert.equal(status, 2, `company init must refuse ${JSON.stringify(value.replace(FAKE, "<fake>"))}:\n${all}`);
    assert.match(all, /--marketplace-repo must look like owner\/repo/, "the refusal is the owner/repo one, not another");
    assert.doesNotMatch(all, new RegExp(FAKE), "the value typed before the @ is never printed");
  }
});

test("N37: the refusal still shows the part of the value that is not a credential", () => {
  const withToken = companyInit(`${FAKE}@github.com/o/r`);
  assert.match(withToken.all, /got "<credentials removed>@github\.com\/o\/r"/);
  const plain = companyInit("acme/sk ills");
  assert.equal(plain.status, 2);
  assert.match(plain.all, /got "acme\/sk ills"/, "a value with no credential in it is printed as it was typed");
});
