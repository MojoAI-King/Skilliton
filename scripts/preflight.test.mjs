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
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROGRAMS, redact } from "../packs/base/plugins/workflow/runtime/lib/preflight.mjs";

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

// The other half of the same question: a prepared project's settings file can put variables into a session's
// environment, so a configuration named there reaches git the same way one in .git/config does. Both routes are
// tried with the ssh trap, each with the positive control that proves the trap is armed. What the machine's own
// ~/.gitconfig says is followed on purpose, and is not what this tests; see lib/journal.mjs.
const SSH_TRAP = (marker) => `[url "ssh://example.invalid/x"]\n\tinsteadOf = https://github.com/\n[core]\n\tsshCommand = sh -c 'mkdir ${marker}' #\n`;
for (const route of [
  { name: "a configuration file named in the environment", vars: (file) => ({ GIT_CONFIG_GLOBAL: file }) },
  {
    name: "settings passed in the environment",
    vars: (file, marker) => ({ GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "url.ssh://example.invalid/x.insteadOf", GIT_CONFIG_VALUE_0: "https://github.com/", GIT_CONFIG_KEY_1: "core.sshCommand", GIT_CONFIG_VALUE_1: `sh -c 'mkdir ${marker}' #` }),
  },
]) {
  test(`${route.name} cannot make the check run a command`, (t) => {
    const ctx = fixture(t);
    const marker = join(ctx.base, "RAN");
    const file = join(ctx.base, "planted.gitconfig");
    writeFileSync(file, SSH_TRAP(marker));
    const planted = route.vars(file, marker);

    // The positive control: plain git with the same variables does run the command.
    const control = spawnSync(toolPath("git"), ["ls-remote", "--heads", "--", "https://github.com/acme/skills.git"], {
      cwd: ctx.base, encoding: "utf8", env: { PATH: ctx.tools, HOME: ctx.home, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", ...planted },
    });
    assert.equal(existsSync(marker), true, `the fixture did not make plain git run the command, so this case would prove nothing (git said: ${control.stderr?.trim().slice(0, 300)})`);
    rmSync(marker, { recursive: true, force: true });

    const r = spawnSync(process.execPath, [join(ctx.repo, "scripts", "skilliton.mjs"), "preflight", "--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", "acme/skills"], {
      encoding: "utf8", cwd: ctx.base, timeout: 120000,
      env: {
        PATH: ctx.tools, HOME: ctx.home, LANG: "C.UTF-8", SKILLITON_SELF: "skilliton", TMPDIR: ctx.base,
        SKILLITON_TRUST_DIR: join(ctx.home, "trust"), SKILLITON_JOIN_DIR: join(ctx.home, "joined"),
        SKILLITON_BACKUPS: join(ctx.home, "backups"), CLAUDE_CONFIG_DIR: join(ctx.home, "claude"), CODEX_HOME: join(ctx.home, "codex"),
        ...planted,
      },
    });
    assert.equal(existsSync(marker), false, `a configuration from the environment made the check run a command:\n${r.stdout}${r.stderr}`);
  });
}

// The third route into a git call: HOME, which chooses ~/.gitconfig, and GIT_ASKPASS, which names a program git
// runs to ask for a password (tried before any terminal prompt, so turning prompts off does not cover it). Both are
// variables a prepared project's settings file can put into a session, so neither may steer a call that reaches a
// network. The server that answers "who are you" runs in its own process, because the runtime's git calls are
// synchronous and a server in this process could never answer one. Nothing here leaves this machine.
async function askingServer(t, base) {
  const log = join(base, "requests.txt");
  const child = spawn(process.execPath, ["-e", `
    const { createServer } = require("node:http");
    const { appendFileSync } = require("node:fs");
    const server = createServer((req, res) => {
      appendFileSync(${JSON.stringify(log)}, req.url + "\\n");
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="git"' });
      res.end("no");
    });
    server.listen(0, "127.0.0.1", () => console.log(server.address().port));
  `], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill("SIGKILL"));
  const port = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("the local server did not say which port it is on")), 15000);
    child.stdout.once("data", (d) => { clearTimeout(timer); done(Number(String(d).trim())); });
  });
  return { port, asked: () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []) };
}

