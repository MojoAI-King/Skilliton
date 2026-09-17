# Trusted delivery checks

Kind: Living. How to make a shared branch accept a change only when the combined result passes the checks your team agreed on, and only when changes to those rules were approved. The contract is docs/CONTRACTS.md section 14; the code is `packs/base/plugins/workflow/runtime/lib/delivery.mjs`; the tests are `scripts/delivery.test.mjs`.

There are two ways to run the same policy:

| | Local gate (a shared bare repository) | GitHub adapter |
|---|---|---|
| Where it runs | the `pre-receive` hook of a bare repository your team pushes to | a GitHub Actions workflow on pull requests and merge queue groups |
| What it blocks | the push itself: a rejected push changes nothing | nothing by itself: branch protection must require it |
| Who approved a policy change | proved by SSH signatures checked against an approvers file | cannot be proved by the workflow; relies on code-owner review in branch protection |
| Status | exercised by `node scripts/delivery.test.mjs` with real pushes (see "What has been verified") | **not verified**: documented until a hosted rehearsal runs |

Neither one is the assistant guardrails hook, and neither is a security or compliance verdict. They decide whether a change reaches a shared branch.

## 1. The policy file

Commit `.skilliton/delivery.json` to each protected branch:

```json
{
  "schema": "skilliton.delivery/1",
  "protectedBranches": ["main"],
  "checks": [
    { "name": "tests", "command": ["node", "--test"], "timeoutSeconds": 600 }
  ],
  "policyPaths": [".skilliton/delivery.json", ".github/workflows/", ".github/CODEOWNERS", "CODEOWNERS"]
}
```

- **schema** must be exactly `skilliton.delivery/1`.
- **protectedBranches** lists plain branch names (`main`, `release/2.x`), with no `refs/` prefix and no wildcards.
- **checks** run in order. `command` is an argument list, never a shell string: `["npm", "test"]`, not `"npm test"`. If you need a shell, say so explicitly: `["sh", "-c", "..."]`. `name` is 1 to 64 letters, digits, spaces or `. _ : + / -`, and unique. `timeoutSeconds` is optional (default 600, at most 86400). An empty list is allowed and means nothing runs.
- **policyPaths** are repository paths; a trailing `/` means a folder and everything in it. The list must cover `.skilliton/delivery.json` itself, or a change to the policy would need no approval. Add any file that controls what the checks do, such as a test configuration or `.gitattributes`, if a quiet change to it should need approval.
- Unknown keys are refused, so a typo cannot silently turn a rule off.

## 2. Which branches are protected

The policy on the repository's **default branch** decides. For a bare repository that is the branch its `HEAD` names (`git --git-dir <repo.git> symbolic-ref HEAD`).

- When the default branch has a valid policy, the branches in its `protectedBranches` are protected. Each protected branch is checked with the policy on **its own** current tip.
- When the default branch does not exist yet, or holds no policy, the default branch alone is protected.
- When the default branch holds an **invalid** policy, the protected branches cannot be determined, so the gate rejects every push until the policy is fixed.
- Every other ref (feature branches, tags) is accepted without checks.

## 3. The local gate

### What it needs

On the machine that holds the shared bare repository: a git version that verifies SSH commit signatures (`gpg.format ssh`, `gpg.ssh.allowedSignersFile`), OpenSSH's `ssh-keygen`, `tar`, Node.js (the runtime targets 18 or later), and the Skilliton workflow plugin (an installed copy or a checkout of your company skills repository). Only git 2.51 and Node.js 25 on one macOS machine have been exercised (see "What has been verified"); minimum versions are not established.

### Set it up

1. **Commit the policy to the default branch first.** The gate accepts a new policy only on a branch it creates. If you install the hook on a repository whose default branch already exists without a policy, every push to that branch is rejected until the policy is added outside the gate.
2. **Write the approvers file.** It uses ssh's `allowed_signers` format, one line per key:

   ```text
   approver-one@example.test ssh-ed25519 AAAAC3Nza...
   ```

   Keep it outside the repository, readable by the account that runs the hook and writable only by the people who manage approvals. It lists public keys only; install refuses a file that holds a private key.
