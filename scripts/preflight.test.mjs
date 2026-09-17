#!/usr/bin/env node
// preflight.test.mjs: `skilliton preflight` against real blocks, made on purpose (backlog B27 and B29).
//
// The point of the check is what it says when something is in the way, so every case here creates a real condition on
// this machine and reads what preflight reports: a program taken off PATH, a program that is there but cannot be run,
// a program whose exec fails, a folder this user may not write, a plugin folder whose scripts may not run, a
// repository behind a proxy that refuses the connection, and a marketplace folder with no catalog. Nothing here is a
// mock of a security product: these are the conditions such a product creates, and a product may also block in ways
// none of them shows (docs/BACKLOG.md B29). No endpoint-security product was available to test under.
//
// Every case ends with what a person would do next, so a message that stops naming the way out fails the test.
//
//   node --test scripts/preflight.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROGRAMS } from "../packs/base/plugins/workflow/runtime/lib/preflight.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" };
const PLUGINS = join(ROOT, "packs", "base", "plugins");
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

const toolPath = (name) => {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${name} is needed by this test and was not found on PATH`);
  return r.stdout.trim();
};

// Every program the check looks for, except the coding tools, which the fixture stands in for.
const ALL_TOOLS = PROGRAMS.filter((p) => p.need !== "client").map((p) => p.name);

// A company skills repository clone with the real plugins, a tools folder that holds only what the case allows, and
// home folders inside the temporary folder, so nothing on this machine is read or changed. `without` takes programs
// off that PATH, which is how a case makes one missing.
function fixture(t, { tools = ALL_TOOLS, without = [] } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-preflight-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, repo: join(base, "company-skills"), tools: join(base, "tools"), home: join(base, "home"), bin: join(base, "bin") };
  for (const d of [ctx.tools, ctx.home, ctx.bin]) mkdirSync(d, { recursive: true });
  for (const name of tools.filter((n) => !without.includes(n))) {
    const target = name === "node" ? process.execPath : toolPathOrNull(name);
    if (target) symlinkSync(target, join(ctx.tools, name));
  }
  // A stand-in for Claude Code: the check never starts a coding tool, so an executable file with the right name is
  // exactly what it looks for.
  writeFileSync(join(ctx.tools, "claude"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(ctx.tools, "claude"), 0o755);
  cpSync(join(PLUGINS, "workflow"), join(ctx.repo, "packs", "base", "plugins", "workflow"), { recursive: true });
  mkdirSync(join(ctx.repo, "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts", "skilliton.mjs"), join(ctx.repo, "scripts", "skilliton.mjs"));
  mkdirSync(join(ctx.repo, ".claude-plugin"), { recursive: true });
  return ctx;
}

function toolPathOrNull(name) {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Replaces a program on the fixture's PATH with a file of its own. The link to the real program is removed first, so
// nothing is ever written through it to the program itself.
function standIn(ctx, name, text, mode) {
  const path = join(ctx.tools, name);
  rmSync(path, { force: true });
  writeFileSync(path, text);
  chmodSync(path, mode);
}

// Runs preflight with only the fixture's tools on PATH. Returns { code, out }. The repository check is skipped unless
// `network` is true, and then it runs against whatever the environment allows.
function preflight(ctx, args = [], { env = {}, network = false } = {}) {
  const r = spawnSync(process.execPath, [join(ctx.repo, "scripts", "skilliton.mjs"), "preflight", ...(network ? [] : ["--no-network"]), ...args], {
    encoding: "utf8",
    cwd: ctx.base,
    env: {
      PATH: ctx.tools, HOME: ctx.home, LANG: "C.UTF-8", TMPDIR: tmpdir(),
      SKILLITON_SELF: "skilliton", SKILLITON_TRUST_DIR: join(ctx.home, "trust"), SKILLITON_JOIN_DIR: join(ctx.home, "joined"),
      SKILLITON_BACKUPS: join(ctx.home, "backups"), CLAUDE_CONFIG_DIR: join(ctx.home, "claude"), CODEX_HOME: join(ctx.home, "codex"),
      ...env,
    },
    timeout: 120000,
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// The line about one item, including the line after it, which carries what to do. `pattern` is matched against the
// item's name as a regular expression.
function item(out, pattern) {
  const lines = out.split("\n");
  const index = lines.findIndex((l) => new RegExp(`^\\s+(OK|BLOCKED|MISSING|SKIPPED)\\s+${pattern}:`).test(l));
  assert.notEqual(index, -1, `no line for ${pattern} in:\n${out}`);
  return `${lines[index]}\n${lines[index + 1] ?? ""}`;
}

test("a machine with everything in place passes, and leaves no file behind", (t) => {
  const ctx = fixture(t);
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /nothing is in the way/);
  assert.match(item(r.out, "git"), /OK\s+git:/);
  assert.match(item(r.out, "the hook scripts"), /OK\s+the hook scripts: .*probe\.sh ran the way Claude Code runs a hook/);
  // The folders it tested hold nothing afterwards: every probe file is removed.
  const leftovers = spawnSync("find", [ctx.home, ctx.bin, "-name", ".skilliton-preflight-*"], { encoding: "utf8" });
  assert.equal(leftovers.stdout.trim(), "", `preflight left a file behind: ${leftovers.stdout}`);
});

test("a program taken off PATH is named as missing, with what to do", (t) => {
  const ctx = fixture(t, { without: ["git"] });
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin]);
  assert.equal(r.code, 1, r.out);
  assert.match(item(r.out, "git"), /MISSING\s+git: not found on PATH/);
  assert.match(item(r.out, "git"), /Install git, or add it to PATH \(docs\/IT-ALLOWLIST\.md section 1\)/);
  assert.match(r.out, /setting this machine up would stop at: .*git/);
});

test("a program that is there but may not be run is named as blocked, not as missing", (t) => {
  if (asRoot) return t.skip("running as root: a file this user may not run cannot be made");
  const ctx = fixture(t, { without: ["git"] });
  standIn(ctx, "git", "#!/bin/sh\nexit 0\n", 0o644);
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin]);
  assert.equal(r.code, 1, r.out);
  assert.match(item(r.out, "git"), /BLOCKED\s+git: it is there, but this user may not run it/);
  assert.match(item(r.out, "git"), /Ask IT to allow .*git to be started/);
});

test("a program whose exec fails is named as blocked, with the shell's own message", (t) => {
  const ctx = fixture(t, { without: ["git"] });
  // An executable file the kernel cannot start: the same exit status a policy that refuses an exec produces.
  standIn(ctx, "git", "#!/nonexistent/interpreter\n", 0o755);
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin]);
  assert.equal(r.code, 1, r.out);
  assert.match(item(r.out, "git"), /BLOCKED\s+git:/);
  assert.match(item(r.out, "git"), /Ask IT to allow/);
});

test("a program a hook needs, blocked, stops sessions but not setup", (t) => {
  if (asRoot) return t.skip("running as root: a file this user may not run cannot be made");
  const ctx = fixture(t);
  standIn(ctx, "grep", "#!/bin/sh\nexit 0\n", 0o000);
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin]);
  assert.equal(r.code, 1, r.out);
  assert.match(item(r.out, "grep"), /(BLOCKED|MISSING)\s+grep:/);
  assert.match(r.out, /setup would finish, but in a session these would not work: .*grep/);
  assert.doesNotMatch(r.out, /setting this machine up would stop at/);
});

test("a folder this user may not write is named, with what Skilliton keeps there", (t) => {
  if (asRoot) return t.skip("running as root: an unwritable folder cannot be made");
  const ctx = fixture(t);
  const trust = join(ctx.home, "trust");
  mkdirSync(trust, { recursive: true });
  chmodSync(trust, 0o500); // the temporary tree is removed at the end of the test, so the mode is not put back
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin]);
  assert.equal(r.code, 1, r.out);
  const line = item(r.out, "[^:]*trust");
  assert.match(line, /BLOCKED/);
  assert.match(line, /EACCES|EPERM/);
  assert.match(line, /Ask IT to allow this user to write .*trust.*Skilliton writes the signers file/s);
});

test("a plugin folder whose scripts may not run is reported as stopping every hook", (t) => {
  if (asRoot) return t.skip("running as root: a script this user may not run cannot be made");
  const ctx = fixture(t);
  chmodSync(join(ctx.repo, "packs", "base", "plugins", "workflow", "runtime", "preflight", "probe.sh"), 0o644);
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin]);
  assert.equal(r.code, 1, r.out);
  assert.match(item(r.out, "the hook scripts"), /BLOCKED\s+the hook scripts: .*could not be run by its path/);
  assert.match(item(r.out, "the hook scripts"), /Ask IT to allow bash and node to run scripts under the plugin cache folder/);
});

test("a repository behind a proxy that refuses the connection is named, with the proxy question", (t) => {
  const ctx = fixture(t);
  // A real connection to a port nothing listens on: git tries, and fails the way a blocking proxy makes it fail.
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", "acme/skills"], {
    network: true,
    env: { HTTPS_PROXY: "http://127.0.0.1:9", https_proxy: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9" },
  });
  assert.equal(r.code, 1, r.out);
  const line = item(r.out, "github\\.com/acme/skills");
  assert.match(line, /BLOCKED/);
  assert.match(line, /git ls-remote could not read it/);
  assert.match(line, /Ask IT whether this machine may reach github\.com, and with which proxy/);
});

test("a marketplace folder without a catalog is named without contacting anything", (t) => {
  const ctx = fixture(t);
  const empty = join(ctx.base, "not-a-marketplace");
  mkdirSync(empty, { recursive: true });
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", empty], { network: true });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /the folder has no \.claude-plugin\/marketplace\.json/);
});

// Two ways a folder's own .git/config can make git run a command of its author's choosing: the ext transport, and an
// ssh command for an address rewritten to ssh. A copied working folder carries that file, and a developer stands in
// such a folder all day. Each case sets the trap, proves plain git falls into it, and then checks that preflight does
// not, with the temporary folder inside the hostile one so that no choice of working folder helps.
for (const trap of [
  { name: "the ext transport", config: (marker) => `[protocol "ext"]\n\tallow = always\n[url "ext::sh -c mkdir% ${marker}% #"]\n\tinsteadOf = https://github.com/\n` },
  { name: "an ssh command", config: (marker) => `[url "ssh://example.invalid/x"]\n\tinsteadOf = https://github.com/\n[core]\n\tsshCommand = sh -c 'mkdir ${marker}' #\n` },
]) {
  test(`a repository the check is run inside cannot make git run a command through ${trap.name}`, (t) => {
    const ctx = fixture(t);
    const hostile = join(ctx.base, "hostile");
    const marker = join(hostile, "RAN"); // made by mkdir, one of the few programs on the fixture's PATH
    mkdirSync(hostile, { recursive: true });
    const gitEnv = { PATH: ctx.tools, HOME: ctx.home, ...GIT_ENV };
    spawnSync(toolPath("git"), ["-C", hostile, "init", "-q", "-b", "main"], { encoding: "utf8", env: gitEnv });
    writeFileSync(join(hostile, ".git", "config"), `${readFileSync(join(hostile, ".git", "config"), "utf8")}\n${trap.config(marker)}`);

    // The positive control: plain git in that folder does run the command, so the check below means something.
    const control = spawnSync(toolPath("git"), ["ls-remote", "--heads", "--", "https://github.com/acme/skills.git"], { cwd: hostile, encoding: "utf8", env: gitEnv });
    assert.equal(existsSync(marker), true, `the fixture did not make plain git run the command, so this case would prove nothing (git said: ${control.stderr?.trim().slice(0, 300)})`);
    rmSync(marker, { recursive: true, force: true });

    const r = spawnSync(process.execPath, [join(ctx.repo, "scripts", "skilliton.mjs"), "preflight", "--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", "acme/skills"], {
      encoding: "utf8", cwd: hostile, timeout: 120000,
      env: {
        PATH: ctx.tools, HOME: ctx.home, LANG: "C.UTF-8", SKILLITON_SELF: "skilliton", TMPDIR: hostile,
        SKILLITON_TRUST_DIR: join(ctx.home, "trust"), SKILLITON_JOIN_DIR: join(ctx.home, "joined"),
        SKILLITON_BACKUPS: join(ctx.home, "backups"), CLAUDE_CONFIG_DIR: join(ctx.home, "claude"), CODEX_HOME: join(ctx.home, "codex"),
      },
    });
    assert.equal(existsSync(marker), false, `the repository's configuration made the check run a command:\n${r.stdout}${r.stderr}`);
  });
}

