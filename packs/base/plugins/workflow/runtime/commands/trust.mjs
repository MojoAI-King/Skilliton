// commands/trust.mjs: `skilliton trust add | show | remove`, the release signers this machine trusts.
// The engine is lib/trust.mjs; the contract is docs/CONTRACTS.md section 13.

import { lstatSync, readFileSync, unlinkSync } from "node:fs";
import { Refused, backupFile, newStamp, parseArgs, refuse, say, selfCommand, tilde } from "../lib/core.mjs";
import {
  describeSigner, listTrusted, parseAllowedSigners, planTrustAdd, readTrustFile, trustDir, trustFilePath, validateCompany,
  writeTrustFile,
} from "../lib/trust.mjs";

export const help = `trust: record, show, or remove the release signers this machine trusts, one file per company.

  trust add --company <name> --signers <allowed_signers file> [--apply]
  trust show [--company <name>]
  trust remove --company <name> [--apply]

A company's trust is an SSH allowed_signers file (one signer per line: <principal> namespaces="git" <key type> <key>;
see ssh-keygen(1), ALLOWED SIGNERS) copied to $SKILLITON_TRUST_DIR/<name>.allowed_signers, by default
~/.config/skilliton/trust/. That folder must be outside every Git repository, so pulling a repository can never
change whom this machine trusts. release list and verify check release tags against it with git verify-tag; a tag
signed any other way is never approved.

add     checks every line (key type, key data, fingerprint) and refuses a private key, an invalid line, or a
        different file already trusted for that company (remove it first; changing trust is deliberate).
show    prints each trusted company's signers and fingerprints. Writes nothing.
remove  backs the file up under $SKILLITON_BACKUPS/trust/ (default ~/.claude/backups/skilliton/trust/), then deletes it.

add and remove preview by default and write only with --apply.
Exit codes: 0 complete; 1 (show) no company is trusted; 2 refused or invalid; 3 an operation failed.`;

function add(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["company", "signers"] }, "trust");
  if (o._.length) refuse(`trust add takes no plain arguments (got "${o._[0]}")`);
  if (o.company === undefined) refuse("trust add needs --company <name>");
  if (o.signers === undefined) refuse("trust add needs --signers <allowed_signers file>");
  const plan = planTrustAdd(o.company, o.signers);

  say(`skilliton trust add${o.apply ? "" : " (preview; nothing written)"}`);
  say(`company: ${o.company}`);
  say(`signers file: ${tilde(plan.source)} (sha256 ${plan.sha256.slice(0, 12)}), ${plan.parsed.signers.length} signer(s):`);
  for (const s of plan.parsed.signers) say(`  ${describeSigner(s)}`);
  for (const n of plan.parsed.notes) say(`  note: ${n}`);
  if (plan.present) { say(`${tilde(plan.dest)} already holds exactly this file; nothing to change.`); return 0; }
  if (!o.apply) {
    say(`would copy it to ${tilde(plan.dest)}`);
    say("Next: run the same command with --apply.");
    return 0;
  }
  writeTrustFile(plan);
  say(`copied to ${tilde(plan.dest)}`);
  say(`Next: ${selfCommand()} release list --company ${o.company}, or ${selfCommand()} verify --company ${o.company} --source <skills repo>`);
  return 0;
}

function show(argv) {
  const o = parseArgs(argv, { flags: [], options: ["company"] }, "trust");
  if (o._.length) refuse(`trust show takes no plain arguments (got "${o._[0]}")`);
  const dir = trustDir();
  let entries;
  if (o.company !== undefined) {
    validateCompany(o.company);
    entries = [{ company: o.company, path: trustFilePath(o.company) }];
  } else entries = listTrusted();
  say("skilliton trust show (writes nothing)");
  say(`trust folder: ${tilde(dir)}${process.env.SKILLITON_TRUST_DIR ? " (from SKILLITON_TRUST_DIR)" : ""}`);
  if (!entries.length) {
    say("no company is trusted on this machine, so release list and verify cannot approve anything");
    say(`Next: ${selfCommand()} trust add --company <name> --signers <allowed_signers file> --apply`);
    return 1;
  }
  let invalid = 0;
  for (const e of entries) {
    let t;
    try { t = readTrustFile(e.path, e.company); } catch (err) {
      if (!(err instanceof Refused)) throw err;
      if (o.company !== undefined) throw err;
      invalid++;
      say(`INVALID ${e.company}: ${err.message}`);
      continue;
    }
    say(`${t.company}  ${tilde(t.path)}  sha256 ${t.sha256.slice(0, 12)}  ${t.signers.length} signer(s)`);
    for (const s of t.signers) say(`  ${describeSigner(s)}`);
    for (const n of t.notes) say(`  note: ${n}`);
  }
  return invalid ? 2 : 0;
}

function remove(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["company"] }, "trust");
  if (o._.length) refuse(`trust remove takes no plain arguments (got "${o._[0]}")`);
  if (o.company === undefined) refuse("trust remove needs --company <name>");
  validateCompany(o.company);
  const path = trustFilePath(o.company);
  let st;
  try { st = lstatSync(path); } catch { refuse(`company "${o.company}" is not trusted on this machine (${tilde(path)} does not exist); nothing to remove`); }
  if (st.isSymbolicLink() || !st.isFile()) refuse(`${tilde(path)} is not a regular file; remove it by hand`);
  say(`skilliton trust remove${o.apply ? "" : " (preview; nothing written)"}`);
  say(`company: ${o.company} (${tilde(path)})`);
  const parsed = parseAllowedSigners(readFileSync(path, "utf8"));
  for (const s of parsed.signers) say(`  ${describeSigner(s)}`);
  if (parsed.problems.length) say("  (this file does not parse as an allowed_signers file)");
  if (!o.apply) {
    say(`would back it up, then remove ${tilde(path)}`);
    say("Next: run the same command with --apply.");
    return 0;
  }
  const backup = backupFile("trust", path, newStamp());
  say(`backed up to ${tilde(backup)}`);
  unlinkSync(path);
  say(`removed ${tilde(path)}; releases signed only by these signers are no longer approved on this machine`);
  return 0;
}

export async function run(argv) {
  const [sub, ...rest] = argv;
  if (sub === "add") return add(rest);
  if (sub === "show") return show(rest);
  if (sub === "remove") return remove(rest);
  refuse(`trust needs a subcommand: add, show or remove${sub ? ` (got "${sub}")` : ""}. See: ${selfCommand()} trust --help`);
}
