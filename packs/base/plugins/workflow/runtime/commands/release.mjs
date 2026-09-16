// commands/release.mjs: `skillgate release create | sign | withdraw | list`.
// The engine is lib/release.mjs; the contract is docs/CONTRACTS.md section 13 and releases/SCHEMA.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Refused, parseArgs, refuse, requireSkillsRepo, say, selfCommand, tilde } from "../lib/core.mjs";
import {
  RELEASE_TAG, manifestRel, openRepository, parseTagObject, planRelease, planSign, planWithdraw, readReleaseState,
  shellLine, short, tagExists,
} from "../lib/release.mjs";
import { sha256Hex } from "../lib/treehash.mjs";
import { resolveTrust, runGit } from "../lib/trust.mjs";

export const help = `release: create, sign, withdraw, or list company releases of this skills repository's plugins.

  release create --version <x.y.z> [--repo <skills repo>] [--evidence <file>]... [--apply]
  release sign <x.y.z> [--repo <skills repo>] [--apply]
  release withdraw <x.y.z> --reason "<text>" [--repo <skills repo>] [--apply]
  release list [--repo <skills repo>] [--company <name>]

create   builds releases/<x.y.z>.json: every plugin in .claude-plugin/marketplace.json with its version, path, the
         sha256 of every file and a tree hash; the project layout; the migrations; and each --evidence file (committed,
         inside the repository) with its sha256. It refuses, writing nothing, when a plugin folder has uncommitted,
         untracked or ignored files, the version already has a manifest or tag, a plugin path escapes the repository
         (.., absolute, or through a symbolic link), or a plugin's .claude-plugin and .codex-plugin versions disagree.
sign     checks that the manifest is committed and valid and that every plugin folder still matches it, then runs
         git tag -s skillgate-release/<x.y.z> with the message "skillgate release <x.y.z>" and the line
         "manifest-sha256: <hex>". Git signs with your own configured SSH key (gpg.format ssh); Skillgate never passes
         a key. Approval is that signed tag, checked against each machine's trust file.
withdraw runs git tag -s skillgate-withdrawn/<x.y.z> on the approved commit with the line "reason: <text>". Verify
         then reports installed copies of that release as WITHDRAWN; withdrawal does not disable or remove them.
list     shows every version: approved (its tag verifies against the trust file named by --company, or the only one
         configured, and the manifest matches the signed hash), unapproved (why), and withdrawn. Writes nothing.

create, sign and withdraw preview by default and write or tag only with --apply. --repo defaults to the skills
repository this copy of skillgate runs from. Tags are not pushed; that stays your step.
Exit codes: 0 complete; 1 a tag was created but is not SSH-signed; 2 refused or invalid (for list: trust is not
configured, or a tag or manifest does not check out); 3 an operation failed.`;

const repoOption = (o) => o.repo ?? requireSkillsRepo("pass --repo <skills repo>");

// Collects every --name <value> (and --name=<value>), which parseArgs allows only once.
function takeRepeated(argv, name) {
  const values = [], rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) {
      const v = argv[i + 1];
      if (v === undefined || v === "" || v.startsWith("--")) refuse(`--${name} needs a value`);
      values.push(v);
      i++;
    } else if (a.startsWith(`--${name}=`)) {
      const v = a.slice(name.length + 3);
      if (!v) refuse(`--${name} needs a value`);
      values.push(v);
    } else rest.push(a);
  }
  return { values, rest };
}