test("a program that never answers is stopped with its children, and the check finishes", (t) => {
  if (process.platform === "win32") return t.skip("process groups work differently on Windows");
  const ctx = fixture(t);
  // A program that ignores being asked to stop, with a child of its own holding the output open: the shape that made
  // a synchronous start wait for ever.
  // Absolute paths, because the fixture's PATH holds only what the check looks for, and not sleep.
  standIn(ctx, "git", `#!/bin/bash\ntrap '' TERM\n( /bin/sleep 120 ) &\n/bin/sleep 120\n`, 0o755);
  const started = Date.now();
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin]);
  const seconds = (Date.now() - started) / 1000;
  assert.ok(seconds < 90, `the check took ${seconds}s, so a program that hangs was not stopped`);
  assert.match(item(r.out, "git"), /SKIPPED\s+git: it did not answer/);
  const left = spawnSync("pgrep", ["-f", join(ctx.tools, "git")], { encoding: "utf8" });
  if (left.error) t.diagnostic(`pgrep is not here, so "nothing was left running" was not checked: ${left.error.code}`);
  else assert.equal((left.stdout ?? "").trim(), "", `the check left a program running:\n${left.stdout}`);
});

test("a token pasted into a marketplace value is never printed back", (t) => {
  const ctx = fixture(t);
  for (const value of ["https://joe:ghp_colonform@github.com/acme/skills.git", "https://ghp_bareform@github.com/acme/skills.git", "https://github.com/acme/skills.git?token=ghp_queryform"]) {
    const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", value], { network: true });
    assert.equal(r.code, 2, r.out);
    assert.doesNotMatch(r.out, /ghp_[a-z]+form/, `a token was printed back for ${value}:\n${r.out}`);
  }
});

