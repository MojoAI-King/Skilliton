// delivery: install or run the trusted delivery check for shared branches. Contract: docs/CONTRACTS.md section 14.
// The engine is ../lib/delivery.mjs; the plain-language guide is docs/DELIVERY.md in the company skills repository.

import { join } from "node:path";
import { PLUGIN_ROOT, parseArgs, refuse, say, selfCommand } from "../lib/core.mjs";
import { applyInstall, describeInstall, planInstall, runGate, runLocalCheck } from "../lib/delivery.mjs";

export const help = `delivery: trusted delivery checks for a shared branch (docs/DELIVERY.md).

  delivery install --bare <repo.git> --approvers <allowed_signers> [--runtime <bin/skilliton>] [--apply]
      Shows, and with --apply writes, the pre-receive hook of a shared bare repository, and records the approvers
      file and the runtime in that repository's git config (skilliton.approvers, skilliton.runtime). The runtime
      defaults to this plugin's bin/skilliton. Refuses to replace a pre-receive hook that install did not write, and
      refuses when core.hooksPath would stop git from running the hook.

  delivery gate --bare <repo.git>
      Run by the hook. Reads "<old> <new> <ref>" lines on standard input and accepts or rejects the push. For each
      update to a protected branch, in order: deletions and non-fast-forward updates are rejected; the policy is read
      from the branch's current tip, never from the pushed commits; each pushed commit that changes a policy path
      must carry an SSH signature from the approvers file; the pushed tip must keep a valid policy; the pushed tip is
      extracted with git archive into a temporary folder and compared with the commit; every check runs there with
      its timeout and a minimal environment. The first failure rejects the push with the check's name and the last
      20 lines of its output.

  delivery check [--repo <working repository>] [--ref <branch>] [--remote <name>] [--approvers <allowed_signers>]
      The same evaluation for the local HEAD as a push to <branch> (default: the current branch) on <remote>
      (default: origin), compared with the remote-tracking tip as last fetched. Nothing is pushed. Without
      --approvers, signatures on policy changes cannot be verified; the output says so and the exit code is 1.

Protected branches are the ones the policy on the repository's default branch lists. Until the default branch holds a
policy, the default branch alone is protected, and the push that creates it must contain .skilliton/delivery.json and
be signed by an approver. The policy format is .skilliton/delivery.json:
  { "schema": "skilliton.delivery/1", "protectedBranches": ["main"],
    "checks": [{ "name": "tests", "command": ["node", "--test"], "timeoutSeconds": 600 }],
    "policyPaths": [".skilliton/delivery.json", ".github/workflows/", ".github/CODEOWNERS", "CODEOWNERS"] }

Exit codes: 0 accepted (install: previewed or written); 1 rejected, or the check needs attention; 2 invalid or
refused, nothing written; 3 the operation failed (the gate rejects the push when it cannot finish).`;

const OPTIONS = {
  install: ["bare", "approvers", "runtime"],
  gate: ["bare"],
  check: ["repo", "ref", "remote", "approvers"],
};

async function readStdin() {
  if (process.stdin.isTTY) refuse(`delivery gate reads ref updates on standard input, as git's pre-receive hook provides them; to try a push by hand use: ${selfCommand()} delivery check`);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["bare", "approvers", "runtime", "repo", "ref", "remote"] }, "delivery");
  if (o.help) { say(help); return 0; }
  const [sub, ...extra] = o._;
  if (!sub) refuse(`delivery needs a subcommand: install, gate or check. Run: ${selfCommand()} delivery --help`);
  if (!Object.hasOwn(OPTIONS, sub)) refuse(`unknown delivery subcommand "${sub}" (install, gate or check). Run: ${selfCommand()} delivery --help`);
  if (extra.length) refuse(`delivery ${sub} takes no plain arguments (got "${extra[0]}")`);
  for (const key of ["bare", "approvers", "runtime", "repo", "ref", "remote"]) {
    if (o[key] !== undefined && !OPTIONS[sub].includes(key)) refuse(`--${key} does not apply to delivery ${sub}`);
  }
  if (o.apply && sub !== "install") refuse(`--apply does not apply to delivery ${sub}`);

  if (sub === "gate") {
    if (!o.bare) refuse("delivery gate needs --bare <repo.git>");
    return runGate({ bare: o.bare, input: await readStdin() });
  }

  if (sub === "check") {
    return runLocalCheck({ repo: o.repo, ref: o.ref, remote: o.remote ?? "origin", approvers: o.approvers });
  }

  const plan = planInstall({ bare: o.bare, approvers: o.approvers, runtime: o.runtime, defaultRuntime: join(PLUGIN_ROOT, "bin", "skilliton") });
  say(`delivery install for ${plan.bare}${o.apply ? "" : " (preview: nothing written; add --apply to write)"}`);
  for (const line of describeInstall(plan)) say(`  ${line}`);
  if (!o.apply) return 0;
  const { backup } = applyInstall(plan);
  if (backup) say(`backed up the previous hook to ${backup}`);
  say(`installed: pushes to ${plan.bare} now run the delivery gate${plan.hookAction === "unchanged" ? " (the hook was already current)" : ""}.`);
  return 0;
}
