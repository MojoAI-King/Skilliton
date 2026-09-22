# Live check: the hosted delivery gate on a throwaway GitHub repository, 2026-09-21

Kind: Reference. The first run of the GitHub adapter (docs/DELIVERY.md section 4) against a real hosted repository: a throwaway public repository under the owner's GitHub account, created for this check with the owner's approval and deleted after the evidence was filed. Everything below is pasted from the run's log (scripted, full output kept) or read from the GitHub API with `gh`. This file answers items 2 and 3 of docs/areas/09-security-delivery/batch-01-hosted-github-adapter.md.

## What was set up

- A small application: `src/add.mjs`, one `node --test` test, `.skilliton/delivery.json` with one check (`["node", "--test", "test/"]`, 600 s), the workflow copied unchanged from `templates/github/skilliton-delivery.yml` to `.github/workflows/skilliton-delivery.yml`, and a `CODEOWNERS` naming the owner.
- Branch protection on `main` as a ruleset, created with `gh api` per section 4's list: pull request required, the status check `skilliton-delivery` required with the strict (up to date) policy, no force-push, no deletion. Response: `ruleset 23799931 active ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']`.

**On the wording of item 2.** The batch says "configured by the adapter". No Skilliton command configures a hosted repository's protection, and none is claimed: the adapter is the workflow file, and the protection was configured by hand (`gh api`) to the settings section 4 prescribes. The item is ticked on that reading, and the batch note says so.

## What happened

1. **A direct push of the defective change to `main` was refused by the ruleset** before any check ran:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Required status check "skilliton-delivery" is expected.
direct push exit 1
```

2. **A pull request carrying the defective change** (`add` made to subtract, so the one test fails) ran the workflow on GitHub's merge commit. The check completed as a failure within a minute:

```
t+15s: COMPLETED FAILURE
```

   The job's log ends:

```
  | # pass 0
  | # fail 1
##[error]check "tests" failed (exit 1)
##[error]Process completed with exit code 1.
```

3. **The pull request is blocked.** Read from the API after the check: `mergeable MERGEABLE state BLOCKED; checks: skilliton-delivery=FAILURE`. `gh pr merge --merge` did not merge it; it answered that the requirements were not met and offered `--auto` (wait) or `--admin` (override). Read again afterwards: `OPEN mergedAt=null BLOCKED`.

## What this proves, and what it does not

- Proves: the workflow template runs unchanged on GitHub, reads the base branch's policy, runs the check on the combined result, and fails on a defective change; with the ruleset from section 4, that failure blocks the merge and a direct push is refused outright.
- Does not prove: a clean change merging (not run; the point was the block), the merge queue path, or anything about who approved what. The `--admin` override exists by GitHub's design and is the reason section 4 says the rule must not be bypassable except by the people who decide policy.
- Not measured: the "policy path touched" branch of the workflow (a change to `.skilliton/delivery.json` or the workflow itself failing on purpose).

## The throwaway repository

`skilliton-throwaway-app`, public, under the owner's account, one pull request, deleted once this file and the batch tick were committed. No credential was used beyond the owner's own `gh` login.
