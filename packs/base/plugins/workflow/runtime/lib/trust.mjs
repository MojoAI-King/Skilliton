// trust.mjs: which release signers this machine trusts, and checking a signed tag against them
// (docs/CONTRACTS.md section 13).
//
// Trust is one SSH allowed_signers file per company, copied to $SKILLGATE_TRUST_DIR/<company>.allowed_signers
// (default ~/.config/skillgate/trust), outside every repository, so pulling a repository can never change whom a
// machine trusts. A tag is verified only when all of these hold:
//   1. the tag object carries an SSH signature (checked by the caller from the raw object; a tag signed any other way
//      is not verifiable here, even if some other keyring would accept it);
//   2. `git verify-tag` with gpg.ssh.allowedSignersFile set to the company file exits 0; and
//   3. its output names the principal that matched ("Good "git" signature for <principal> ..."). Measured with git
//      2.51 and OpenSSH: a key missing from the file still prints `Good "git" signature with ...` (no principal)
//      and exits 1, so the word "Good" alone proves nothing.
//
// Node built-ins only; shells out to git only, with argument arrays. Nothing here imports from outside the plugin.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { refuse, selfCommand, tilde, validateName } from "./core.mjs";

export const TRUST_SUFFIX = ".allowed_signers";
export const MAX_TRUST_BYTES = 64 * 1024;

// ---------- git ----------

// Variables that would point git at a different repository than the one named with -C.
const REPOSITORY_OVERRIDES = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE", "GIT_COMMON_DIR", "GIT_PREFIX"];

// Reads ignore refs/replace, so the object read is the object stored (a replacement could otherwise stand in for a
// manifest or a tag), and run without prompts and in the C locale, so messages parse the same everywhere.
export function gitEnv({ userFacing = false } = {}) {
  const env = { ...process.env };
  for (const name of REPOSITORY_OVERRIDES) delete env[name];
  if (!userFacing) { env.GIT_TERMINAL_PROMPT = "0"; env.LC_ALL = "C"; env.GIT_NO_REPLACE_OBJECTS = "1"; }
  return env;
}