3. **Preview, then install:**

   ```sh
   skilliton delivery install --bare /srv/git/app.git --approvers /srv/git/app.approvers
   skilliton delivery install --bare /srv/git/app.git --approvers /srv/git/app.approvers --apply
   ```

   (From a skills repository checkout, `node scripts/skilliton.mjs delivery install ...` does the same.) The preview shows the hook it will write, the two git config values it will set (`skilliton.approvers`, `skilliton.runtime`) and what the current policy protects. `--runtime <path>` points the hook at a specific `bin/skilliton`; by default it uses the launcher of the plugin you ran install from.

   Install refuses, and writes nothing, when: the folder is not a bare repository; `core.hooksPath` is set (git would never run the hook); `HEAD` does not name a branch; the approvers file is missing, empty, malformed or a private key; the runtime is missing, not executable or cannot run `delivery --help`; or a `pre-receive` hook already exists that install did not write. Running install again replaces its own hook and keeps a copy of the old one under the backup folder (`$SKILLITON_BACKUPS`, default `~/.claude/backups/skilliton/delivery/`).
4. **Approvers sign policy changes.** An approver configures SSH signing in their clone (`git config gpg.format ssh`, `git config user.signingkey <key>`) and signs the commits that change policy paths (`git commit -S`). Everyone else commits as usual.

### What happens on every push

For each update to a protected branch, in this order:

1. Deleting the branch is rejected. An update that does not contain the current tip (a force push) is rejected.
2. The policy is read from the branch's **current** tip, never from the pushed commits. The only exception is the push that creates a protected branch: its tip must contain a valid policy and be signed by an approver, and that policy's checks run.
3. Every pushed commit whose change against its first parent touches a policy path must carry an SSH signature from a key in the approvers file. Other signature types are refused, because the approvers file cannot vouch for them.
4. The pushed tip must still hold a valid policy; otherwise every later push would be rejected.
5. The pushed tip, which is the combined result of everyone's work, is extracted with `git archive` into a temporary folder, and every file is compared with the commit. If `.gitattributes` export rules or content filters changed or dropped a file, the push is rejected rather than checked against something that is not the commit.
6. Each check runs in that folder with its timeout and a minimal environment: `PATH`, a temporary `HOME`, `LANG`. The first failure rejects the push:

   ```text
   remote: skilliton delivery: rejected refs/heads/main: check "tests" failed (exit 1)
   remote:   | <the last 20 lines of the check's output>
   ```

A rejected push updates no ref at all, including other refs in the same push. The hook fails closed: if the runtime path is broken, node is missing, the approvers file is gone, or anything unexpected happens, the push is rejected with the reason.

### Check before you push

```sh
skilliton delivery check                    # the current branch against origin, as last fetched
skilliton delivery check --ref main --remote origin --approvers <allowed_signers>
```

It runs the same evaluation on your committed `HEAD` as a push to that branch, without pushing. Run `git fetch` first: it compares with the remote-tracking tip you last fetched. Uncommitted changes are not part of it. Without `--approvers` it cannot verify signatures on policy changes; it says **NOT CHECKED** and exits 1 instead of reporting a pass.

### What the local gate proves, and what it does not

It proves, for every accepted push to a protected branch: the push was a fast-forward; the checks named by the policy on the previous tip passed on exactly the committed files of the new tip; and every pushed commit that changed a policy path was signed by a key listed in the approvers file at the time of the push.

It does not prove:

- that the checks are good tests, or that anything they do not test works;
- who pushed, or that the person holding an approver key reviewed the change (a signature proves possession of the key);
- anything about refs that are not protected, or about ref changes made on the server without a push (for example `git update-ref` run directly in the bare repository, or another tool writing to it), which do not run hooks;
- isolation: the checks run the pushed code on the server with the permissions of the account that runs the hook. Use an account and machine you are willing to let that code run on.

### Known limits

- A merge commit is compared with its **first** parent. If you merge the protected branch into your work (`git merge main`) after an approved policy change landed there, your merge commit shows that policy change against its first parent and needs an approver signature. Rebase instead, or merge so the protected branch is the first parent.
- Each push is checked with the policy already on the branch, so a check that can never pass (a program that is not installed on the server, for example) blocks every later push to that branch, including the policy change that would fix it. Install the program, or use the administrative recovery below.
- Checks run one at a time and the push waits for them; keep them fast enough to wait for, and set `timeoutSeconds` accordingly. A check that times out is stopped together with the processes it started.
- Repositories whose `.gitattributes` rewrite content on export (`export-subst`, `export-ignore`, line-ending conversion, content filters) are rejected, because the checked files would differ from the committed ones.
- A shared repository owned by a different account than the one that pushes may need git's `safe.directory` setting for the hook's git commands to run; until then every push is rejected. This has not been exercised.
- The hook is a POSIX shell script; a Windows server has not been considered.

### Maintenance and recovery