async function create(argv) {
  const { values: evidence, rest } = takeRepeated(argv, "evidence");
  const o = parseArgs(rest, { flags: ["apply"], options: ["version", "repo"] }, "release");
  if (o._.length) refuse(`release create takes no plain arguments (got "${o._[0]}"); give the version as --version <x.y.z>`);
  if (o.version === undefined) refuse("release create needs --version <x.y.z>");
  const plan = await planRelease({ repoInput: repoOption(o), version: o.version, evidence });
  const m = plan.manifest;
  say(`skillgate release create ${m.release}${o.apply ? "" : " (preview; nothing written)"}`);
  say(`repository: ${tilde(plan.repo)} at commit ${short(plan.head)}`);
  say(`marketplace: ${m.marketplace} (${m.components.length} plugin(s))`);
  const width = Math.max(...m.components.map((c) => c.name.length));
  for (const c of m.components) say(`  ${c.name.padEnd(width)}  ${c.version}  ${c.path}  ${c.files.length} file(s)  treeSha256 ${c.treeSha256}`);
  say(`project layout: ${m.projectLayout}`);
  say(`migrations: ${m.migrations.length ? m.migrations.join(", ") : "none recorded"}`);
  say(`evidence: ${m.evidence.length ? `${m.evidence.length} file(s)` : "none given"}`);
  for (const e of m.evidence) say(`  ${e.kind}  ${e.path}  sha256 ${e.sha256}`);
  const codex = m.clients.codex;
  say(`clients: claude-code marketplace ${m.clients["claude-code"].marketplace}; codex ${codex.marketplace ? `marketplace ${codex.marketplace} (${codex.plugins.length} plugin(s))` : `not recorded (${codex.note})`}`);
  for (const n of m.notes) say(`note: ${n}`);
  if (!o.apply) {
    say(`would write ${plan.rel}`);
    say(`Next: run the same command with --apply, commit ${plan.rel}, then run release sign ${m.release}.`);
    return 0;
  }
  mkdirSync(join(plan.repo, "releases"), { recursive: true });
  writeFileSync(join(plan.repo, plan.rel), plan.text, { flag: "wx" });
  say(`wrote ${plan.rel} (manifest-sha256 ${sha256Hex(Buffer.from(plan.text, "utf8"))})`);
  say(`Next: commit ${plan.rel}, then run release sign ${m.release} --apply; git signs with your own key.`);
  return 0;
}

function confirmSigned(repo, tag) {
  const oid = runGit(repo, ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
  const raw = oid.ok ? runGit(repo, ["cat-file", "tag", oid.stdout.trim()], { buffer: true }) : null;
  const parsed = raw?.ok ? parseTagObject(raw.stdout) : null;
  return parsed !== null && !parsed.problem && parsed.signatureKind === "ssh" && parsed.signatureMarkers === 1 && parsed.signatureComplete;
}

function runTag(plan, verb) {
  const r = runGit(plan.repo, plan.args, { userFacing: true, timeoutMs: 600000 });
  if (!r.ok) {
    const exists = tagExists(plan.repo, plan.tag);
    throw new Error(`git tag -s failed (${r.failure}); ${exists ? `the tag ${plan.tag} exists anyway, so inspect it before relying on it` : "no tag was created"}`);
  }
  if (!confirmSigned(plan.repo, plan.tag)) {
    say(`WARNING: ${plan.tag} was created but does not carry an SSH signature, so it will never ${verb}. Delete it (git tag -d ${plan.tag}) and check your signing configuration.`);
    return 1;
  }
  return 0;
}

function sign(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["repo"] }, "release");
  if (o._.length !== 1) refuse("release sign needs exactly one version: release sign <x.y.z>");
  const version = o._[0];
  const plan = planSign(repoOption(o), version);
  say(`skillgate release sign ${version}${o.apply ? "" : " (preview; nothing tagged)"}`);
  say(`repository: ${tilde(plan.repo)}`);
  say(`manifest: ${manifestRel(version)} at commit ${short(plan.head)}, manifest-sha256 ${plan.manifestSha256}`);
  say("checked: the manifest is committed and valid, the version has no tag yet, and every plugin folder still matches the manifest");
  say(`command: git ${shellLine(plan.args)}`);
  if (!o.apply) { say("Next: run the same command with --apply; git signs with your own configured SSH key."); return 0; }
  const code = runTag(plan, "be approved");
  if (code) return code;
  say(`created ${plan.tag} on commit ${short(plan.head)}, signed with SSH`);
  say(`Next: confirm it verifies with release list --company <name>, then publish it with git push origin ${plan.tag}`);
  return 0;
}

function withdraw(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["repo", "reason"] }, "release");
  if (o._.length !== 1) refuse("release withdraw needs exactly one version: release withdraw <x.y.z> --reason \"<text>\"");
  const version = o._[0];
  const plan = planWithdraw(repoOption(o), version, o.reason);
  say(`skillgate release withdraw ${version}${o.apply ? "" : " (preview; nothing tagged)"}`);
  say(`repository: ${tilde(plan.repo)}`);
  say(`withdraws: ${RELEASE_TAG}${version} (commit ${short(plan.target)})`);
  say(`reason: ${plan.reason}`);
  say(`command: git ${shellLine(plan.args)}`);
  say("Withdrawal makes verify report installed copies as WITHDRAWN; it does not disable, remove or roll back anything already installed.");
  if (!o.apply) { say("Next: run the same command with --apply; git signs with your own configured SSH key."); return 0; }
  const code = runTag(plan, "count as a withdrawal");
  if (code) return code;
  say(`created ${plan.tag}, signed with SSH`);
  say(`Next: publish it with git push origin ${plan.tag}`);
  return 0;
}

