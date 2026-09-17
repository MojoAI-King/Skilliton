// lib.mjs: shared helpers for the end-to-end rehearsals in this folder. Node built-ins only.
//
// A rehearsal is a sequence of steps against disposable folders, synthetic projects and throwaway keys. Each step
// is PASS, FAIL or NOT RUN with the evidence that decided it. A rehearsal writes a sanitized summary to
// evidence/rehearsals/<date>-<name>/ only after the scrub check passes on it, and never records a step it did not run
// as passing.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI = join(REPO, "scripts", "skilliton.mjs");

export function parseFlags(argv, known) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    if (!Object.hasOwn(known, key)) { console.error(`unknown option ${a}; known: ${Object.keys(known).map((k) => `--${k}`).join(" ")}`); process.exit(2); }
    if (known[key] === "flag") out[key] = true;
    else { out[key] = argv[++i]; if (out[key] === undefined) { console.error(`${a} needs a value`); process.exit(2); } }
  }
  return out;
}

export function workspace(name) {
  return realpathSync(mkdtempSync(join(tmpdir(), `skilliton-rehearsal-${name}-`)));
}

// Run a program with an argument array (never a shell string). Returns { code, out, err, all }.
export function run(file, args = [], { cwd, env, input, timeoutMs = 300000 } = {}) {
  const r = spawnSync(file, args, { cwd, env: env ?? process.env, input, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const err = r.error ? `${r.stderr ?? ""}\n[spawn error: ${r.error.code ?? r.error.message}]` : r.stderr ?? "";
  return { code: r.status ?? (r.error ? 127 : 1), out: r.stdout ?? "", err, all: `${r.stdout ?? ""}${err}` };
}

export const skilliton = (args, opts = {}) => run(process.execPath, [CLI, ...args], opts);

export function git(cwd, args, opts = {}) { return run("git", args, { cwd, ...opts }); }

// An isolated git identity per repository: HOME points at an empty folder, so no global configuration (such as a
// person's signing or tag settings) leaks into the rehearsal.
export function isolatedEnv(ws, extra = {}) {
  const home = join(ws, "home");
  mkdirSync(home, { recursive: true });
  const env = { PATH: process.env.PATH, LANG: process.env.LANG ?? "C.UTF-8", HOME: home, TMPDIR: process.env.TMPDIR ?? tmpdir(), GIT_CONFIG_NOSYSTEM: "1", SKILLITON_TRUST_DIR: join(ws, "trust"), SKILLITON_BACKUPS: join(ws, "backups") };
  return { ...env, ...extra };
}

export function initRepo(dir, env, { name = "rehearsal", email = "rehearsal@example.invalid", branch = "main" } = {}) {
  mkdirSync(dir, { recursive: true });
  const steps = [["init", "-q", "-b", branch], ["config", "user.name", name], ["config", "user.email", email], ["config", "commit.gpgsign", "false"], ["config", "tag.gpgsign", "false"]];
  for (const s of steps) { const r = git(dir, s, { env }); if (r.code !== 0) throw new Error(`git ${s.join(" ")} failed: ${r.all}`); }
}

// A throwaway ed25519 key for SSH signing, plus its allowed_signers line.
export function sshKey(dir, principal) {
  mkdirSync(dir, { recursive: true });
  const key = join(dir, principal.replace(/[^a-z0-9]/gi, "-"));
  const r = run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", principal, "-f", key]);
  if (r.code !== 0) throw new Error(`ssh-keygen failed: ${r.all}`);
  const pub = readFileSync(`${key}.pub`, "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
  return { key, pub: `${key}.pub`, signersLine: `${principal} namespaces="git" ${pub}` };
}

export function useSigningKey(repo, env, key) {
  for (const s of [["config", "gpg.format", "ssh"], ["config", "user.signingkey", key.key]]) {
    const r = git(repo, s, { env });
    if (r.code !== 0) throw new Error(`git ${s.join(" ")} failed: ${r.all}`);
  }
}

// The client named by the flag, else by the environment variable, else found on PATH. A path that was given but does
// not run makes the client not found; it is never replaced by another binary, so the evidence names the client that ran.
export function findClient(explicit, envName, fallback) {
  const chosen = explicit || process.env[envName] || fallback;
  if (!chosen) return null;
  const r = run(chosen, ["--version"], { timeoutMs: 20000 });
  return r.code === 0 ? { path: chosen, version: r.out.trim().split("\n")[0] } : null;
}

// Replace machine-specific paths before anything is written to the repository.
export function sanitizer(ws) {
  const home = homedir();
  const pairs = [[ws, "<workspace>"], [REPO, "<skills-repo>"], [home, "<home>"]].filter(([p]) => p && p.length > 1).sort((a, b) => b[0].length - a[0].length);
  return (text) => pairs.reduce((t, [from, to]) => t.split(from).join(to), String(text));
}

export class Rehearsal {
  constructor(name, title) {
    this.name = name; this.title = title; this.steps = []; this.notes = []; this.stopped = null;
  }
  async step(id, label, fn, { requires = [] } = {}) {
    const missing = requires.filter((r) => !this.steps.some((s) => s.id === r && s.status === "PASS"));
    if (this.stopped || missing.length) {
      const why = this.stopped ? `an earlier required step failed (${this.stopped})` : `needs ${missing.join(", ")}`;
      this.steps.push({ id, label, status: "NOT RUN", detail: why });
      console.log(`NOT RUN ${id} ${label}: ${why}`);
      return null;
    }
    try {
      const result = await fn();
      // A step whose prerequisite is missing (a client binary, a logged-in isolated home) did not run; it says why.
      if (result?.notRun) {
        this.steps.push({ id, label, status: "NOT RUN", detail: result.notRun });
        console.log(`NOT RUN ${id} ${label}: ${result.notRun}`);
        if (result.critical) this.stopped = id;
        return null;
      }
      const ok = result?.ok !== false;
      this.steps.push({ id, label, status: ok ? "PASS" : "FAIL", detail: result?.detail ?? "" });
      console.log(`${ok ? "PASS" : "FAIL"} ${id} ${label}${result?.detail ? `: ${result.detail}` : ""}`);
      if (!ok && result?.critical) this.stopped = id;
      return result;
    } catch (e) {
      this.steps.push({ id, label, status: "FAIL", detail: `step crashed: ${e.message}` });
      console.log(`FAIL ${id} ${label}: step crashed: ${e.message}`);
      this.stopped = id;
      return null;
    }
  }
  note(text) { this.notes.push(text); }
  get failed() { return this.steps.some((s) => s.status !== "PASS"); }
  summary(meta) {
    const lines = [`# ${this.title}`, "", `Kind: Reference. Recorded ${new Date().toISOString().slice(0, 10)} by \`scripts/rehearsals/${this.name}.mjs\`. Disposable folders, synthetic projects and throwaway keys only.`, ""];
    for (const [k, v] of Object.entries(meta)) lines.push(`- **${k}:** ${v}`);
    lines.push("", "| Step | Result | Evidence |", "|---|---|---|");
    for (const s of this.steps) lines.push(`| ${s.id} ${s.label} | ${s.status} | ${String(s.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")} |`);
    if (this.notes.length) lines.push("", "## Notes", "", ...this.notes.map((n) => `- ${n}`));
    const pass = this.steps.filter((s) => s.status === "PASS").length;
    lines.push("", `Result: ${pass} of ${this.steps.length} steps passed${this.failed ? "; the rest are listed above with why" : ""}.`, "");
    return lines.join("\n");
  }
  // Writes the summary into the repository only when the scrub check passes on it; otherwise deletes it and says so.
  // A run never replaces recorded evidence: a second run on the same day gets the next free -run-<n> folder.
  writeEvidence(ws, meta) {
    const clean = sanitizer(ws);
    const base = join(REPO, "evidence", "rehearsals", `${new Date().toISOString().slice(0, 10)}-${this.name}`);
    let dir = base;
    for (let n = 2; existsSync(dir); n++) dir = `${base}-run-${n}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SUMMARY.md"), clean(this.summary(meta)));
    writeFileSync(join(dir, "steps.json"), clean(JSON.stringify({ rehearsal: this.name, steps: this.steps, notes: this.notes, meta }, null, 2)) + "\n");
    const scrub = run("bash", [join(REPO, "scripts", "scrub-check.sh"), "--path", dir]);
    if (scrub.code !== 0) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`EVIDENCE NOT WRITTEN: the scrub check did not pass on the summary (exit ${scrub.code}); fix the rehearsal output and run again.`);
      return null;
    }
    console.log(`evidence: ${dir.replace(REPO + "/", "")}`);
    return dir;
  }
}

export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
export const exists = existsSync;
