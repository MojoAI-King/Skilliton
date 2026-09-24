// usage-ledger-links.test.mjs: the usage ledger is never read or written through a link. A repository can commit a
// symbolic link at .skilliton/usage/ledger.jsonl or at the .skilliton/usage folder; before this, `usage screen --apply`
// and `maintain --apply` appended their row to wherever the link pointed, outside the repository, and said it was
// written. A ledger with a second hard link is refused too, because appending to it would change the other file.
//   node scripts/usage-ledger-links.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { appendLedgerRow, ledgerLinkProblem, readLedger } from "../packs/base/plugins/workflow/runtime/lib/usage-ledger.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "skilliton.mjs");
const ORIGINAL = "the file outside the repository\n";
const SCREEN = { kind: "screen", at: "2026-09-24T12:00:00.000Z", five_hour: 10, weekly: 20, model_weekly: null };

function withRepo(body) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ledger-links-")));
  try {
    const repo = join(dir, "repo"), outside = join(dir, "outside");
    mkdirSync(repo); mkdirSync(outside);
    const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    git("init", "-q");
    git("-c", "user.email=t@example.invalid", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
    writeFileSync(join(outside, "target.txt"), ORIGINAL);
    body({ repo, outside });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const screen = (repo) => spawnSync(process.execPath, [CLI, "usage", "screen", "--five-hour", "10", "--weekly", "20", "--apply"], { cwd: repo, encoding: "utf8" });

test("control: with no link, usage screen writes its row inside the repository", () => withRepo(({ repo }) => {
  const r = screen(repo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(repo, ".skilliton", "usage", "ledger.jsonl"), "utf8"), /"kind":"screen"/);
  assert.equal(ledgerLinkProblem(repo), null);
}));

test("a linked ledger file is refused with nothing written, and the file it points at keeps every byte", () => withRepo(({ repo, outside }) => {
  mkdirSync(join(repo, ".skilliton", "usage"), { recursive: true });
  symlinkSync(join(outside, "target.txt"), join(repo, ".skilliton", "usage", "ledger.jsonl"));
  const r = screen(repo);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /ledger\.jsonl is a symbolic link, and the usage ledger is never read or written through a link.*Nothing was written/s);
  assert.equal(readFileSync(join(outside, "target.txt"), "utf8"), ORIGINAL);
  assert.throws(() => readLedger(repo), /is a symbolic link/);
  const direct = appendLedgerRow(repo, SCREEN);
  assert.equal(direct.written, false);
  assert.equal(readFileSync(join(outside, "target.txt"), "utf8"), ORIGINAL, "the library refuses too, not only the command");
}));

test("a linked usage folder is refused, and no ledger appears where it points", () => withRepo(({ repo, outside }) => {
  mkdirSync(join(repo, ".skilliton"));
  symlinkSync(outside, join(repo, ".skilliton", "usage"));
  const r = screen(repo);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /\.skilliton\/usage is a symbolic link/);
  assert.equal(existsSync(join(outside, "ledger.jsonl")), false);
}));

test("a ledger with a second hard link is refused, and the other name keeps every byte", () => withRepo(({ repo, outside }) => {
  mkdirSync(join(repo, ".skilliton", "usage"), { recursive: true });
  linkSync(join(outside, "target.txt"), join(repo, ".skilliton", "usage", "ledger.jsonl"));
  const r = screen(repo);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /has 2 hard links/);
  assert.equal(readFileSync(join(outside, "target.txt"), "utf8"), ORIGINAL);
}));