test("a home folder and an askpass program named in the environment cannot steer a git call", async (t) => {
  const ctx = fixture(t);
  const { port, asked } = await askingServer(t, ctx.base);
  const original = `http://127.0.0.1:${port}/original.git`;
  const redirected = `http://127.0.0.1:${port}/redirected.git`;

  const fakeHome = join(ctx.base, "planted-home");
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(join(fakeHome, ".gitconfig"), `[url "${redirected}"]\n\tinsteadOf = ${original}\n`);
  const marker = join(ctx.base, "ASKPASS-RAN");
  const askpass = join(ctx.base, "askpass.sh");
  writeFileSync(askpass, `#!/bin/sh\n: > ${JSON.stringify(marker)}\necho x\n`);
  chmodSync(askpass, 0o755);
  const planted = { HOME: fakeHome, GIT_ASKPASS: askpass, SSH_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0" };

  // The positive controls: plain git with those variables follows the planted configuration, and runs the program.
  const control = spawnSync(toolPath("git"), ["ls-remote", "--heads", "--", original], { cwd: ctx.base, encoding: "utf8", timeout: 30000, env: { PATH: ctx.tools, ...planted } });
  assert.ok(asked().some((u) => u.startsWith("/redirected.git")), `the planted home did not steer plain git, so this case would prove nothing (git said: ${control.stderr?.trim().slice(0, 200)}; asked ${JSON.stringify(asked())})`);
  assert.equal(existsSync(marker), true, `the planted askpass program did not run for plain git, so this case would prove nothing (git said: ${control.stderr?.trim().slice(0, 200)})`);
  const before = asked().length;
  rmSync(marker, { force: true });

  // The same address through the runtime's own git wrapper, with the same variables in the environment.
  const { runGit } = await import(pathToFileURL(join(ctx.repo, "packs/base/plugins/workflow/runtime/lib/trust.mjs")).href);
  const saved = { ...process.env };
  try {
    Object.assign(process.env, planted);
    runGit(null, ["ls-remote", "--heads", "--", original], { timeoutMs: 30000, pinHome: true, home: ctx.home, cwd: ctx.base });
  } finally {
    for (const k of Object.keys(planted)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  const after = asked().slice(before);
  assert.deepEqual(after.filter((u) => u.startsWith("/redirected.git")), [], `a home folder named in the environment steered the call: it asked for ${JSON.stringify(after)}`);
  assert.ok(after.some((u) => u.startsWith("/original.git")), `the call did not reach the address it was given (asked ${JSON.stringify(after)})`);
  assert.equal(existsSync(marker), false, "a program named in the environment as git's way of asking for a password was run");
});

// A proxy and a certificate are the other pair of variables that decide what answers a check about reaching a
// repository. The proxy is followed, because that is how a company machine is set up, so it is named in the line;
// the certificate is checked whatever the environment says, because a check that stops looking at who answered can
// be answered by anyone. The server is a real TLS server on this machine with a certificate nobody trusts.
test("a certificate check the environment asks to skip is still made, and a proxy is named in the line", async (t) => {
  const ctx = fixture(t);
  const openssl = toolPathOrNull("openssl");
  if (!openssl) return t.skip("openssl is not on PATH, so a certificate nobody trusts cannot be made here");
  const key = join(ctx.base, "key.pem"), cert = join(ctx.base, "cert.pem");
  const made = spawnSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert, "-days", "1", "-nodes", "-subj", "/CN=localhost"], { encoding: "utf8" });
  if (made.status !== 0) return t.skip(`openssl could not make a certificate here: ${made.stderr?.trim().slice(0, 120)}`);

  const child = spawn(process.execPath, ["-e", `
    const { createServer } = require("node:tls");
    const { readFileSync } = require("node:fs");
    const server = createServer({ key: readFileSync(${JSON.stringify(key)}), cert: readFileSync(${JSON.stringify(cert)}) }, (socket) => {
      socket.on("error", () => {});
      const pkt = (line) => (line.length + 5).toString(16).padStart(4, "0") + line + "\\n";
      const refs = "001e# service=git-upload-pack\\n0000" + pkt("1111111111111111111111111111111111111111 refs/heads/main\\u0000report-status") + "0000";
      socket.on("data", () => socket.end("HTTP/1.1 200 OK\\r\\nContent-Type: application/x-git-upload-pack-advertisement\\r\\nContent-Length: " + Buffer.byteLength(refs) + "\\r\\nConnection: close\\r\\n\\r\\n" + refs));
    });
    server.listen(0, "127.0.0.1", () => console.log(server.address().port));
  `], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill("SIGKILL"));
  const port = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("the local server did not say which port it is on")), 15000);
    child.stdout.once("data", (d) => { clearTimeout(timer); done(Number(String(d).trim())); });
  });
  const url = `https://127.0.0.1:${port}/acme/skills.git`;

  // The positive control: plain git with the variable set accepts the certificate and reads the repository.
  const control = spawnSync(toolPath("git"), ["ls-remote", "--heads", "--", url], { cwd: ctx.base, encoding: "utf8", timeout: 30000, env: { PATH: ctx.tools, HOME: ctx.home, GIT_SSL_NO_VERIFY: "1", GIT_TERMINAL_PROMPT: "0" } });
  assert.equal(control.status, 0, `the fixture did not make plain git accept the certificate, so this case would prove nothing (git said: ${control.stderr?.trim().slice(0, 200)})`);

  const { runGit } = await import(pathToFileURL(join(ctx.repo, "packs/base/plugins/workflow/runtime/lib/trust.mjs")).href);
  const saved = process.env.GIT_SSL_NO_VERIFY;
  let answer;
  try {
    process.env.GIT_SSL_NO_VERIFY = "1";
    answer = runGit(null, ["ls-remote", "--heads", "--", url], { timeoutMs: 30000, pinHome: true, home: ctx.home, cwd: ctx.base });
  } finally {
    if (saved === undefined) delete process.env.GIT_SSL_NO_VERIFY; else process.env.GIT_SSL_NO_VERIFY = saved;
  }
  assert.equal(answer.ok, false, "a certificate nobody trusts was accepted because the environment asked for it to be");
  assert.match(answer.stderr, /certificate/i, `the call failed for some other reason than the certificate: ${answer.stderr.slice(0, 200)}`);

  // And the proxy is named in the line a person reads, so an answer that came through one says so.
  const proxied = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", "acme/skills"], {
    network: true, env: { HTTPS_PROXY: "http://127.0.0.1:9", https_proxy: "http://127.0.0.1:9" },
  });
  assert.match(item(proxied.out, "github\\.com/acme/skills"), /https?_proxy is set in this session \(http:\/\/127\.0\.0\.1:9\)/i, proxied.out);
});
// The three pieces the calls above rest on, each measured on its own, because a fix with no test of its own is a
// fix the next change can remove without anything going red. Each of these was removed once, on a copy of the tree,
// and this file stayed green: that is what these cases are for.
test("the home a git call is pinned to comes from the system, not from HOME", async () => {
  const { gitEnvironment, realHome } = await import(pathToFileURL(join(ROOT, "packs/base/plugins/workflow/runtime/lib/journal.mjs")).href);
  const system = realHome();
  if (system.problem) return; // a container with no record for this user: the check says so, and there is nothing to compare
  const saved = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
  try {
    process.env.HOME = join(tmpdir(), "a-home-this-session-named");
    process.env.XDG_CONFIG_HOME = join(tmpdir(), "a-config-folder-this-session-named");
    const env = gitEnvironment({ pinHome: true });
    assert.equal(env.HOME, system.home, "a git call that reaches a network took its home folder from HOME");
    assert.notEqual(env.HOME, process.env.HOME, "the home folder in the environment was used, so pinning does nothing");
    assert.equal(env.XDG_CONFIG_HOME, undefined, "a configuration folder named in the session survived pinning");
    // And the other half: a local read is left alone, so a test that isolates itself with HOME still measures what it set up.
    assert.equal(gitEnvironment().HOME, process.env.HOME, "a local read had its home folder changed, which would make what a test measures depend on the machine it runs on");
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("a proxy is named by its address only, never by what is in front of the address", async () => {
  const { proxyAddress, proxyInUse } = await import(pathToFileURL(join(ROOT, "packs/base/plugins/workflow/runtime/lib/journal.mjs")).href);
  // Fabricated values, not anyone's: a proxy is often written with a password in it, with or without a scheme, and
  // this address is printed in a line the report tells the person to hand to whoever manages their machines.
  for (const [value, address] of [
    ["http://proxyuser:S3cretWinter2026@proxy.example:3128", "http://proxy.example:3128"],
    ["proxyuser:S3cretWinter2026@127.0.0.1:9", "127.0.0.1:9"],
    ["http://user:pa/ss@proxy.example:3128", "http://proxy.example:3128"],
    ["socks5://user:pw@host.example:1080", "socks5://host.example:1080"],
    ["https://proxy.example:443", "https://proxy.example:443"],
  ]) {
    assert.equal(proxyAddress(value), address);
    assert.doesNotMatch(proxyAddress(value), /S3cretWinter2026|:pw@|pa\/ss/, `a credential survived in ${value}`);
  }
  assert.deepEqual(Object.keys(proxyInUse({ HTTPS_PROXY: "http://u:p@h:1" })).sort(), ["name", "where"], "the value itself is carried out of proxyInUse, and a value on an object is a value something later prints");
});

test("the variables a project must not be able to hand a git call are taken out, each one named here", async () => {
  const { gitEnvironment } = await import(pathToFileURL(join(ROOT, "packs/base/plugins/workflow/runtime/lib/journal.mjs")).href);
  // Written out rather than read from the runtime's own list: a test that walks the list it is checking passes just
  // as happily when the list gets shorter, which is how five of these were once removed with nothing going red.
  const always = [
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE",
    "GIT_CONFIG", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0",
    "GIT_PROXY_COMMAND", "GIT_SSH_COMMAND", "GIT_SSH", "GIT_ALLOW_PROTOCOL", "GIT_EXTERNAL_DIFF", "GIT_TEXTCONV", "GIT_EXEC_PATH",
    "GIT_ASKPASS", "SSH_ASKPASS", "SSH_ASKPASS_REQUIRE", "GIT_EDITOR", "GIT_SEQUENCE_EDITOR", "GIT_PAGER", "GIT_TEMPLATE_DIR",
    "GIT_SSL_NO_VERIFY", "GIT_SSL_CAINFO", "GIT_SSL_CAPATH", "GIT_SSL_CERT", "GIT_SSL_KEY", "GIT_SSL_VERSION", "GIT_SSL_CIPHER_LIST",
    "GIT_LITERAL_PATHSPECS", "GIT_ICASE_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS",
    "GIT_CURL_VERBOSE", "GIT_REDIRECT_STDIN", "GIT_REDIRECT_STDERR", "GIT_REDIRECT_STDOUT", "GIT_TRACE", "GIT_TRACE2", "GIT_TRACE_CURL", "GIT_TRACE_PERFORMANCE",
  ];
  // Taken out only on the call that reaches a network: on a local read they change what is printed, not what is
  // true, and a person debugging with GIT_TRACE should get their trace.
  const networkOnly = ["GIT_CONFIG_NOSYSTEM", "GIT_ATTR_NOSYSTEM"];
  const saved = { ...process.env };
  try {
    for (const name of [...always, ...networkOnly]) process.env[name] = "planted";
    const local = gitEnvironment();
    const network = gitEnvironment({ pinHome: true });
    for (const name of always) {
      assert.equal(local[name], undefined, `${name} survived a local git call`);
      assert.equal(network[name], undefined, `${name} survived a git call that reaches a network`);
    }
    for (const name of networkOnly) {
      assert.equal(network[name], undefined, `${name} survived a git call that reaches a network`);
      assert.equal(local[name], "planted", `${name} was taken out of a local read, where every test in this repository relies on it to isolate itself from the machine it runs on`);
    }
  } finally {
    for (const name of [...always, ...networkOnly]) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
});

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

// Redaction has two failure modes and both are real. A value that is printed back with a credential in it puts the
// credential in a terminal, a transcript and whatever the person pastes next. A value that is hidden when it is only
// a folder name leaves the person reading "<removed>" as the explanation of their own mistake. Each list below is
// the other one's control: the same function has to answer differently for the two of them.
const CREDENTIALS = [
  ["a token in the user field", "https://joe:ghp_colonform@github.com/acme/skills.git", /ghp_colonform/],
  ["a token as the whole user field", "https://ghp_bareform@github.com/acme/skills.git", /ghp_bareform/],
  ["a token in a query", "https://github.com/acme/skills.git?token=ghp_queryform", /ghp_queryform/],
  ["a token in a private_token query", "https://github.com/acme/skills.git?private_token=ghp_queryformtwo", /ghp_queryformtwo/], // skilliton-audit: allow known-token-prefix a planted token fixture for the URL credential check
  ["a token in a fragment", "https://github.com/acme/skills.git#token=ghp_fragmentform", /ghp_fragmentform/], // skilliton-audit: allow known-token-prefix a planted token fixture for the URL credential check
  ["a GitLab token", "glpat-" + "averylongtokenlikethisone", /averylongtokenlikethisone/],
  ["an npm token", "npm_" + "abcdefghijklmnopqrstuvwxyz012345", /abcdefghijklmnopqrstuvwxyz012345/],
  ["an Anthropic key", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz", /abcdefghijklmnopqrstuvwxyz/], // skilliton-audit: allow known-token-prefix a planted key fixture, letters of the alphabet in order
  ["a Google key", "AIza" + "SyA1234567890abcdefghijklmnopqrstu", /AIzaSyA1234567890/],
  ["an AWS key id", "AKIAIOSFODNN7EXAMPLE", /AKIAIOSFODNN7EXAMPLE/], // skilliton-audit: allow known-token-prefix a planted key id fixture, the vendor's own published example value
  ["a run with no lower-case letters", "ABCD1234EFGH5678IJKL9012MNOP", /ABCD1234EFGH5678IJKL9012MNOP/],
  ["a base64 secret", "aGVsbG8gd29ybGQgc2VjcmV0+/dmFsdWUxMjM=", /dmFsdWUxMjM/],
  ["a base64 secret inside a path", "./x/aGVsbG8gd29ybGQgc2VjcmV0dmFsdWUxMjM=", /c2VjcmV0dmFsdWUxMjM/],
  ["a secret inside a path", "/opt/keys/5f4dcc3b5aa765d61d8327deb882cf99", /5f4dcc3b5aa765d61d8327deb882cf99/],
  ["a weak prefix with a random tail", "sk_live_abc123def456", /abc123def456/],
  ["a pat prefix with a random tail", "pat_abcdef123456", /abcdef123456/],
  ["a short key with a random tail", "sk-abc123def456gh", /abc123def456gh/], // skilliton-audit: allow known-token-prefix a planted short-key fixture
  ["a long run of lower-case letters and digits", "abcdefghijklmnopqrstuvwx2026", /abcdefghijklmnopqrstuvwx2026/],
  ["a signed token", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", /dBjftJeZ4CVP/], // skilliton-audit: allow json-web-token a planted signed token fixture, a published example value
  ["a base64url secret, which hyphens and underscores do not break", "k7Qx-Zr9pLm2_Tn4Wv6Yb8Cd-Ef1Gh3Ij5Kl7Mn9Op", /Zr9pLm2/],
  ["a secret written in chunks", "aB3d-fG7h-jK2m-nP9q-rS4t-uV6w", /jK2m-nP9q/],
  ["a secret of letters only", "deadbeefdeadbeefdeadbeefdeadbeef", /deadbeefdeadbeefdeadbeefdeadbeef/],
  ["a secret of digits only", "12345678901234567890123456789012", /12345678901234567890123456789012/],
  ["an identifier used as a key", "550e8400-e29b-41d4-a716-446655440000", /446655440000/],
  ["a key that names its environment", "rk_live_51H8xYzAbCdEfGhIjKlMnOp", /51H8xYzAbCdEfGhIjKlMnOp/],
  ["a twenty-character key", "Xk3mQ9pZr2vTn8Lw4Bd7", /Xk3mQ9pZr2vTn8Lw4Bd7/],
  ["a short base64 value with its padding", "dXNlcjpwYXNzd29yZA==", /dXNlcjpwYXNzd29yZA/],
];
const ORDINARY = [
  "pat-experiments-2026-09",
  "sk-inventory-rewrite", // skilliton-audit: allow known-token-prefix a folder name that is not a credential, the control for this check
  "https://github.com/acmecorp/skilliton2026",
  "github.com/acmecorp/skilliton2026",
  "https://ghe.acme.example/acmecorp/skilliton2026",
  "repos/skilliton2026/packs",
  "clones/Skilliton2026Marketplace",
  "acmecorporation//skilliton2026",
  "acme/skills",
  "~/clones/skills-2026-09-17",
  "./a-very-long-folder-name-with-2026-in-it",
  "/opt/clones/a-clone-of-the-skills-repository-2026",
  "C:\\Users\\First Last\\skills",
  "https://github.com/acme/skills.git",
  "clones/ACMESkillsMarketplace2026",
  "clones/SkillitonMarketplace2026v2",
  "clones/skillitonMarketplaceClone2026",
  "srv/pat_workspace2026/repo",
  "token-driven-workflow2026",
  "SKILLITON-2026-REPORT-ARCHIVE",
  "/opt/clones/acme-skills-backup-20260917",
  "feature-add-preflight-check-12345",
  "/srv/git/INFRASTRUCTURE-MIGRATION-2026",
  "/opt/app_test_fixtures/skills",
  "/srv/internationalization/repo",
  "/opt/infrastructureprovisioning/skills",
  "acme/institutionalization",
];

test("a token pasted into a marketplace value is never printed back", () => {
  for (const [what, value, secret] of CREDENTIALS) {
    const shown = redact(value);
    assert.doesNotMatch(shown, secret, `${what} survived redaction: ${shown}`);
  }
});

test("an ordinary name is printed back as it was typed, so the message can be read", () => {
  for (const value of ORDINARY) {
    assert.equal(redact(value), value, `redaction changed a value that carries no credential, so the refusal would not name what was typed`);
  }
});

test("the refusal a person actually sees carries no token", (t) => {
  const ctx = fixture(t);
  for (const [what, value, secret] of CREDENTIALS.slice(0, 6)) {
    const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", value], { network: true });
    assert.equal(r.code, 2, r.out);
    assert.doesNotMatch(r.out, secret, `${what} was printed back by the command:\n${r.out}`);
  }
});

test("a marketplace value that is neither a repository nor a folder is refused, with nothing checked", (t) => {
  const ctx = fixture(t);
  const r = preflight(ctx, ["--client", "claude-code", "--bin-dir", ctx.bin, "--marketplace", "https://joe:ghp_notarealtoken@github.com/acme/skills.git"], { network: true }); // skilliton-audit: allow known-token-prefix a planted token in a marketplace URL, the input to the redaction test
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /refused/);
  assert.match(r.out, /<credentials removed>/);
  assert.doesNotMatch(r.out, /ghp_notarealtoken/, "a token pasted into the value was printed back"); // skilliton-audit: allow known-token-prefix the assertion that the planted token is not printed back
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