test("a marketplace value that is neither a repository nor a folder is refused, with nothing checked", (t) => {
  const ctx = fixture(t);
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", "https://joe:ghp_notarealtoken@github.com/acme/skills.git"], { network: true });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /refused/);
  assert.match(r.out, /<credentials removed>/);
  assert.doesNotMatch(r.out, /ghp_notarealtoken/, "a token pasted into the value was printed back");
});

test("join stops before it changes anything when a folder it needs is blocked", (t) => {
  if (asRoot) return t.skip("running as root: an unwritable folder cannot be made");
  const ctx = fixture(t);
  const joined = join(ctx.home, "joined");
  mkdirSync(joined, { recursive: true });
  chmodSync(joined, 0o500);

  // A company skills repository join can read, with a stand-in Claude Code.
  const standin = join(ROOT, "scripts", "fixtures", "clients", "standin.mjs");
  writeFileSync(join(ctx.tools, "claude"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(standin)} claude "$@"\n`);
  chmodSync(join(ctx.tools, "claude"), 0o755);
  writeFileSync(join(ctx.repo, ".claude-plugin", "marketplace.json"), `${JSON.stringify({
    name: "acme-skills", owner: { name: "acme" },
    plugins: [{ name: "workflow", source: "./packs/base/plugins/workflow", description: "workflow", license: "MIT" }],
  }, null, 2)}\n`);
  mkdirSync(join(ctx.repo, "templates"), { recursive: true });
  writeFileSync(join(ctx.repo, "templates", "project-settings.json"), `${JSON.stringify({
    extraKnownMarketplaces: { "acme-skills": { source: { source: "github", repo: "acme/skills" }, autoUpdate: true } },
    enabledPlugins: { "workflow@acme-skills": true },
  }, null, 2)}\n`);
  const git = (...args) => spawnSync(toolPath("git"), ["-C", ctx.repo, ...args], {
    encoding: "utf8",
    env: { PATH: ctx.tools, HOME: ctx.home, ...GIT_ENV },
  });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "company skills");

  const keys = join(ctx.base, "keys");
  mkdirSync(keys, { recursive: true });
  spawnSync(toolPath("ssh-keygen"), ["-q", "-t", "ed25519", "-N", "", "-C", "a@example.invalid", "-f", join(keys, "k")], { encoding: "utf8" });
  const pub = readFileSync(join(keys, "k.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
  writeFileSync(join(keys, "allowed_signers"), `a@example.invalid namespaces="git" ${pub}\n`);

  const r = spawnSync(process.execPath, [join(ctx.repo, "scripts", "skilliton.mjs"), "join", "--company", "acme",
    "--signers", join(keys, "allowed_signers"), "--marketplace", ctx.repo, "--client", "claude-code", "--bin-dir", ctx.bin, "--apply"], {
    encoding: "utf8", cwd: ctx.base, timeout: 120000,
    env: {
      PATH: ctx.tools, HOME: ctx.home, LANG: "C.UTF-8", SKILLITON_SELF: "skilliton",
      SKILLITON_TRUST_DIR: join(ctx.home, "trust"), SKILLITON_JOIN_DIR: joined, SKILLITON_BACKUPS: join(ctx.home, "backups"),
      CLAUDE_CONFIG_DIR: join(ctx.home, "claude"), CODEX_HOME: join(ctx.home, "codex"),
      GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  assert.equal(r.status, 2, out); // refused, nothing written (docs/CONTRACTS.md section 6)
  assert.match(out, /Refused, and nothing was changed: this machine cannot be set up until/);
  assert.match(out, /joined/);
  const listing = spawnSync("find", [ctx.home, "-type", "f"], { encoding: "utf8" }).stdout;
  assert.doesNotMatch(listing, /acme\.json|allowed_signers/, `join wrote something before the checks passed:\n${listing}`);
  assert.doesNotMatch(spawnSync("find", [ctx.bin, "-type", "f"], { encoding: "utf8" }).stdout, /skilliton/, "join wrote the launcher before the checks passed");
});