// Runs git with an argument array. Never throws for git's own failure; `notFound` says git is not installed.
export function runGit(repo, args, { buffer = false, timeoutMs = 60000, userFacing = false } = {}) {
  const r = spawnSync("git", repo ? ["-C", repo, ...args] : args, {
    encoding: buffer ? "buffer" : "utf8",
    env: gitEnv({ userFacing }),
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    stdio: userFacing ? ["inherit", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
  const notFound = r.error?.code === "ENOENT";
  const failure = r.error ? (notFound ? "git was not found on PATH" : r.error.code === "ETIMEDOUT" ? `timed out after ${timeoutMs / 1000}s` : r.error.message)
    : r.status !== 0 ? `exit ${r.status ?? "by signal " + r.signal}` : null;
  const stderr = r.stderr == null ? "" : Buffer.isBuffer(r.stderr) ? r.stderr.toString("utf8") : r.stderr;
  return { ok: failure === null, status: r.status, stdout: r.stdout ?? (buffer ? Buffer.alloc(0) : ""), stderr, failure, notFound };
}

export function requireGitAvailable() {
  const r = runGit(null, ["--version"], { timeoutMs: 20000 });
  if (r.notFound) refuse("git was not found on PATH; releases, trust and verification all use git. Install git, then run the command again. Nothing was written.");
  if (!r.ok) throw new Error(`git --version failed (${r.failure})`);
  return r.stdout.trim();
}

// ---------- trust files ----------

export function trustDir() {
  return resolve(process.env.SKILLGATE_TRUST_DIR || join(homedir(), ".config", "skillgate", "trust"));
}

export function validateCompany(company) {
  validateName(company, "--company");
}

export const trustFilePath = (company) => join(trustDir(), `${company}${TRUST_SUFFIX}`);

export function listTrusted() {
  const dir = trustDir();
  let names;
  try { names = readdirSync(dir); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return [];
    throw new Error(`the trust folder ${tilde(dir)} could not be read (${e.code ?? e.message})`);
  }
  return names.sort()
    .map((name) => ({ name, m: /^([a-z0-9][a-z0-9-]{0,63})\.allowed_signers$/.exec(name) }))
    .filter((x) => x.m)
    .map((x) => ({ company: x.m[1], path: join(dir, x.name) }));
}

// Is this folder (or its nearest existing parent) inside a Git work tree? true, false, or throws when git is missing.
export function insideGitWorkTree(dir) {
  let cursor = resolve(dir);
  while (!existsSync(cursor)) {
    const up = dirname(cursor);
    if (up === cursor) return false;
    cursor = up;
  }
  const r = runGit(cursor, ["rev-parse", "--is-inside-work-tree"], { timeoutMs: 20000 });
  if (r.notFound) refuse("git was not found on PATH, so Skillgate cannot confirm the trust folder is outside every repository; install git first. Nothing was written.");
  return r.ok && r.stdout.trim() === "true";
}

// ---------- allowed_signers ----------

const KEY_TYPES = new Set([
  "ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com",
]);

// Split on spaces and tabs outside double quotes; null when a quote is left open.
function tokenize(line) {
  const tokens = [];
  let current = "", quoted = false, started = false;
  for (const ch of line) {
    if (ch === "\"") { quoted = !quoted; current += ch; started = true; continue; }
    if (!quoted && (ch === " " || ch === "\t")) { if (started) { tokens.push(current); current = ""; started = false; } continue; }
    current += ch;
    started = true;
  }
  if (quoted) return null;
  if (started) tokens.push(current);
  return tokens;
}

// The fields of an SSH public key blob: length-prefixed strings that must use every byte. null when malformed.
function blobFields(blob) {
  const fields = [];
  let at = 0;
  while (at < blob.length) {
    if (blob.length - at < 4) return null;
    const n = blob.readUInt32BE(at);
    at += 4;
    if (n > blob.length - at) return null;
    fields.push(blob.subarray(at, at + n));
    at += n;
  }
  return fields;
}

// How many fields each key type's blob holds (RFC 4253, RFC 5656, RFC 8709, OpenSSH PROTOCOL.u2f), and the fixed
// size of an ed25519 key.
const FIELD_COUNTS = {
  "ssh-ed25519": 2, "sk-ssh-ed25519@openssh.com": 3, "ssh-rsa": 3,
  "ecdsa-sha2-nistp256": 3, "ecdsa-sha2-nistp384": 3, "ecdsa-sha2-nistp521": 3, "sk-ecdsa-sha2-nistp256@openssh.com": 4,
};

function keyBlobProblem(blob, keyType) {
  const fields = blobFields(blob);
  if (!fields || !fields.length) return "the key data is not a well-formed SSH public key";
  const inner = fields[0].toString("latin1");
  if (inner !== keyType) return `the key data says "${inner.slice(0, 40)}", but the line says "${keyType}"`;
  if (fields.length !== FIELD_COUNTS[keyType] || fields.slice(1).some((f) => f.length === 0)) return `the key data is not a complete ${keyType} public key`;
  if (keyType.includes("ed25519") && fields[1].length !== 32) return `the key data is not a complete ${keyType} public key`;
  return null;
}

// Parses an allowed_signers file (format: ssh-keygen(1), ALLOWED SIGNERS). Returns
// { signers: [{ line, principals, options, namespaces, keyType, fingerprint }], problems: [{ line, problem }], notes }.
export function parseAllowedSigners(text) {
  const signers = [], problems = [], notes = [];
  if (/PRIVATE KEY-----/.test(text)) {
    problems.push({ line: 0, problem: "this file holds a private key, not public keys. Never copy a private key; pass the allowed_signers file that lists the signers' public keys" });
    return { signers, problems, notes };
  }
  text.split("\n").forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) return;
    if (/[\x00-\x08\x0b-\x1f\x7f]/.test(line)) { problems.push({ line: lineNo, problem: "control characters" }); return; }
    const t = tokenize(line);
    if (!t || t.length < 3) { problems.push({ line: lineNo, problem: "expected <principals> [options] <key type> <base64 key>" }); return; }
    let at = 1, options = null;
    if (!KEY_TYPES.has(t[1])) { options = t[1]; at = 2; }
    const keyType = t[at], key = t[at + 1];
    if (!KEY_TYPES.has(keyType ?? "")) { problems.push({ line: lineNo, problem: `unknown or missing key type${keyType ? ` "${keyType.slice(0, 40)}"` : ""}` }); return; }
    if (!key || !/^[A-Za-z0-9+/]+={0,2}$/.test(key)) { problems.push({ line: lineNo, problem: "the key is missing or is not base64" }); return; }
    const blob = Buffer.from(key, "base64");
    if (blob.toString("base64").replace(/=+$/, "") !== key.replace(/=+$/, "")) { problems.push({ line: lineNo, problem: "the key is not valid base64" }); return; }
    const keyProblem = keyBlobProblem(blob, keyType);
    if (keyProblem) { problems.push({ line: lineNo, problem: keyProblem }); return; }
    const namespaces = options ? (/(?:^|,)namespaces="([^"]*)"/.exec(options)?.[1] ?? null) : null;
    const fingerprint = `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
    if (namespaces === null) notes.push(`line ${lineNo}: no namespaces="git" option, so this key is trusted for every signature namespace, not only Git`);
    else if (!namespaces.split(",").includes("git")) notes.push(`line ${lineNo}: namespaces="${namespaces}" does not include git, so this key cannot approve a release`);
    signers.push({ line: lineNo, principals: t[0], options, namespaces, keyType, fingerprint });
  });
  return { signers, problems, notes };
}

export function describeSigner(s) {
  return `${s.principals}  ${s.keyType}  ${s.fingerprint}${s.options ? `  ${s.options}` : ""}`;
}

// Reads and checks one trust file. Throws Refused when it is missing, a link, too large or invalid.
export function readTrustFile(path, company) {
  let st;
  try { st = lstatSync(path); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") refuse(`trust is not configured for company "${company}": ${tilde(path)} does not exist. Run: ${selfCommand()} trust add --company ${company} --signers <allowed_signers file> --apply`);
    throw e;
  }
  if (st.isSymbolicLink()) refuse(`the trust file ${tilde(path)} is a symbolic link; trust add never creates one, so it was not followed. Remove it and run trust add again.`);
  if (!st.isFile()) refuse(`the trust file ${tilde(path)} is not a regular file`);
  if (st.size > MAX_TRUST_BYTES) refuse(`the trust file ${tilde(path)} is larger than ${MAX_TRUST_BYTES / 1024} KB, which is not an allowed_signers file`);
  const bytes = readFileSync(path);
  const parsed = parseAllowedSigners(bytes.toString("utf8"));
  if (parsed.problems.length) refuse(`the trust file ${tilde(path)} is invalid: ${parsed.problems.map((p) => `${p.line ? `line ${p.line}: ` : ""}${p.problem}`).join("; ")}`);
  if (!parsed.signers.length) refuse(`the trust file ${tilde(path)} lists no signers, so nothing can be verified against it`);
  return { company, path, sha256: createHash("sha256").update(bytes).digest("hex"), ...parsed };
}

// The trust to verify with: the named company's, or the only one configured. Throws Refused otherwise.
export function resolveTrust(company) {
  if (company !== undefined) {
    validateCompany(company);
    return { ...readTrustFile(trustFilePath(company), company), inferred: false };
  }
  const all = listTrusted();
  if (!all.length) refuse(`trust is not configured: ${tilde(trustDir())} holds no <company>${TRUST_SUFFIX} file, so no release signature can be checked. Run: ${selfCommand()} trust add --company <name> --signers <allowed_signers file> --apply`);
  if (all.length > 1) refuse(`several companies are trusted on this machine (${all.map((t) => t.company).join(", ")}); pass --company <name> to choose one`);
  return { ...readTrustFile(all[0].path, all[0].company), inferred: true };
}

// ---------- signed tags ----------

// Checks a tag object's signature against a trust file. objectName should be the tag object id the caller parsed,
// so the object checked is the object read. Returns { verified, principal, keyType, fingerprint, reason, output }.
export function verifyTagSignature(repo, objectName, trustPath) {
  const r = runGit(repo, ["-c", `gpg.ssh.allowedSignersFile=${trustPath}`, "-c", "gpg.ssh.program=ssh-keygen", "verify-tag", objectName], { timeoutMs: 60000 });
  if (r.notFound) throw new Error("git was not found on PATH");
  const output = `${r.stdout}${r.stderr}`.trim();
  const good = /^Good "git" signature for (.+) with (\S+) key (SHA256:[A-Za-z0-9+/]+)\s*$/m.exec(output);
  const signer = good ? { principal: good[1], keyType: good[2], fingerprint: good[3] } : { principal: null, keyType: null, fingerprint: null };
  const verified = r.ok && good !== null;
  if (verified) return { verified: true, ...signer, reason: null, output };
  const untrusted = /^Good "git" signature with (\S+) key (SHA256:[A-Za-z0-9+/]+)/m.exec(output);
  let reason;
  if (untrusted) reason = `it is signed by a key the trust file does not list (${untrusted[1]} ${untrusted[2]})`;
  else if (/no signature found/i.test(output)) reason = "it has no signature";
  else reason = `git verify-tag did not accept it (${output.split("\n").filter(Boolean).pop() ?? r.failure ?? "no output"})`;
  return { verified: false, ...signer, reason, output };
}
