#!/usr/bin/env node
// join-redact.test.mjs: a credential typed into `join --marketplace` is not printed back (N25).
//
// scripts/join.test.mjs is pinned at its size (scripts/lint.test.mjs), so this case lives here. It builds the same shape
// of company skills clone in a temporary folder (the real workflow plugin, a catalog named acme-skills, a team template)
// and runs join from it with every home, trust, receipt and launcher folder inside that folder. The refusal comes before
// any client is run, so none is on PATH. The value below is made up and matches no real credential.
//
//   node --test scripts/join-redact.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKET = "acme-skills";
const FAKE = "FAKEVALUE0123456789";
const GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid" };

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("N25: join refuses a marketplace URL carrying a credential without printing the credential", (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-join-redact-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, "company-skills");
  cpSync(join(ROOT, "packs", "base", "plugins", "workflow"), join(repo, "packs", "base", "plugins", "workflow"), { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts", "skilliton.mjs"), join(repo, "scripts", "skilliton.mjs"));
  writeJson(join(repo, ".claude-plugin", "marketplace.json"), {
    name: MARKET, owner: { name: "acme" },
    plugins: [{ name: "workflow", source: "./packs/base/plugins/workflow", description: "workflow", license: "MIT" }],
  });
  writeJson(join(repo, "templates", "project-settings.json"), {
    extraKnownMarketplaces: { [MARKET]: { source: { source: "github", repo: "acme/skills" }, autoUpdate: true } },
    enabledPlugins: { [`workflow@${MARKET}`]: true },
  });
  const env = { ...GIT_ENV, PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(":"), HOME: join(base, "home"), LANG: "C.UTF-8", SKILLITON_SELF: "skilliton" };
  for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "company skills"]]) execFileSync("git", ["-C", repo, ...args], { env });
  mkdirSync(env.HOME, { recursive: true });
  mkdirSync(join(base, "keys"));
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "approver@example.invalid", "-f", join(base, "keys", "approver")], { env });
  const signers = join(base, "keys", "allowed_signers");
  writeFileSync(signers, `approver@example.invalid namespaces="git" ${readFileSync(join(base, "keys", "approver.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ")}\n`);
  Object.assign(env, {
    CLAUDE_CONFIG_DIR: join(base, "claude-config"), CODEX_HOME: join(base, "codex-home"), SKILLITON_TRUST_DIR: join(base, "trust"),
    SKILLITON_JOIN_DIR: join(base, "joined"), SKILLITON_BACKUPS: join(base, "backups"),
  });

  for (const url of [`https://someone:${FAKE}@github.com/o/r`, `ssh://git:${FAKE}@github.com/o/r.git`]) {
    for (const apply of [[], ["--apply"]]) {
      const r = spawnSync(process.execPath, [join(repo, "scripts", "skilliton.mjs"), "join", "--company", "acme", "--signers", signers, "--marketplace", url, "--bin-dir", join(base, "bin"), ...apply], { cwd: base, env, encoding: "utf8" });
      const all = `${r.stdout}${r.stderr}`;
      assert.equal(r.status, 2, `join must refuse ${apply.length ? "with" : "without"} --apply:\n${all}`);
      assert.match(all, /--marketplace must be a GitHub owner\/repo or an existing folder/, "the refusal is the URL one, not another");
      assert.doesNotMatch(all, new RegExp(FAKE), "the credential typed in the URL is never printed");
      assert.match(all, /<credentials removed>@github\.com/, "the refusal still shows which URL it refused");
    }
  }
});