- **Rotate approvers:** edit the approvers file. The next push uses it.
- **Move the runtime:** run install again with the new `--runtime`.
- **A protected branch that rejects everything** (no policy, or an invalid one, from before the gate): push the fixed commit to an unprotected branch, then an administrator moves the protected branch on the server, for example `git --git-dir /srv/git/app.git update-ref refs/heads/main <fixed commit> <current tip>`. Server-side ref updates do not run hooks, so treat this as an administrative override.
- **Remove the gate:** delete `<repo.git>/hooks/pre-receive` and run `git --git-dir <repo.git> config --remove-section skilliton`.

### A policy or gate from before the rename

Skilliton was named Skillgate before workflow 0.6.0 (docs/BRANDING.md). Two things carry over on a shared repository:

- **A branch whose policy is still at the earlier `.skillgate/delivery.json`** stays protected by it: the gate reads that file in its earlier format while the current `.skilliton/delivery.json` is absent. The project's migration commit moves the policy, so it needs an approver's signature, like any policy change. Every commit that touches either policy file needs that signature, so a weaker policy cannot be added under the other name. The combined result is checked as well: a policy path that differs between the branch's tip and the pushed tip must hold content an approver-signed commit in the push gave it, so a merge cannot quietly bring back the older policy.
- **A `pre-receive` hook written by the earlier release** is left untouched by `delivery install`, which names the steps: move the hook out of the hooks folder, run `git config --unset skillgate.approvers` and `git config --unset skillgate.runtime` in the bare repository, then run install again. Until then the branch keeps the earlier gate, which runs the earlier runtime. Nothing is unprotected in between if the new hook is installed straight after the old one is moved.

Measured in `scripts/delivery.test.mjs` (a policy at the earlier path, real pushes) and `scripts/rename.test.mjs` (install beside an earlier hook).

## 4. The GitHub adapter

**Not verified.** Everything in this section is documented from the template and from GitHub's documented features; no hosted rehearsal has run.

### Set up the workflow

1. Copy `templates/github/skilliton-delivery.yml` from the skills repository to `.github/workflows/skilliton-delivery.yml` in the application repository. Add the application's own setup steps (language runtimes, dependency installs) where the template marks the place.
2. Add a `CODEOWNERS` file that assigns owners to every policy path, including `.github/workflows/` and `.skilliton/delivery.json`.
3. In the branch protection rule (or ruleset) for each protected branch:
   - require the status check **skilliton-delivery**;
   - require branches to be up to date before merging, or use a merge queue, so the checks ran on the combined result that will land;
   - require review from Code Owners;
   - do not allow the rule to be bypassed except by the administrators who decide policy changes.

### What it does

On every pull request it checks out the merge commit GitHub built, and on every merge queue group it checks out the group's commit. It reads `.skilliton/delivery.json` from the base side of that merge, never from the pull request, validates it with the same rules as the local gate, and runs every check with its timeout and a minimal environment. A base branch not listed in its own policy's `protectedBranches` gets no checks and passes. A base branch without a policy fails.

A change that touches any policy path **fails the job on purpose**. The workflow cannot prove who approved a policy change, so such a change needs code-owner review enforced by branch protection, and an administrator who decides policy changes merges it past the failed check.

### What it does not prove

- **Who approved anything.** Approval is GitHub's code-owner review, which this workflow does not inspect.
- **That the workflow itself was not weakened.** A pull request runs its own copy of this file. Only the required code-owner review of `.github/workflows/` stops a pull request from editing the checks away while keeping the job name.
- **That the result is enforced.** Without the branch protection settings above, a failing job is only a red mark.
- **Parity with the local gate.** The local gate is fast-forward only and verifies signatures; the hosted adapter depends on GitHub's merge settings and review rules instead.

## 5. What has been verified

`node scripts/delivery.test.mjs` builds temporary bare repositories and contributor clones with runtime-generated SSH keys and drives the hook with real `git push`. It covers: a passing change accepted; a change that passes alone but fails once combined, rejected with the check's name and output; a forced non-fast-forward push rejected; an unsigned policy change rejected; an approver-signed policy change with failing code rejected by the policy that was current; a non-approver signature rejected; an approver-signed policy change accepted and then governing; an unprotected branch accepted without checks; creating a protected branch with and without a policy and signature; missing and invalid policies; install's refusals and backups; a broken runtime path, missing node, a missing or changed approvers file and malformed hook input all rejecting; a `.gitattributes` rule that would hide tests; the GitHub template's script run locally against simulated merge commits (a simulation, not a hosted rehearsal); and mutation checks showing the key assertions fail when the gate ignores a failing check or a missing signature.

These ran on one macOS development machine. Linux servers, older git, OpenSSH or Node versions, shared-account permissions and GitHub itself have not been exercised.
