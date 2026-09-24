// delivery-policy.mjs: what a delivery policy is, and nothing about running one.
//
// This half was taken out of lib/delivery.mjs, which had reached the ceiling scripts/lint.test.mjs holds it to. The
// split is not arbitrary: everything here decides whether a policy is well formed, and reads or writes the two files
// that hold one. Nothing here starts a program, touches a git repository or makes a gate decision. That is the other
// file's work, and keeping the two apart means the format can be read without reading the gate.
//
// The contract is docs/CONTRACTS.md section 14; the plain-language guide is docs/DELIVERY.md.

import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPlainObject, linkedWriteProblem, refuse } from "./core.mjs";
import { LEGACY_POLICY_FILE, LEGACY_POLICY_SCHEMA } from "./legacy-names.mjs";

export const POLICY_FILE = ".skilliton/delivery.json";
export const DRAFT_FILE = ".skilliton/delivery.draft.json";
export const POLICY_SCHEMA = "skilliton.delivery/1";
export const DEFAULT_TIMEOUT_SECONDS = 600;
const MAX_TIMEOUT_SECONDS = 86400;
const POLICY_KEYS = ["schema", "protectedBranches", "checks", "policyPaths", "protectedPaths", "audit"];
const AUDIT_KEYS = ["enabled"];
const CHECK_KEYS = ["name", "command", "timeoutSeconds"];
const CHECK_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._:+/-]{0,63}$/;

// ---------- policy ----------

// A plain branch name as a policy lists it: "main", "release/2.x". No "refs/" prefix, wildcards or spaces.
export function validBranchName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 200) return false;
  if (name === "HEAD" || name === "@" || name.startsWith("refs/") || name.startsWith("-")) return false;
  if (name.startsWith("/") || name.endsWith("/") || name.endsWith(".") || name.includes("..") || name.includes("@{")) return false;
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(name)) return false;
  return name.split("/").every((part) => part.length > 0 && !part.startsWith(".") && !part.endsWith(".lock"));
}