function describeVersion(v) {
  const parts = [];
  const signer = (t) => (t.signer ? `${t.signer.principal} (${t.signer.keyType} ${t.signer.fingerprint})` : "an unknown signer");
  if (v.state === "approved") {
    parts.push(`signed by ${signer(v.approval)}; manifest-sha256 ${short(v.manifestSha256)}; commit ${short(v.approval.commit)}`);
  } else if (v.state === "withdrawn") {
    parts.push(`withdrawn${v.withdrawal.date ? ` ${v.withdrawal.date}` : ""} by ${signer(v.withdrawal)}: ${v.withdrawal.withdrawReason}`);
    parts.push(v.manifest ? "it had been approved" : "it had no approved manifest");
  } else if (!v.approval) {
    parts.push(`${v.manifestFile ? `${v.manifestFile} exists, but there is` : "there is"} no ${RELEASE_TAG}${v.version} tag`);
  } else if (!v.approval.verified) {
    parts.push(`${v.approval.tag} ${v.approval.unchecked ? "was not checked" : "does not verify"}: ${v.approval.reason}`);
  } else {
    parts.push(`${v.approval.tag} verifies, but its manifest does not check out: ${v.manifestProblems[0] ?? "unknown problem"}`);
  }
  if (v.withdrawal && !v.withdrawal.verified) parts.push(`${v.withdrawal.tag} ${v.withdrawal.unchecked ? "was not checked" : "does not verify"}: ${v.withdrawal.reason}`);
  return parts.join("; ");
}

function list(argv) {
  const o = parseArgs(argv, { flags: [], options: ["repo", "company"] }, "release");
  if (o._.length) refuse(`release list takes no plain arguments (got "${o._[0]}")`);
  const { dir: repo } = openRepository(repoOption(o));
  let trust = null, trustProblem = null;
  try { trust = resolveTrust(o.company); } catch (e) {
    if (!(e instanceof Refused)) throw e;
    trustProblem = e.message;
  }
  const state = readReleaseState(repo, trust);
  say("skillgate release list (writes nothing)");
  say(`repository: ${tilde(repo)}`);
  say(trust ? `trust: company ${trust.company}${trust.inferred ? " (the only company configured)" : ""}, ${tilde(trust.path)}, ${trust.signers.length} signer(s)` : `trust: NOT CONFIGURED (${trustProblem})`);
  for (const n of state.notes) say(`note: ${n}`);
  if (!state.versions.length) say("no release manifests or release tags were found");
  for (const v of state.versions) say(`${v.state.padEnd(12)}${v.version.padEnd(12)}${describeVersion(v)}`);
  for (const p of state.problems) say(`problem: ${p}`);
  const count = (s) => state.versions.filter((v) => v.state === s).length;
  const counts = `${count("approved")} approved, ${count("unapproved")} unapproved, ${count("withdrawn")} withdrawn`;
  if (trustProblem) {
    say(`Summary: ${counts}. Signatures were not checked because trust is not configured, so nothing here can be taken as approved.`);
    return 2;
  }
  if (state.problems.length) {
    say(`Summary: ${counts}. ${state.problems.length} tag(s) or manifest(s) do not check out (listed above); a version is approved only when its SSH-signed tag verifies against the trust file and its manifest matches the signed hash.`);
    return 2;
  }
  say(`Summary: ${counts}.`);
  return 0;
}

export async function run(argv) {
  const [sub, ...rest] = argv;
  if (sub === "create") return create(rest);
  if (sub === "sign") return sign(rest);
  if (sub === "withdraw") return withdraw(rest);
  if (sub === "list") return list(rest);
  refuse(`release needs a subcommand: create, sign, withdraw or list${sub ? ` (got "${sub}")` : ""}. See: ${selfCommand()} release --help`);
}
