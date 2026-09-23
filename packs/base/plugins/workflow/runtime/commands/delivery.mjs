// delivery: install or run the trusted delivery check for shared branches. Contract: docs/CONTRACTS.md section 14.
// The engine is ../lib/delivery.mjs; the plain-language guide is docs/DELIVERY.md in the company skills repository.

import { join } from "node:path";
import { PLUGIN_ROOT, parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import { runGate, runLocalCheck } from "../lib/delivery.mjs";
import { applyInstall, describeInstall, planInstall } from "../lib/delivery-install.mjs";
import { DRAFT_FILE, POLICY_FILE, applyConfirm, describePolicy, planConfirm } from "../lib/delivery-policy.mjs";
import { resolveGitRoot } from "../lib/prepare.mjs";

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

  delivery confirm [--dir <project>] [--apply]
      Shows, and with --apply moves, the draft policy prepare wrote (.skilliton/delivery.draft.json) to
      .skilliton/delivery.json. A draft is read from what the repository shows and is never run by any gate; the
      confirmed file is the policy, so commit it to the default branch like any policy change. Refuses when there is
      no draft, when the policy already exists, or when the draft is not a valid policy.

Protected branches are the ones the policy on the repository's default branch lists. Until the default branch holds a
policy, the default branch alone is protected, and the push that creates it must contain .skilliton/delivery.json and
be signed by an approver. The policy format is .skilliton/delivery.json:
  { "schema": "skilliton.delivery/1", "protectedBranches": ["main"],
    "checks": [{ "name": "tests", "command": ["node", "--test"], "timeoutSeconds": 600 }],
    "policyPaths": [".skilliton/delivery.json", ".github/workflows/", ".github/CODEOWNERS", "CODEOWNERS"] }
A change to a protected path also needs an approver's signed commit, and is refused before any check runs. The
optional "protectedPaths" lists them (a folder ends with "/", a file is matched exactly); without it, every file a
check command names at the current or the pushed tip, and .github/workflows/. A folder link above one is refused.

Exit codes: 0 accepted (install: previewed or written); 1 rejected, or the check needs attention; 2 invalid or
refused, nothing written; 3 the operation failed (the gate rejects the push when it cannot finish).`;

const OPTIONS = {
  install: ["bare", "approvers", "runtime"],
  gate: ["bare"],
  check: ["repo", "ref", "remote", "approvers"],
  confirm: ["dir"],
};

async function readStdin() {
  if (process.stdin.isTTY) refuse(`delivery gate reads ref updates on standard input, as git's pre-receive hook provides them; to try a push by hand use: ${selfCommand()} delivery check`);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["bare", "approvers", "runtime", "repo", "ref", "remote", "dir"] }, "delivery");
  if (o.help) { say(help); return 0; }
  const [sub, ...extra] = o._;
  if (!sub) refuse(`delivery needs a subcommand: install, gate, check or confirm. Run: ${selfCommand()} delivery --help`);
  if (!Object.hasOwn(OPTIONS, sub)) refuse(`unknown delivery subcommand "${sub}" (install, gate, check or confirm). Run: ${selfCommand()} delivery --help`);
  if (extra.length) refuse(`delivery ${sub} takes no plain arguments (got "${extra[0]}")`);
  for (const key of ["bare", "approvers", "runtime", "repo", "ref", "remote", "dir"]) {
    if (o[key] !== undefined && !OPTIONS[sub].includes(key)) refuse(`--${key} does not apply to delivery ${sub}`);
  }
  if (o.apply && sub !== "install" && sub !== "confirm") refuse(`--apply does not apply to delivery ${sub}`);

  if (sub === "confirm") {
    const { root } = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const plan = planConfirm(root);
    say(`delivery confirm (${o.apply ? "apply" : "preview"}): ${tilde(root)}`);
    say(`  draft ${DRAFT_FILE}, written by prepare from what the repository shows; never run until confirmed:`);
    for (const line of describePolicy(plan.policy)) say(`    ${line}`);
    if (!o.apply) { say(`Summary: nothing written; add --apply to move the draft to ${POLICY_FILE}.`); return 0; }
    applyConfirm(plan);
    say(`Summary: confirmed: ${DRAFT_FILE} moved to ${POLICY_FILE}. Commit it to the default branch; from then on skilliton gate runs its check(s), and where the delivery gate is installed a change to the policy needs an approver signature (docs/DELIVERY.md).`);
    return 0;
  }

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