// A policy path: a repository-relative file path, or a folder when it ends with "/".
function validPolicyPath(entry) {
  if (typeof entry !== "string" || entry.length === 0 || entry.length > 400) return false;
  if (entry.startsWith("/") || entry.includes("\\") || /[\x00-\x1f\x7f]/.test(entry)) return false;
  const body = entry.endsWith("/") ? entry.slice(0, -1) : entry;
  return body.length > 0 && body.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

// The policy entry that covers a changed path, or null. An entry covers its exact path and everything below it.
export function matchPolicyPath(path, policyPaths) {
  for (const entry of policyPaths) {
    const body = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    if (path === body || path.startsWith(body + "/")) return entry;
  }
  return null;
}

// The policy file and schema this runtime writes, and the ones a shared branch may still carry from before the rename.
export const CURRENT_FORMAT = { file: POLICY_FILE, schema: POLICY_SCHEMA };
export const LEGACY_FORMAT = { file: LEGACY_POLICY_FILE, schema: LEGACY_POLICY_SCHEMA };

// Every problem with a parsed policy value, in plain words. An empty list means the policy is valid.
function policyProblems(value, { file = POLICY_FILE, schema = POLICY_SCHEMA } = CURRENT_FORMAT) {
  if (!isPlainObject(value)) return ["the file must hold a JSON object"];
  const problems = [];
  for (const key of Object.keys(value)) {
    if (!POLICY_KEYS.includes(key)) problems.push(`unknown key "${key}" (allowed: ${POLICY_KEYS.join(", ")})`);
  }
  if (value.schema !== schema) {
    problems.push(`"schema" must be "${schema}" (${value.schema === undefined ? "missing" : `found ${JSON.stringify(value.schema)}`})`);
  }

  if (!Array.isArray(value.protectedBranches)) problems.push(`"protectedBranches" must be an array of branch names, for example ["main"]`);
  else {
    const seen = new Set();
    value.protectedBranches.forEach((branch, i) => {
      if (!validBranchName(branch)) problems.push(`"protectedBranches"[${i}] ${JSON.stringify(branch)} is not a plain branch name (for example "main": no "refs/" prefix, spaces or wildcards)`);
      else if (seen.has(branch)) problems.push(`"protectedBranches" lists "${branch}" more than once`);
      seen.add(branch);
    });
  }

  if (!Array.isArray(value.checks)) problems.push(`"checks" must be an array of checks (it may be empty)`);
  else {
    const names = new Set();
    value.checks.forEach((check, i) => {
      const at = `"checks"[${i}]`;
      if (!isPlainObject(check)) { problems.push(`${at} must be an object with "name", "command" and optionally "timeoutSeconds"`); return; }
      for (const key of Object.keys(check)) {
        if (!CHECK_KEYS.includes(key)) problems.push(`${at} has unknown key "${key}" (allowed: ${CHECK_KEYS.join(", ")})`);
      }
      if (typeof check.name !== "string" || !CHECK_NAME_RE.test(check.name)) problems.push(`${at} "name" must be 1 to 64 letters, digits, spaces or . _ : + / - characters, starting with a letter or digit`);
      else if (names.has(check.name)) problems.push(`${at} "name" "${check.name}" is used by more than one check`);
      else names.add(check.name);
      if (!Array.isArray(check.command) || check.command.length === 0) problems.push(`${at} "command" must be a non-empty array of strings: an argument list, never a shell string`);
      else if (!check.command.every((arg) => typeof arg === "string" && !arg.includes("\0"))) problems.push(`${at} "command" must hold only strings`);
      else if (check.command[0].trim() === "") problems.push(`${at} "command"[0] must name the program to run`);
      if (check.timeoutSeconds !== undefined && !(Number.isInteger(check.timeoutSeconds) && check.timeoutSeconds >= 1 && check.timeoutSeconds <= MAX_TIMEOUT_SECONDS)) {
        problems.push(`${at} "timeoutSeconds" must be a whole number from 1 to ${MAX_TIMEOUT_SECONDS}`);
      }
    });
  }

  // The audit is on unless a policy turns it off, so a project that has never heard of it still gets the check. Turning
  // it off is a change to the policy file, which is itself a policy path, so it needs an approver's signature.
  if (value.audit !== undefined) {
    if (!isPlainObject(value.audit)) problems.push(`"audit" must be an object, for example {"enabled": false}`);
    else {
      for (const key of Object.keys(value.audit)) {
        if (!AUDIT_KEYS.includes(key)) problems.push(`"audit" has unknown key "${key}" (allowed: ${AUDIT_KEYS.join(", ")})`);
      }
      if (value.audit.enabled !== undefined && typeof value.audit.enabled !== "boolean") problems.push(`"audit" "enabled" must be true or false`);
    }
  }

  if (!Array.isArray(value.policyPaths) || value.policyPaths.length === 0) problems.push(`"policyPaths" must be a non-empty array of repository paths (a trailing "/" means a folder)`);
  else {
    value.policyPaths.forEach((entry, i) => {
      if (!validPolicyPath(entry)) problems.push(`"policyPaths"[${i}] ${JSON.stringify(entry)} is not a repository-relative path`);
    });
    if (value.policyPaths.every(validPolicyPath) && !matchPolicyPath(file, value.policyPaths)) {
      problems.push(`"policyPaths" must cover ${file} itself; otherwise a change to the policy would need no approval`);
    }
  }

  // Optional (lib/delivery-protect.mjs): the paths whose change needs an approver's signed commit because the checks
  // run them. Absent, the gate protects every file a check command names plus .github/workflows/.
  if (value.protectedPaths !== undefined) {
    if (!Array.isArray(value.protectedPaths)) {
      problems.push(`"protectedPaths" must be an array of repository paths (a trailing "/" means a folder; a file is matched exactly)`);
    } else {
      value.protectedPaths.forEach((entry, i) => {
        if (!validPolicyPath(entry)) problems.push(`"protectedPaths"[${i}] ${JSON.stringify(entry)} is not a repository-relative path`);
      });
    }
  }
  return problems;
}

// Parse policy text: { policy } with defaults filled in, or { problems }.
export function parsePolicyText(text, format = CURRENT_FORMAT) {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let value;
  try { value = JSON.parse(body); } catch (e) { return { problems: [`not valid JSON (${e.message})`] }; }
  const problems = policyProblems(value, format);
  if (problems.length) return { problems };
  return {
    policy: {
      schema: value.schema,
      protectedBranches: [...value.protectedBranches],
      checks: value.checks.map((c) => ({ name: c.name, command: [...c.command], timeoutSeconds: c.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS })),
      policyPaths: [...value.policyPaths],
      ...(value.protectedPaths !== undefined ? { protectedPaths: [...value.protectedPaths] } : {}),
      audit: { enabled: value.audit?.enabled ?? true },
    },
  };
}

// ---------- the draft prepare writes (docs/CONTRACTS.md section 14) ----------

// A draft is a policy prepare wrote from what the repository shows; no gate runs it. Confirming it moves the file to
// POLICY_FILE. planConfirm reads nothing but the two files: { root, draftPath, policyPath, draftText, policy }.
// Refused (nothing written) when there is no draft, when the policy already exists, or when the draft is not valid.
export function planConfirm(root) {
  const draftPath = join(root, DRAFT_FILE), policyPath = join(root, POLICY_FILE);
  if (existsSync(policyPath)) refuse(`${POLICY_FILE} already exists, so there is nothing to confirm${existsSync(draftPath) ? `; remove ${DRAFT_FILE} by hand if it is stale` : ""}. Nothing was written`);
  if (!existsSync(draftPath)) refuse(`no draft to confirm: ${DRAFT_FILE} does not exist (prepare writes it when a test command is detected). Write ${POLICY_FILE} by hand instead; the format is in: delivery --help. Nothing was written`);
  let text;
  try { text = readFileSync(draftPath, "utf8"); } catch (e) { refuse(`${DRAFT_FILE} could not be read (${e.code ?? e.message}). Nothing was written`); }
  const parsed = parsePolicyText(text);
  if (parsed.problems) refuse(`${DRAFT_FILE} is not a valid delivery policy, so it cannot be confirmed: ${parsed.problems.join("; ")}. Fix the draft, or remove it and write ${POLICY_FILE} by hand. Nothing was written`);
  return { root, draftPath, policyPath, draftText: text, policy: parsed.policy };
}

// The lines a preview prints for a policy: what would be protected, run and guarded.
export function describePolicy(policy) {
  const lines = [`protected branches: ${policy.protectedBranches.join(", ")}`];
  for (const c of policy.checks) lines.push(`check "${c.name}": ${c.command.join(" ")} (timeout ${c.timeoutSeconds}s)`);
  lines.push(`policy paths (a change needs an approver signature once the gate is installed): ${policy.policyPaths.join(", ")}`);
  const held = policy.protectedPaths ? (policy.protectedPaths.join(", ") || "none") : "every file a check command names, and .github/workflows/";
  lines.push(`protected paths (a change needs an approver's signed commit): ${held}`);
  lines.push(`audit: ${policy.audit.enabled ? "a finding in a file the push changed rejects the push" : "off; the gate does not read the changed files"}`);
  return lines;
}

// Moves the draft to the policy path. The policy is rechecked immediately before the move; a file that appeared
// meanwhile is never replaced.
export function applyConfirm(plan) {
  if (existsSync(plan.policyPath)) refuse(`${POLICY_FILE} appeared before the draft was confirmed; nothing was written`);
  const root = plan.policyPath.slice(0, plan.policyPath.length - POLICY_FILE.length) || ".";
  const linked = linkedWriteProblem(root, POLICY_FILE) ?? linkedWriteProblem(root, DRAFT_FILE);
  if (linked) refuse(`${linked}; nothing was written`);
  renameSync(plan.draftPath, plan.policyPath);
  return { policyPath: plan.policyPath };
}

const MAX_APPROVERS_BYTES = 1024 * 1024;

// ---------- approvers file (ssh allowed_signers format) ----------

const KEY_TYPE_RE = /^(ssh-ed25519|ssh-rsa|ssh-dss|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)$/; // skilliton-audit: allow known-token-prefix the names of SSH key types, which are public and head every allowed_signers line

function splitSignersLine(line) {
  const tokens = [];
  let current = "", quoted = false, started = false;
  for (const ch of line) {
    if (ch === "\"") { quoted = !quoted; current += ch; started = true; continue; }
    if (!quoted && (ch === " " || ch === "\t")) {
      if (started) { tokens.push(current); current = ""; started = false; }
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

// Problems with allowed_signers text: each line is "<principals> [options] <key type> <base64 key>".
function approversProblems(text) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
    return ["holds a private key; an approvers file lists public keys only, in ssh allowed_signers format"];
  }
  const problems = [];
  let keys = 0;
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) return;
    const tokens = splitSignersLine(line);
    const at = tokens.findIndex((token, k) => k > 0 && KEY_TYPE_RE.test(token));
    if (at < 1 || !/^[A-Za-z0-9+/]+={0,3}$/.test(tokens[at + 1] ?? "")) {
      problems.push(`line ${i + 1} is not "<principals> [options] <key type> <base64 public key>"`);
      return;
    }
    keys++;
  });
  if (!problems.length && keys === 0) problems.push("lists no keys");
  return problems;
}

// Read and check an approvers file: { text } or { problems } (each problem reads after the file's path).
export function readApproversFile(path) {
  let st;
  try { st = statSync(path); } catch (e) { return { problems: [e.code === "ENOENT" ? "does not exist" : `cannot be read (${e.code ?? e.message})`] }; }
  if (!st.isFile()) return { problems: ["is not a regular file"] };
  if (st.size > MAX_APPROVERS_BYTES) return { problems: [`is ${st.size} bytes; the limit is ${MAX_APPROVERS_BYTES}`] };
  let text;
  try { text = readFileSync(path, "utf8"); } catch (e) { return { problems: [`cannot be read (${e.code ?? e.message})`] }; }
  const problems = approversProblems(text);
  return problems.length ? { problems } : { text };
}
