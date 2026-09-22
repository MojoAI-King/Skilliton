// scripts/root-and-handoff-settings.test.mjs: two small behaviors with no older test file that can grow to hold them
// (the files that would are pinned by the size ratchet in scripts/lint.test.mjs).
//
//   B56  --dir accepts the repository root in another letter case on a case-insensitive filesystem
//   B60  handoff.keepEarlier sets how many earlier notes stay in the handoff; the rest go to the archive

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "skilliton.mjs");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const cli = (cwd, args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" }); return { code: r.status, all: `${r.stdout}${r.stderr}` }; };

function repo(prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "t"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  writeFileSync(join(dir, "README.md"), "# fixture\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "first"]);
  return dir;
}

test("B56: the repository root typed in another letter case is the root, on a filesystem that ignores case", (t) => {
  const dir = repo("root-case-");
  try {
    const flipped = join(dirname(dir), basename(dir).toUpperCase());
    if (flipped === dir || !existsSync(flipped)) { t.skip("this filesystem is case-sensitive, so another spelling is another folder"); return; }
    const r = cli(dir, ["prepare", "--dir", flipped]);
    assert.equal(r.code, 0, r.all);
    assert.doesNotMatch(r.all, /is not its root/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("B60: handoff.keepEarlier 0 keeps only RESUME HERE in the handoff and moves the previous note to the archive; a value out of range is refused", () => {
  const dir = repo("keep-earlier-");
  try {
    assert.equal(cli(dir, ["prepare", "--apply"]).code, 0);
    const configPath = join(dir, ".skilliton", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    writeFileSync(configPath, `${JSON.stringify({ ...config, handoff: { ...(config.handoff ?? {}), keepEarlier: 0 } }, null, 2)}\n`);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "prepared"]);
    assert.equal(cli(dir, ["task", "start", "the work", "--apply"]).code, 0);
    const note = (n) => cli(dir, ["checkpoint", "--handoff", "--state", `state ${n}`, "--evidence", "none", "--next", `next ${n}`, "--apply"]);
    const first = note(1);
    assert.equal(first.code, 0, first.all);
    const second = note(2);
    assert.equal(second.code, 0, second.all);
    const handoff = readFileSync(join(dir, "docs", "HANDOFF.md"), "utf8");
    assert.match(handoff, /state 2/);
    assert.doesNotMatch(handoff, /state 1/, "the previous note is not kept in the handoff");
    assert.match(readFileSync(join(dir, "docs", "HANDOFF_ARCHIVE.md"), "utf8"), /state 1/, "it moved to the archive");

    writeFileSync(configPath, `${JSON.stringify({ ...config, handoff: { keepEarlier: 21 } }, null, 2)}\n`);
    const refused = cli(dir, ["status"]);
    assert.equal(refused.code, 2, refused.all);
    assert.match(refused.all, /handoff\.keepEarlier must be a whole number from 0 to 20/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
